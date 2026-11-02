export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** Date et heure de Paris, ex. « 27 oct. 2026, 07:42 ». */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    // Clients
    prospect: "Prospect",
    actif: "Actif",
    inactif: "Inactif",
    perdu: "Perdu",
    // Missions
    proposition: "Proposition",
    signee: "Signée",
    en_cours: "En cours",
    livree: "Livrée",
    terminee: "Terminée",
    annulee: "Annulée",
    // Factures
    brouillon: "Brouillon",
    emise: "Émise",
    partiellement_payee: "Partiellement payée",
    payee: "Payée",
    relance: "Relance",
    impayee: "Impayée",
    // Agents
    en_attente_hitl: "HITL",
    pause: "Pause",
    erreur: "Erreur",
  };
  return map[status] ?? status;
}

export const MISSION_TYPE_LABELS: Record<string, string> = {
  agent_ia: "Agent IA",
  automatisation: "Automatisation",
  conseil: "Conseil / accompagnement",
  abonnement: "Abonnement",
  autre: "Autre",
};

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  virement: "Virement",
  carte: "Carte bancaire",
  prelevement: "Prélèvement",
  cheque: "Chèque",
  especes: "Espèces",
  stripe: "Stripe",
  paypal: "PayPal",
  autre: "Autre",
};

export function missionTypeLabel(type: string) {
  return MISSION_TYPE_LABELS[type] ?? type;
}

export function paymentModeLabel(mode: string) {
  return PAYMENT_MODE_LABELS[mode] ?? mode;
}

/** Montant au centime près, ex. « 1 490,50 € ». */
export function formatMoneyCents(amount: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
}
