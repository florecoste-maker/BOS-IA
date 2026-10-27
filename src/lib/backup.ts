/**
 * Sauvegarde complète des données du cockpit (JSON). Les données métier sont
 * intégrales ; le journal des agents est limité aux 200 dernières entrées.
 * Restauration : réimporter les CSV (Import → Exporter), au même format que l'import.
 */
import { gzipSync } from "node:zlib";
import type { Repository } from "@/lib/data";

export const BACKUP_VERSION = 1;

export async function buildBackup(repo: Repository) {
  const [sessions, learners, dossiers, invoices, agents, actions, runs] = await Promise.all([
    repo.getSessions(),
    repo.getLearners(),
    repo.getOpcoDossiers(),
    repo.getInvoices(),
    repo.getAgents(),
    repo.getAgentActions(),
    repo.getAgentRuns(200),
  ]);
  return {
    format: "bos-ia-sauvegarde",
    version: BACKUP_VERSION,
    exporteLe: new Date().toISOString(),
    mode: repo.mode,
    donnees: { sessions, apprenants: learners, dossiersOpco: dossiers, factures: invoices },
    agents: { agents, actions, executions: runs },
    totaux: {
      sessions: sessions.length,
      apprenants: learners.length,
      dossiersOpco: dossiers.length,
      factures: invoices.length,
    },
  };
}

export function backupFileName(date = new Date()) {
  return `bos-ia-sauvegarde-${date.toISOString().slice(0, 10)}.json`;
}

/** Pièce jointe compressée pour l'envoi hebdomadaire par e-mail. */
export function gzipBackup(backup: Awaited<ReturnType<typeof buildBackup>>) {
  return gzipSync(Buffer.from(JSON.stringify(backup, null, 1), "utf8"));
}
