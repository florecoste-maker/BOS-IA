/**
 * Exécution réelle des agents BOS-IA via l'API Claude.
 * L'agent analyse les données du cockpit et PROPOSE des actions ; rien n'est
 * exécuté automatiquement. Les actions sensibles passent par la file HITL.
 */
import Anthropic from "@anthropic-ai/sdk";
import { brand } from "@/lib/brand";
import { store } from "@/lib/store";
import type { Agent } from "@/lib/types";

export const DEFAULT_AGENTS_MODEL = "claude-opus-5-5";
const MAX_ACTIONS = 3;

export function getAgentsConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
  const model = process.env.BOS_AGENTS_MODEL?.trim() || DEFAULT_AGENTS_MODEL;
  return { apiKey, model, configured: Boolean(apiKey) };
}

export interface AgentProposal {
  resume: string;
  actions: Array<{ type: string; description: string; requiresHitl: boolean }>;
}

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
        },
        required: ["type", "description", "requiresHitl"],
        additionalProperties: false,
      },
    },
  },
  required: ["resume", "actions"],
  additionalProperties: false,
} as const;

/** Données du cockpit transmises à l'agent, sans e-mails (minimisation RGPD). */
export function buildAgentContext() {
  return {
    sessions: store.getSessions(),
    apprenants: store.getLearners().map((learner) => {
      const copy: Partial<typeof learner> = { ...learner };
      delete copy.email;
      return copy;
    }),
    dossiersOpco: store.getOpcoDossiers(),
    factures: store.getInvoices(),
    indicateurs: store.getMetrics(),
  };
}

function systemPrompt(agent: Agent) {
  return [
    `Tu es « ${agent.nom} », agent du moteur ${brand.product} de l'agence ${brand.agency} (organisme de formation).`,
    `Ton rôle : ${agent.role}. Niveau d'autonomie : ${agent.autonomy} (tier ${agent.tier}).`,
    "Tu analyses les données du cockpit fournies et tu proposes des actions ; tu n'exécutes rien toi-même.",
    "Appuie-toi uniquement sur les données fournies : si une information manque, dis-le dans le résumé plutôt que de la supposer.",
    "Réponds en français.",
  ].join("\n");
}

/** Applique les garde-fous serveur, quelle que soit la réponse du modèle. */
export function normalizeProposal(agent: Agent, raw: AgentProposal): AgentProposal {
  const forceHitl = agent.hitlObligatoire || agent.risque === "eleve";
  return {
    resume: raw.resume.trim().slice(0, 600),
    actions: raw.actions
      .filter((a) => a.type.trim() && a.description.trim())
      .slice(0, MAX_ACTIONS)
      .map((a) => ({
        type: a.type.trim().slice(0, 60),
        description: a.description.trim().slice(0, 600),
        requiresHitl: forceHitl || a.requiresHitl,
      })),
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

export async function runAgent(agentId: string) {
  const agent = store.getAgents().find((a) => a.id === agentId);
  if (!agent) throw new AgentRunError("Agent introuvable", 404);

  const { apiKey, model, configured } = getAgentsConfig();
  if (!configured) {
    throw new AgentRunError(
      "Agents IA non connectés : ajoutez ANTHROPIC_API_KEY dans hPanel puis redéployez.",
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
          content: `Données du cockpit (JSON) :\n${JSON.stringify(buildAgentContext())}\n\nAnalyse-les selon ton rôle et propose tes actions.`,
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

  const proposal = normalizeProposal(agent, parsed);
  return store.recordAgentRun(agent.id, proposal, response.model);
}
