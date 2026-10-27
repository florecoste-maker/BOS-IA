import type {
  Agent,
  AgentAction,
  DashboardMetrics,
  Invoice,
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

/**
 * Indicateurs du cockpit calculés à partir des données.
 * Délai de paiement et MRR : sans date de paiement ni notion d'abonnement dans
 * les données, ils ne sont pas calculables (null) — sauf valeurs de démo fournies.
 */
export function computeMetrics(
  data: MetricsSnapshot,
  fixed: Pick<DashboardMetrics, "delaiPaiementMoyen" | "mrr"> = {
    delaiPaiementMoyen: null,
    mrr: null,
  },
): DashboardMetrics {
  const { learners, opcoDossiers, invoices, agents, agentActions } = data;
  return {
    apprenantsActifs: learners.filter((l) =>
      ["en_formation", "inscrit", "certifie"].includes(l.status),
    ).length,
    ghostLearners: learners.filter((l) => l.status === "inactif").length,
    dossiersOpcoOuverts: opcoDossiers.filter((d) =>
      ["brouillon", "completude", "transmis", "accepte"].includes(d.status),
    ).length,
    facturesEnRetard: invoices.filter((i) => i.joursRetard > 0).length,
    delaiPaiementMoyen: fixed.delaiPaiementMoyen,
    mrr: fixed.mrr,
    agentsActifs: agents.filter((a) => a.status === "actif").length,
    actionsHitl: agentActions.filter((a) => a.requiresHitl && a.hitlStatus === "pending")
      .length,
    pipelineCompletions: learners.filter((l) => l.pipelineStage === "completion").length,
  };
}
