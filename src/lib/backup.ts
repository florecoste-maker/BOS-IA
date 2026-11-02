/**
 * Sauvegarde complète des données du cockpit (JSON). Les données métier sont
 * intégrales ; le journal des agents est limité aux 200 dernières entrées.
 * Restauration : réimporter les CSV (Import → Exporter), au même format que l'import.
 */
import { gzipSync } from "node:zlib";
import type { Repository } from "@/lib/data";

export const BACKUP_VERSION = 2;

export async function buildBackup(repo: Repository) {
  const [clients, missions, invoices, payments, agents, actions, runs] = await Promise.all([
    repo.getClients(),
    repo.getMissions(),
    repo.getInvoices(),
    repo.getPayments(),
    repo.getAgents(),
    repo.getAgentActions(),
    repo.getAgentRuns(200),
  ]);
  return {
    format: "bos-ia-sauvegarde",
    version: BACKUP_VERSION,
    exporteLe: new Date().toISOString(),
    mode: repo.mode,
    donnees: { clients, missions, factures: invoices, paiements: payments },
    agents: { agents, actions, executions: runs },
    totaux: {
      clients: clients.length,
      missions: missions.length,
      factures: invoices.length,
      paiements: payments.length,
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
