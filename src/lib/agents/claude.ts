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

/**
 * Repère de la clé utilisée, comparable à la console Anthropic (Settings → API Keys
 * affiche le début et la fin de chaque clé) : jamais la clé elle-même.
 */
export function keyHint(apiKey: string | null) {
  if (!apiKey || apiKey.length < 12) return null;
  const prefix = apiKey.match(/^sk-ant-[a-z]+\d*-/)?.[0] ?? "";
  return `${prefix}…${apiKey.slice(-4)}`;
}

/** Organisation Anthropic de la clé, renvoyée par l'API dans chaque réponse (identifiant non secret). */
function organisationOf(headers: unknown) {
  return headers instanceof Headers ? headers.get("anthropic-organization-id") : null;
}

/** Message clair pour une erreur de l'API Claude (jamais la clé). */
export function describeClaudeError(error: unknown): { message: string; status: number } | null {
  if (error instanceof Anthropic.AuthenticationError) {
    return { message: "Clé ANTHROPIC_API_KEY refusée par l'API Claude (clé supprimée ou mal copiée).", status: 502 };
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return { message: "Clé ANTHROPIC_API_KEY sans accès à ce modèle ou à cette organisation.", status: 502 };
  }
  // Pas de classe dédiée : un solde insuffisant est un 400 dont le message cite le crédit.
  if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) {
    const org = organisationOf(error.headers);
    const cle = keyHint(getAgentsConfig().apiKey);
    return {
      message:
        "Crédit Anthropic épuisé pour la clé utilisée : rechargez sur console.anthropic.com (Billing) l'organisation de cette clé." +
        (org || cle ? ` Organisation ${org ?? "inconnue"}, clé ${cle ?? "inconnue"}.` : "") +
        " Aucune analyse n'a été facturée.",
      status: 402,
    };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { message: "Limite d'usage de l'API Claude atteinte, réessayez plus tard.", status: 429 };
  }
  if (error instanceof Anthropic.APIError) {
    return { message: `Erreur API Claude (${error.status ?? "réseau"}).`, status: 502 };
  }
  return null;
}

export type ClaudeProbe =
  | { ok: true; model: string; organisation: string | null; cle: string | null }
  | { ok: false; message: string };

/**
 * Vérification gratuite de la clé : lecture de la fiche du modèle (aucun
 * jeton consommé). Ne dit rien du solde, qui ne se lit que dans la console.
 */
export async function probeClaude(): Promise<ClaudeProbe | null> {
  const { apiKey, model, configured } = getAgentsConfig();
  if (!configured) return null;
  try {
    const client = new Anthropic({ apiKey: apiKey ?? undefined, timeout: 10_000, maxRetries: 0 });
    const { data: info, response } = await client.models.retrieve(model).withResponse();
    return {
      ok: true,
      model: info.display_name || info.id,
      organisation: response.headers.get("anthropic-organization-id"),
      cle: keyHint(apiKey),
    };
  } catch (error) {
    if (error instanceof Anthropic.NotFoundError) {
      return { ok: false, message: `Modèle « ${model} » inconnu de l'API : vérifiez BOS_AGENTS_MODEL` };
    }
    return { ok: false, message: describeClaudeError(error)?.message ?? "API Claude injoignable" };
  }
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
              "Brouillon d'e-mail si l'action consiste à écrire à un client ou au client d'une facture, sinon null. N'invente jamais d'adresse : désigne seulement le client ou la facture par son id.",
            anyOf: [
              {
                type: "object",
                properties: {
                  cible: {
                    type: "string",
                    enum: ["client", "facture"],
                    description: "client : écrire au contact du client ; facture : écrire au client de la facture (relance).",
                  },
                  refId: { type: "string", description: "id du client ou de la facture (champ id des données)." },
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
                  refId: { type: "string", description: "id du client, de la mission ou de la facture." },
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

/** Données du cockpit transmises à l'agent, sans adresses ni téléphones (minimisation RGPD). */
export async function buildAgentContext(repo: Repository) {
  const [clients, missions, factures, paiements, indicateurs] = await Promise.all([
    repo.getClients(),
    repo.getMissions(),
    repo.getInvoices(),
    repo.getPayments(),
    repo.getMetrics(),
  ]);
  return {
    aujourdhui: new Date().toISOString().slice(0, 10),
    // Coordonnées masquées : seul compte le fait qu'un e-mail soit possible.
    clients: clients.map((client) => {
      const copy: Partial<typeof client> & { emailConnu: boolean } = {
        ...client,
        emailConnu: Boolean(client.email),
      };
      delete copy.email;
      delete copy.telephone;
      return copy;
    }),
    missions,
    factures: factures.map((invoice) => {
      const copy: Partial<typeof invoice> & { emailClientConnu: boolean } = {
        ...invoice,
        emailClientConnu: Boolean(invoice.emailClient),
      };
      delete copy.emailClient;
      return copy;
    }),
    // Références bancaires inutiles à l'analyse.
    paiements: paiements.map(({ reference: _reference, ...p }) => {
      void _reference;
      return p;
    }),
    indicateurs,
  };
}

function systemPrompt(agent: Agent) {
  return [
    `Tu es « ${agent.nom} », agent du moteur ${brand.product} de l'agence ${brand.agency}, qui conçoit et déploie des agents IA et des automatisations pour les entreprises.`,
    `Ton rôle : ${agent.role}. Niveau d'autonomie : ${agent.autonomy} (tier ${agent.tier}).`,
    "Tu analyses les données du cockpit fournies (clients, missions, factures, paiements, indicateurs) et tu proposes des actions ; tu n'exécutes rien toi-même.",
    "Appuie-toi uniquement sur les données fournies : si une information manque, dis-le dans le résumé plutôt que de la supposer. S'il n'y a encore aucune donnée, dis-le simplement et ne propose rien.",
    "Pour écrire à un client ou au client d'une facture, joins un brouillon d'e-mail complet (champ email) : il sera relu et envoyé par un humain. Seulement si emailConnu (client) ou emailClientConnu (facture) vaut true. Ton professionnel et courtois, vouvoiement.",
    "Si l'action consiste à mettre à jour un statut (client sans activité depuis longtemps, mission livrée, facture échue à passer en relance…), renseigne le champ operation. Une action peut combiner un e-mail et un changement de statut (ex. relance envoyée et facture passée en « relance »). Ne propose jamais un statut déjà en place. Les paiements, signatures et annulations restent des gestes humains : ne les propose pas comme opération.",
    "Montants : HT pour les missions, TTC pour les paiements et le reste dû des factures.",
    "Réponds en français.",
  ].join("\n");
}

/** Ids réellement présents dans les données : un brouillon ou une opération vers un autre id est écarté. */
export interface KnownRefs {
  /** Clients qui ont une adresse e-mail (cibles d'un brouillon). */
  clients: Set<string>;
  /** Factures dont le client a une adresse e-mail (cibles d'un brouillon). */
  factures: Set<string>;
  /** Tous les clients, missions et factures (cibles d'un changement de statut). */
  tousClients?: Set<string>;
  missions?: Set<string>;
  toutesFactures?: Set<string>;
}

function normalizeOperation(raw: AgentProposal["actions"][number]["operation"], refs?: KnownRefs) {
  if (!raw || !refs || !isOperationType(raw.type) || !isAllowedValue(raw.type, raw.valeur)) return undefined;
  const known =
    raw.type === "statut_client"
      ? refs.tousClients
      : raw.type === "statut_mission"
        ? refs.missions
        : refs.toutesFactures;
  if (!known?.has(raw.refId)) return undefined;
  return { type: raw.type, refId: raw.refId, valeur: raw.valeur };
}

function normalizeEmail(raw: AgentProposal["actions"][number]["email"], refs?: KnownRefs) {
  if (!raw || !refs) return undefined;
  const objet = raw.objet?.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_SUBJECT);
  const corps = raw.corps?.trim().slice(0, MAX_BODY);
  const known = raw.cible === "client" ? refs.clients : raw.cible === "facture" ? refs.factures : null;
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
    const described = describeClaudeError(error);
    if (described) throw new AgentRunError(described.message, described.status);
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

  const [clients, missions, invoices] = await Promise.all([
    repo.getClients(),
    repo.getMissions(),
    repo.getInvoices(),
  ]);
  const proposal = normalizeProposal(agent, parsed, {
    clients: new Set(clients.filter((c) => c.email).map((c) => c.id)),
    factures: new Set(invoices.filter((i) => i.emailClient).map((i) => i.id)),
    tousClients: new Set(clients.map((c) => c.id)),
    missions: new Set(missions.map((m) => m.id)),
    toutesFactures: new Set(invoices.map((i) => i.id)),
  });
  return repo.recordAgentRun(agent.id, proposal, response.model);
}
