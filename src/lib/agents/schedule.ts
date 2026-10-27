/**
 * Agents planifiés : un planificateur externe (GitHub Actions, cron hPanel…)
 * appelle POST /api/agents/planifie avec le secret BOS_CRON_SECRET.
 * Garde-fous : verrou exclusif, intervalle minimal par agent, et aucun nouvel
 * appel pour un agent dont des propositions attendent une validation humaine.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { Repository } from "@/lib/data";
import type { Agent, AgentAction, AgentRunLog } from "@/lib/types";

export const MIN_CRON_SECRET_LENGTH = 32;
export const DEFAULT_INTERVAL_HOURS = 20;
export const SCHEDULE_LOCK = "agents-planifies";

export function getScheduleConfig() {
  const secret = process.env.BOS_CRON_SECRET?.trim() || null;
  const only = (process.env.BOS_AGENTS_PLANIFIES ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hours = Number(process.env.BOS_AGENTS_INTERVALLE_HEURES);
  return {
    secret,
    configured: Boolean(secret && secret.length >= MIN_CRON_SECRET_LENGTH),
    secretTooShort: Boolean(secret && secret.length < MIN_CRON_SECRET_LENGTH),
    /** Agents planifiés ; vide = tous. */
    agentIds: only,
    intervalHours: Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_INTERVAL_HOURS,
  };
}

/** Compare `Authorization: Bearer <secret>` sans fuite de timing. */
export function isCronAuthorized(header: string | null) {
  const { secret, configured } = getScheduleConfig();
  if (!configured || !secret || !header) return false;
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return false;
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export interface PlannedAgent {
  agentId: string;
  nom: string;
  decision: "lancer" | "ignorer";
  raison: string;
}

/** Décide, pour chaque agent, s'il doit tourner maintenant. Fonction pure (testée). */
export function planScheduledRun(input: {
  agents: Agent[];
  actions: AgentAction[];
  runs: AgentRunLog[];
  agentIds: string[];
  intervalHours: number;
  now?: number;
}): PlannedAgent[] {
  const now = input.now ?? Date.now();
  const intervalMs = input.intervalHours * 3_600_000;
  const selected = input.agentIds.length
    ? input.agents.filter((a) => input.agentIds.includes(a.id))
    : input.agents;

  return selected.map((agent) => {
    const base = { agentId: agent.id, nom: agent.nom };
    if (agent.status === "pause") {
      return { ...base, decision: "ignorer", raison: "agent en pause" };
    }
    const pending = input.actions.filter(
      (a) => a.agentId === agent.id && a.requiresHitl && a.hitlStatus === "pending",
    ).length;
    if (pending) {
      return {
        ...base,
        decision: "ignorer",
        raison: `${pending} proposition(s) en attente de validation`,
      };
    }
    const last = input.runs.find((r) => r.agentId === agent.id && r.statut === "succes");
    if (last && now - Date.parse(last.debut) < intervalMs) {
      return {
        ...base,
        decision: "ignorer",
        raison: `déjà analysé le ${new Date(last.debut).toISOString().slice(0, 16).replace("T", " ")} UTC`,
      };
    }
    return { ...base, decision: "lancer", raison: last ? "intervalle écoulé" : "première analyse" };
  });
}

export async function buildPlan(repo: Repository) {
  const config = getScheduleConfig();
  const [agents, actions, runs] = await Promise.all([
    repo.getAgents(),
    repo.getAgentActions(),
    repo.getAgentRuns(200),
  ]);
  return planScheduledRun({
    agents,
    actions,
    runs,
    agentIds: config.agentIds,
    intervalHours: config.intervalHours,
  });
}

export interface ScheduledResult {
  agentId: string;
  statut: AgentRunLog["statut"];
  message: string;
}

/**
 * Exécute le plan l'un après l'autre sous verrou. `null` si une exécution
 * planifiée est déjà en cours (verrou pris).
 */
export async function executeScheduledRun(
  repo: Repository,
  run: (agentId: string) => Promise<{ actions: unknown[] } | null>,
): Promise<ScheduledResult[] | null> {
  const locked = await repo.withLock(SCHEDULE_LOCK, async () => {
    // Plan recalculé sous verrou : deux appels simultanés ne lancent rien en double.
    const plan = await buildPlan(repo);
    const results: ScheduledResult[] = [];
    for (const item of plan) {
      if (item.decision === "ignorer") {
        results.push({ agentId: item.agentId, statut: "ignore", message: item.raison });
        continue;
      }
      try {
        const out = await run(item.agentId);
        results.push({
          agentId: item.agentId,
          statut: "succes",
          message: `${out?.actions.length ?? 0} action(s) proposée(s)`,
        });
      } catch (error) {
        results.push({
          agentId: item.agentId,
          statut: "echec",
          message: error instanceof Error ? error.message : "Erreur",
        });
      }
    }
    return results;
  });
  return locked ? locked.value : null;
}
