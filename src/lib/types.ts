/** System of Record — domaines métier BOS-IA */

export type LearnerStatus =
  | "lead"
  | "inscrit"
  | "en_formation"
  | "inactif"
  | "certifie"
  | "abandon";

export type PipelineStage =
  | "lead"
  | "inscription"
  | "parcours"
  | "evaluation"
  | "certification"
  | "completion";

export interface Learner {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  entreprise?: string;
  status: LearnerStatus;
  pipelineStage: PipelineStage;
  sessionId?: string;
  derniereActivite: string;
  comprehensionValidee: boolean;
  scoreQuiz?: number;
  createdAt: string;
}

export interface TrainingSession {
  id: string;
  titre: string;
  code: string;
  debut: string;
  fin: string;
  formateur: string;
  places: number;
  inscrits: number;
  statut: "planifiee" | "en_cours" | "terminee";
  qualiopiIndicateurs: string[];
}

export type OpcoStatus =
  | "brouillon"
  | "completude"
  | "transmis"
  | "accepte"
  | "refuse"
  | "paye";

export interface OpcoDossier {
  id: string;
  reference: string;
  organisme: string;
  apprenantId: string;
  sessionId: string;
  montant: number;
  status: OpcoStatus;
  completude: number;
  piecesManquantes: string[];
  updatedAt: string;
}

export type InvoiceStatus =
  | "brouillon"
  | "emise"
  | "acompte_paye"
  | "solde_du"
  | "payee"
  | "relance"
  | "impayee";

export interface Invoice {
  id: string;
  numero: string;
  client: string;
  dossierOpcoId?: string;
  montantHT: number;
  acomptePct: number;
  status: InvoiceStatus;
  emiseLe: string;
  echeance: string;
  joursRetard: number;
}

export type AgentTier = "QAA" | "IPOA" | "FCA" | "MDGA";
export type AgentAutonomy =
  | "quality_assured"
  | "informed_proactive"
  | "monitored_delegated";

export interface Agent {
  id: string;
  nom: string;
  role: string;
  tier: AgentTier;
  autonomy: AgentAutonomy;
  status: "actif" | "en_attente_hitl" | "pause" | "erreur";
  derniereAction: string;
  risque: "faible" | "moyen" | "eleve";
  hitlObligatoire: boolean;
}

export interface AgentAction {
  id: string;
  agentId: string;
  type: string;
  description: string;
  timestamp: string;
  requiresHitl: boolean;
  hitlStatus?: "pending" | "approved" | "rejected";
}

export interface DashboardMetrics {
  apprenantsActifs: number;
  ghostLearners: number;
  dossiersOpcoOuverts: number;
  facturesEnRetard: number;
  /** null : non calculable avec les données disponibles. */
  delaiPaiementMoyen: number | null;
  /** null : non calculable avec les données disponibles. */
  mrr: number | null;
  agentsActifs: number;
  actionsHitl: number;
  pipelineCompletions: number;
}

/** Journal d'une exécution d'agent (manuelle ou planifiée). */
export interface AgentRunLog {
  id: string;
  agentId: string;
  declencheur: "manuel" | "planifie";
  debut: string;
  fin: string;
  statut: "succes" | "echec" | "ignore";
  message: string;
  actions: number;
  model?: string;
}
