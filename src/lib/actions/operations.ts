/**
 * Changements de statut qu'un agent peut proposer et qui s'appliquent après
 * validation humaine. Liste fermée : ce qui engage de l'argent ou une
 * certification (payée, certifié, dossier payé) reste un geste humain.
 */
import type { InvoiceStatus, LearnerStatus, OperationType, OpcoStatus } from "@/lib/types";

export const OPERATIONS: Record<
  OperationType,
  { libelle: string; cible: string; valeurs: readonly string[] }
> = {
  statut_apprenant: {
    libelle: "Statut de l'apprenant",
    cible: "apprenant",
    valeurs: ["lead", "inscrit", "en_formation", "inactif", "abandon"] satisfies LearnerStatus[],
  },
  statut_dossier: {
    libelle: "Statut du dossier OPCO",
    cible: "dossier OPCO",
    valeurs: ["brouillon", "completude", "transmis", "accepte", "refuse"] satisfies OpcoStatus[],
  },
  statut_facture: {
    libelle: "Statut de la facture",
    cible: "facture",
    valeurs: ["emise", "acompte_paye", "solde_du", "relance", "impayee"] satisfies InvoiceStatus[],
  },
};

export function isOperationType(value: unknown): value is OperationType {
  return typeof value === "string" && value in OPERATIONS;
}

export function isAllowedValue(type: OperationType, valeur: unknown): valeur is string {
  return typeof valeur === "string" && OPERATIONS[type].valeurs.includes(valeur);
}

/** Valeur choisie par l'humain à l'approbation, gardée seulement si elle est autorisée. */
export function editedOperation<T extends { type: OperationType; valeur: string }>(op: T, valeur?: string): T {
  return valeur && isAllowedValue(op.type, valeur) ? { ...op, valeur } : op;
}
