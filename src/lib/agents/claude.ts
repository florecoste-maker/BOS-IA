/**
 * Exécution réelle des agents BOS-IA via l'API Claude.
 * L'agent analyse les données du cockpit et PROPOSE des actions ; rien n'est
 * exécuté automatiquement. Les actions sensibles passent par la file HITL.
 */
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { brand } from "@/lib/brand";
import { getRepository, type Repository } from "@/lib/data";
import { OPERATIONS, isAllowedValue, isOperationType } from "@/lib/actions/operations";
import type { Agent, AgentRunLog, EmailDraft, StatusOperation } from "@/lib/types";

export const DEFAULT_AGENTS_MODEL = "claude-opus-5-5";
const MAX_ACTIONS = 3;

export function getAgentsConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
  const model = process.env.BOS_AGENTS_MODEL?.trim() || DEFAULT_AGENTS_MODEL;
  return { apiKey, model, configured: Boolean(apiKey) };
}

export interface AgentProposal {
  resume: string;
  actions: Array<{
    type: string;
    description: string;
    requiresHitl: boolean;
    email?: EmailDraft | null;
    operation?: StatusOperation | null;
  }>;
}

const MAX_SUBJECT = 200;
const MAX_BODY = 5000;

const proposalSchema = {
  type: "object",
  properties: {
    resume: { type: "string", description: "Synthèse de l'analyse en 1 à 3 phrases." },
    actions: {
      type: "array",
      description: `Au plus ${MAX_ACTIONS} actions proposées, les plus utiles d'abord.`,
      items: {
        type: "object",
        properties: {
          type: { type: "string", description: "Identifiant court en snake_case." },
          description: { type: "string", description: "Action concrète et vérifiable." },
          requiresHitl: {
            type: "boolean",
            description: "true si l'action touche un client, de l'argent ou des données personnelles.",
          },
          email: {
            description:
              "Brouillon d'e-mail si l'action consiste à écrire à un apprenant ou au client d'une facture, sinon null. N'invente jamais d'adresse : désigne seulement l'apprenant ou la facture par son id.",
            anyOf: [
              {
                type: "object",
                properties: {
                  cible: {
                    type: "string",
                    enum: ["apprenant", "facture"],
                    description: "apprenant : écrire à l'apprenant ; facture : écrire au client de la facture.",
                  },
                  refId: { type: "string", description: "id de l'apprenant ou de la facture (champ id des données)." },
                  objet: { type: "string", description: "Objet de l'e-mail." },
                  corps: {
                    type: "string",
                    description: `Texte complet de l'e-mail, prêt à envoyer, signé « L'équipe ${brand.agency} ».`,
                  },
                },
                required: ["cible", "refId", "objet", "corps"],
                additionalProperties: false,
              },
              { type: "null" },
            ],
          },
          operation: {
            description:
              "Changement de statut à appliquer après validation humaine, sinon null. Seulement sur une fiche existante (id des données) et avec une valeur de la liste.",
            anyOf: [
              {
                type: "object",
                properties: {
                  type: { type: "string", enum: Object.keys(OPERATIONS) },
                  refId: { type: "string", description: "id de l'apprenant, du dossier OPCO ou de la facture." },
                  valeur: {
                    type: "string",
                    description: Object.entries(OPERATIONS)
                      .map(([type, o]) => `${type} : ${o.valeurs.join(", ")}`)
                      .join(" ; "),
                  },
                },
                required: ["type", "refId", "valeur"],
                additionalProperties: false,
              },
              { type: "null" },
            ],
          },
        },
        required: ["type", "description", "requiresHitl", "email", "operation"],
        additionalProperties: false,
      },
    },
  },
  required: ["resume", "actions"],
  additionalProperties: false,
} as const;

/** Données du cockpit transmises à l'agent, sans e-mails (minimisation RGPD). */
export async function buildAgentContext(repo: Repository) {
  const [sessions, learners, dossiersOpco, factures, indicateurs] = await Promise.all([
    repo.getSessions(),
    repo.getLearners(),
    repo.getOpcoDossiers(),
    repo.getInvoices(),
    repo.getMetrics(),
  ]);
  return {
    sessions,
    apprenants: learners.map((learner) => {
      const copy: Partial<typeof learner> = { ...learner };
      delete copy.email;
      return copy;
    }),
    dossiersOpco,
    // Adresse du client masquée : seul compte le fait qu'une relance soit possible.
    factures: factures.map((invoice) => {
      const copy: Partial<typeof invoice> & { emailClientConnu: boolean } = {
        ...invoice,
        emailClientConnu: Boolean(invoice.emailClient),
      };
      delete copy.emailClient;
      return copy;
    }),
    indicateurs,
  };
}

function systemPrompt(agent: Agent) {
  return [
    `Tu es « ${agent.nom} », agent du moteur ${brand.product} de l'agence ${brand.agency} (organisme de formation).`,
    `Ton rôle : ${agent.role}. Niveau d'autonomie : ${agent.autonomy} (tier ${agent.tier}).`,
    "Tu analyses les données du cockpit fournies et tu proposes des actions ; tu n'exécutes rien toi-même.",
    "Appuie-toi uniquement sur les données fournies : si une information manque, dis-le dans le résumé plutôt que de la supposer.",
    "Pour écrire à un apprenant ou au client d'une facture, joins un brouillon d'e-mail complet (champ email) : il sera relu et envoyé par un humain. Pour une facture, seulement si emailClientConnu vaut true. Ton professionnel et courtois, vouvoiement.",
    "Si l'action consiste à mettre à jour un statut (apprenant inactif depuis longtemps, dossier OPCO complet à transmettre, facture à passer en relance…), renseigne le champ operation. Une action peut combiner un e-mail et un changement de statut (ex. relance envoyée et facture passée en « relance »). Ne propose jamais un statut déjà en place.",
    "Réponds en français.",
  ].join("\n");
}

/** Ids réellement présents dans les données : un brouillon ou une opération vers un autre id est écarté. */
export interface KnownRefs {
  apprenants: Set<string>;
  /** Factures dont le client a une adresse e-mail (cibles d'un brouillon). */
  factures: Set<string>;
  /** Toutes les factures et dossiers (cibles d'un changement de statut). */
  toutesFactures?: Set<string>;
  dossiers?: Set<string>;
}

function normalizeOperation(raw: AgentProposal["actions"][number]["operation"], refs?: KnownRefs) {
  if (!raw || !refs || !isOperationType(raw.type) || !isAllowedValue(raw.type, raw.valeur)) return undefined;
  const known =
    raw.type === "statut_apprenant"
      ? refs.apprenants
      : raw.type === "statut_dossier"
        ? refs.dossiers
        : refs.toutesFactures;
  if (!known?.has(raw.refId)) return undefined;
  return { type: raw.type, refId: raw.refId, valeur: raw.valeur };
}

function normalizeEmail(raw: AgentProposal["actions"][number]["email"], refs?: KnownRefs) {
  if (!raw || !refs) return undefined;
  const objet = raw.objet?.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_SUBJECT);
  const corps = raw.corps?.trim().slice(0, MAX_BODY);
  const known = raw.cible === "apprenant" ? refs.apprenants : raw.cible === "facture" ? refs.factures : null;
  if (!known || !known.has(raw.refId) || !objet || !corps) return undefined;
  return { cible: raw.cible, refId: raw.refId, objet, corps };
}

/** Applique les garde-fous serveur, quelle que soit la réponse du modèle. */
export function normalizeProposal(agent: Agent, raw: AgentProposal, refs?: KnownRefs): AgentProposal {
  const forceHitl = agent.hitlObligatoire || agent.risque === "eleve";
  return {
    resume: raw.resume.trim().slice(0, 600),
    actions: raw.actions
      .filter((a) => a.type.trim() && a.description.trim())
      .slice(0, MAX_ACTIONS)
      .map((a) => {
        const email = normalizeEmail(a.email, refs);
        const operation = normalizeOperation(a.operation, refs);
        return {
          type: a.type.trim().slice(0, 60),
          description: a.description.trim().slice(0, 600),
          // Un e-mail ou un changement de statut passe toujours par la validation humaine.
          requiresHitl: forceHitl || a.requiresHitl || Boolean(email) || Boolean(operation),
          ...(email ? { email } : {}),
          ...(operation ? { operation } : {}),
        };
      }),
  };
}

export class AgentRunError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Lance l'analyse d'un agent et la journalise (succès ou échec) dans l'historique.
 * `declencheur` : clic dans le cockpit (manuel) ou planificateur (planifie).
 */
export async function runAgent(agentId: string, declencheur: AgentRunLog["declencheur"] = "manuel") {
  const repo = await getRepository();
  const agent = (await repo.getAgents()).find((a) => a.id === agentId);
  if (!agent) throw new AgentRunError("Agent introuvable", 404);

  const debut = new Date().toISOString();
  const log = (entry: Pick<AgentRunLog, "statut" | "message" | "actions" | "model">) =>
    repo
      .logAgentRun({
        id: `run-${randomUUID()}`,
        agentId,
        declencheur,
        debut,
        fin: new Date().toISOString(),
        ...entry,
      })
      .catch((error) => console.error("Journal d'exécution d'agent non enregistré", error));

  try {
    const run = await analyse(repo, agent);
    await log({
      statut: "succes",
      message: run?.resume ?? "",
      actions: run?.actions.length ?? 0,
      model: run?.model,
    });
    return run;
  } catch (error) {
    const message = error instanceof AgentRunError ? error.message : "Erreur interne";
    await log({ statut: "echec", message, actions: 0 });
    throw error;
  }
}

async function analyse(repo: Repository, agent: Agent) {

  const { apiKey, model, configured } = getAgentsConfig();
  if (!configured) {
    throw new AgentRunError(
      process.env.VERCEL
        ? "Agents IA non connectés : ajoutez ANTHROPIC_API_KEY dans Vercel (Settings → Environment Variables) puis redéployez."
        : "Agents IA non connectés : ajoutez ANTHROPIC_API_KEY dans hPanel puis redéployez.",
      503,
    );
  }

  const client = new Anthropic({ apiKey: apiKey ?? undefined });
  let response;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: proposalSchema },
      },
      system: systemPrompt(agent),
      messages: [
        {
          role: "user",
          content: `Données du cockpit (JSON) :\n${JSON.stringify(await buildAgentContext(repo))}\n\nAnalyse-les selon ton rôle et propose tes actions.`,
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AgentRunError("Clé ANTHROPIC_API_KEY refusée par l'API Claude.", 502);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AgentRunError("Limite d'usage de l'API Claude atteinte, réessayez plus tard.", 429);
    }
    if (error instanceof Anthropic.APIError) {
      throw new AgentRunError(`Erreur API Claude (${error.status ?? "réseau"}).`, 502);
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new AgentRunError("Le modèle a refusé cette analyse.", 422);
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text" || response.stop_reason === "max_tokens") {
    throw new AgentRunError("Réponse de l'agent incomplète.", 502);
  }

  let parsed: AgentProposal;
  try {
    parsed = JSON.parse(text.text) as AgentProposal;
  } catch {
    throw new AgentRunError("Réponse de l'agent illisible.", 502);
  }

  const [learners, invoices, dossiers] = await Promise.all([
    repo.getLearners(),
    repo.getInvoices(),
    repo.getOpcoDossiers(),
  ]);
  const proposal = normalizeProposal(agent, parsed, {
    apprenants: new Set(learners.map((l) => l.id)),
    factures: new Set(invoices.filter((i) => i.emailClient).map((i) => i.id)),
    toutesFactures: new Set(invoices.map((i) => i.id)),
    dossiers: new Set(dossiers.map((d) => d.id)),
  });
  return repo.recordAgentRun(agent.id, proposal, response.model);
}
