import type {
  Agent,
  AgentAction,
  DashboardMetrics,
  Invoice,
  InvoiceRecurrence,
  Learner,
  OpcoDossier,
} from "./types";

export interface MetricsSnapshot {
  learners: Learner[];
  opcoDossiers: OpcoDossier[];
  invoices: Invoice[];
  agents: Agent[];
  agentActions: AgentAction[];
}

const DAY_MS = 86_400_000;

/** Durée couverte par une facture d'abonnement (mois) et part mensuelle. */
const RECURRENCE_MONTHS: Record<InvoiceRecurrence, number> = {
  mensuel: 1,
  trimestriel: 3,
  annuel: 12,
};

function utcDay(value: string | number) {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function addMonths(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // 31 janvier + 1 mois → 28/29 février, pas 3 mars.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

/**
 * Délai de paiement moyen : jours entre émission et paiement, sur les factures
 * payées au cours des 12 derniers mois. null si aucune n'a de date de paiement.
 */
export function paymentDelay(invoices: Invoice[], now = Date.now()) {
  const since = utcDay(now) - 365 * DAY_MS;
  const delays = invoices
    .filter((i) => i.payeeLe && utcDay(i.payeeLe) >= since && utcDay(i.payeeLe) <= utcDay(now))
    .map((i) => Math.max(0, Math.round((utcDay(i.payeeLe!) - utcDay(i.emiseLe)) / DAY_MS)));
  return {
    moyenne: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
    base: delays.length,
  };
}

/**
 * MRR : montant HT ramené au mois des factures d'abonnement dont la période
 * (émission + 1, 3 ou 12 mois) couvre aujourd'hui. Brouillons exclus.
 */
export function monthlyRecurringRevenue(invoices: Invoice[], now = Date.now()) {
  const today = utcDay(now);
  const active = invoices.filter((i) => {
    if (!i.recurrence || i.status === "brouillon") return false;
    const start = utcDay(i.emiseLe);
    return start <= today && today < addMonths(i.emiseLe, RECURRENCE_MONTHS[i.recurrence]);
  });
  const hasSubscriptions = invoices.some((i) => i.recurrence && i.status !== "brouillon");
  const total = active.reduce((sum, i) => sum + i.montantHT / RECURRENCE_MONTHS[i.recurrence!], 0);
  return {
    mrr: hasSubscriptions ? Math.round(total * 100) / 100 : null,
    actifs: active.length,
  };
}

/** Indicateurs du cockpit, tous calculés à partir des données. */
export function computeMetrics(data: MetricsSnapshot, now = Date.now()): DashboardMetrics {
  const { learners, opcoDossiers, invoices, agents, agentActions } = data;
  const delay = paymentDelay(invoices, now);
  const recurring = monthlyRecurringRevenue(invoices, now);
  return {
    apprenantsActifs: learners.filter((l) =>
      ["en_formation", "inscrit", "certifie"].includes(l.status),
    ).length,
    ghostLearners: learners.filter((l) => l.status === "inactif").length,
    dossiersOpcoOuverts: opcoDossiers.filter((d) =>
      ["brouillon", "completude", "transmis", "accepte"].includes(d.status),
    ).length,
    facturesEnRetard: invoices.filter((i) => i.joursRetard > 0).length,
    delaiPaiementMoyen: delay.moyenne,
    delaiPaiementBase: delay.base,
    mrr: recurring.mrr,
    abonnementsActifs: recurring.actifs,
    agentsActifs: agents.filter((a) => a.status === "actif").length,
    actionsHitl: agentActions.filter((a) => a.requiresHitl && a.hitlStatus === "pending")
      .length,
    pipelineCompletions: learners.filter((l) => l.pipelineStage === "completion").length,
  };
}
