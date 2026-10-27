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
    lead: "Lead",
    inscrit: "Inscrit",
    en_formation: "En formation",
    inactif: "Ghost learner",
    certifie: "Certifié",
    abandon: "Abandon",
    brouillon: "Brouillon",
    completude: "Complétude",
    transmis: "Transmis",
    accepte: "Accepté",
    refuse: "Refusé",
    paye: "Payé",
    emise: "Émise",
    acompte_paye: "Acompte payé",
    solde_du: "Solde dû",
    payee: "Payée",
    relance: "Relance",
    impayee: "Impayée",
    actif: "Actif",
    en_attente_hitl: "HITL",
    pause: "Pause",
    erreur: "Erreur",
    planifiee: "Planifiée",
    en_cours: "En cours",
    terminee: "Terminée",
  };
  return map[status] ?? status;
}
