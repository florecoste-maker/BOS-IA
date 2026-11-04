/**
 * Analyses IA lancées depuis le cockpit, exécutées en arrière-plan.
 *
 * Une analyse Claude peut durer plus d'une minute : derrière le CDN et le
 * proxy Hostinger, une requête HTTP aussi longue risque d'être coupée et le
 * navigateur ne recevrait jamais le résultat. Le clic démarre donc l'analyse
 * (réponse immédiate avec un identifiant) et la page vient chercher le
 * résultat. Mémoire du processus : un redémarrage efface les analyses en cours
 * (la page le signale), le journal des exécutions garde la trace.
 */
import { randomUUID } from "node:crypto";

export type AgentJob =
  | { statut: "en_cours"; agentId: string; debut: number }
  | { statut: "succes"; agentId: string; debut: number; run: unknown }
  | { statut: "echec"; agentId: string; debut: number; erreur: string; code: number };

/** Une analyse terminée reste lisible une heure. */
const JOB_TTL_MS = 60 * 60 * 1000;

const registry = globalThis as typeof globalThis & { __bosAgentJobs?: Map<string, AgentJob> };

function jobs() {
  return (registry.__bosAgentJobs ??= new Map());
}

function purge(now: number) {
  for (const [id, job] of jobs()) if (now - job.debut > JOB_TTL_MS) jobs().delete(id);
}

/** Analyse déjà en cours pour cet agent (double clic, deux onglets) : la même est reprise. */
export function runningJobFor(agentId: string) {
  for (const [id, job] of jobs()) if (job.agentId === agentId && job.statut === "en_cours") return id;
  return null;
}

export function startJob(agentId: string, now = Date.now()) {
  purge(now);
  const id = `analyse-${randomUUID()}`;
  jobs().set(id, { statut: "en_cours", agentId, debut: now });
  return id;
}

export function finishJob(id: string, result: { run: unknown } | { erreur: string; code: number }) {
  const job = jobs().get(id);
  if (!job) return;
  jobs().set(id, "run" in result ? { ...job, statut: "succes", run: result.run } : { ...job, statut: "echec", ...result });
}

export function getJob(id: string) {
  return jobs().get(id) ?? null;
}
