/**
 * Règles partagées (serveur et navigateur) sur les actions HITL : modifications
 * humaines d'un brouillon et possibilité de relancer un envoi.
 */
import type { ActionExecution } from "@/lib/types";

/** Un envoi bloqué « en cours » (redémarrage pendant l'envoi) peut être relancé après ce délai. */
export const STALE_EXECUTION_MS = 10 * 60 * 1000;

export function isRetryable(execution: ActionExecution, now = Date.now()) {
  if (execution.statut === "echec" || execution.statut === "a_faire") return true;
  return execution.statut === "en_cours" && now - Date.parse(execution.le) > STALE_EXECUTION_MS;
}

/** Modifications humaines d'un brouillon : objet et texte seulement, bornés. */
export function cleanEdits(edits?: { objet?: string; corps?: string }) {
  const out: { objet?: string; corps?: string } = {};
  const objet = edits?.objet?.replace(/[\r\n]+/g, " ").trim();
  const corps = edits?.corps?.trim();
  if (objet) out.objet = objet.slice(0, 200);
  if (corps) out.corps = corps.slice(0, 5000);
  return out;
}
