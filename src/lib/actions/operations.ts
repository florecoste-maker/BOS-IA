/**
 * Changements de statut qu'un agent peut proposer et qui s'appliquent après
 * validation humaine. Liste fermée : ce qui engage l'agence ou de l'argent
 * (mission signée ou annulée, facture payée ou annulée) reste un geste humain.
 */
import type { ClientStatus, InvoiceStatus, MissionStatus, OperationType } from "@/lib/types";

export const OPERATIONS: Record<
  OperationType,
  { libelle: string; cible: string; valeurs: readonly string[] }
> = {
  statut_client: {
    libelle: "Statut du client",
    cible: "client",
    valeurs: ["prospect", "actif", "inactif", "perdu"] satisfies ClientStatus[],
  },
  statut_mission: {
    libelle: "Statut de la mission",
    cible: "mission",
    valeurs: ["en_cours", "livree", "terminee"] satisfies MissionStatus[],
  },
  statut_facture: {
    libelle: "Statut de la facture",
    cible: "facture",
    valeurs: ["emise", "relance", "impayee"] satisfies InvoiceStatus[],
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
