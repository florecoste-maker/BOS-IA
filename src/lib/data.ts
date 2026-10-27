/**
 * Accès aux données du cockpit. Deux moteurs, une seule interface :
 * - MySQL / MariaDB dès que la base est configurée (données réelles, persistantes) ;
 * - sinon démonstration en mémoire (réinitialisée à chaque redémarrage).
 */
import { isDatabaseConfigured } from "./db/config";
import { store } from "./store";
import type {
  Agent,
  AgentAction,
  DashboardMetrics,
  Invoice,
  Learner,
  OpcoDossier,
  TrainingSession,
} from "./types";

export type DataMode = "mysql" | "demo";

export interface AgentProposalInput {
  resume: string;
  actions: Array<{ type: string; description: string; requiresHitl: boolean }>;
}

export interface AgentRunRecord {
  agentId: string;
  model: string;
  resume: string;
  actions: AgentAction[];
}

export type ProofToCashResult =
  | { ok: false; error: string }
  | {
      ok: true;
      completion_record: { learnerId: string; validatedAt: string; score?: number };
      dossier?: OpcoDossier;
      invoice: Invoice;
    };

export interface Repository {
  mode: DataMode;
  getSessions(): Promise<TrainingSession[]>;
  getLearners(): Promise<Learner[]>;
  getOpcoDossiers(): Promise<OpcoDossier[]>;
  getInvoices(): Promise<Invoice[]>;
  getAgents(): Promise<Agent[]>;
  getAgentActions(): Promise<AgentAction[]>;
  getMetrics(): Promise<DashboardMetrics>;
  updateLearnerStatus(id: string, status: Learner["status"]): Promise<Learner | null>;
  validateComprehension(id: string, score: number): Promise<Learner | null>;
  completeOpcoDossier(id: string): Promise<OpcoDossier | null>;
  resolveHitl(
    actionId: string,
    decision: "approved" | "rejected",
  ): Promise<AgentAction | null>;
  recordAgentRun(
    agentId: string,
    proposal: AgentProposalInput,
    model: string,
  ): Promise<AgentRunRecord | null>;
  emitProofToCash(learnerId: string): Promise<ProofToCashResult>;
}

const demoRepository: Repository = {
  mode: "demo",
  getSessions: async () => store.getSessions(),
  getLearners: async () => store.getLearners(),
  getOpcoDossiers: async () => store.getOpcoDossiers(),
  getInvoices: async () => store.getInvoices(),
  getAgents: async () => store.getAgents(),
  getAgentActions: async () => store.getAgentActions(),
  getMetrics: async () => store.getMetrics(),
  updateLearnerStatus: async (id, status) => store.updateLearnerStatus(id, status),
  validateComprehension: async (id, score) => store.validateComprehension(id, score),
  completeOpcoDossier: async (id) => store.completeOpcoDossier(id),
  resolveHitl: async (actionId, decision) => store.resolveHitl(actionId, decision),
  recordAgentRun: async (agentId, proposal, model) =>
    store.recordAgentRun(agentId, proposal, model),
  emitProofToCash: async (learnerId) => store.emitProofToCash(learnerId),
};

/** Moteur actif, choisi à chaque appel : la configuration est lue à l'exécution. */
export async function getRepository(): Promise<Repository> {
  if (!isDatabaseConfigured()) return demoRepository;
  const { mysqlRepository } = await import("./db/mysql");
  return mysqlRepository;
}
