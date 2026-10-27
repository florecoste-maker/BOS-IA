/**
 * Accès aux données du cockpit. Deux moteurs, une seule interface :
 * - MySQL / MariaDB dès que la base est configurée (données réelles, persistantes) ;
 * - sinon démonstration en mémoire (réinitialisée à chaque redémarrage).
 */
import { isDatabaseConfigured } from "./db/config";
import { store } from "./store";
import type {
  ActionExecution,
  Agent,
  AgentAction,
  AgentRunLog,
  DashboardMetrics,
  EmailDraft,
  Invoice,
  Learner,
  OpcoDossier,
  StatusOperation,
  TrainingSession,
  User,
  AuditEntry,
} from "./types";

export type DataMode = "mysql" | "demo";

export interface NewUser {
  email: string;
  nom: string;
  role: User["role"];
  passwordHash: string;
}

export interface UserPatch {
  nom?: string;
  role?: User["role"];
  actif?: boolean;
  passwordHash?: string;
}

/** Modifications humaines à l'approbation : texte de l'e-mail, valeur du statut. */
export interface HitlEdits {
  objet?: string;
  corps?: string;
  valeur?: string;
}

export interface AuditFilter {
  limit?: number;
  utilisateurId?: string;
  action?: string;
}

export interface AgentProposalInput {
  resume: string;
  actions: Array<{
    type: string;
    description: string;
    requiresHitl: boolean;
    email?: EmailDraft | null;
    operation?: StatusOperation | null;
  }>;
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
  /** Paiement reçu à la date donnée (AAAA-MM-JJ). */
  markInvoicePaid(id: string, payeeLe: string): Promise<Invoice | null>;
  /** Décision humaine sur une action en attente (null si introuvable ou déjà tranchée). */
  resolveHitl(
    actionId: string,
    decision: "approved" | "rejected",
    edits?: HitlEdits,
    decidePar?: string,
  ): Promise<AgentAction | null>;
  updateDossierStatus(id: string, status: OpcoDossier["status"]): Promise<OpcoDossier | null>;
  updateInvoiceStatus(id: string, status: Invoice["status"]): Promise<Invoice | null>;
  /** Fiche visée par une opération et son statut actuel (affichage), null si introuvable. */
  findOperationTarget(op: StatusOperation): Promise<{ libelle: string; actuel: string } | null>;
  /** Réserve l'exécution d'une action approuvée ; null si déjà en cours ou faite. */
  claimExecution(actionId: string): Promise<AgentAction | null>;
  finishExecution(actionId: string, execution: ActionExecution): Promise<void>;
  /** Destinataire réel d'un brouillon, d'après les données (jamais d'après le modèle). */
  findRecipient(draft: EmailDraft): Promise<{ nom: string; email: string | null } | null>;
  recordAgentRun(
    agentId: string,
    proposal: AgentProposalInput,
    model: string,
  ): Promise<AgentRunRecord | null>;
  emitProofToCash(learnerId: string): Promise<ProofToCashResult>;
  /** Historique des exécutions d'agents, plus récentes d'abord. */
  logAgentRun(run: AgentRunLog): Promise<void>;
  getAgentRuns(limit?: number): Promise<AgentRunLog[]>;
  /* Comptes nominatifs */
  listUsers(): Promise<User[]>;
  findUserById(id: string): Promise<User | null>;
  /** Compte et hash pour la connexion uniquement. */
  findUserForLogin(email: string): Promise<{ user: User; passwordHash: string } | null>;
  createUser(input: NewUser): Promise<User | null>;
  updateUser(id: string, patch: UserPatch): Promise<User | null>;
  touchLogin(id: string): Promise<void>;
  /* Journal des actions */
  recordAudit(entry: AuditEntry): Promise<void>;
  getAudit(filter?: AuditFilter): Promise<AuditEntry[]>;
  /** Exécute `work` sous un verrou exclusif ; `null` si déjà pris ailleurs. */
  withLock<T>(name: string, work: () => Promise<T>): Promise<{ value: T } | null>;
}

const demoRuns: AgentRunLog[] = [];
const demoUsers: Array<User & { passwordHash: string }> = [];
const demoAudit: AuditEntry[] = [];
const publicUser = ({ passwordHash: _hash, ...user }: User & { passwordHash: string }): User => {
  void _hash;
  return { ...user };
};
const demoLocks = new Set<string>();

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
  markInvoicePaid: async (id, payeeLe) => store.markInvoicePaid(id, payeeLe),
  updateDossierStatus: async (id, status) => store.updateDossierStatus(id, status),
  updateInvoiceStatus: async (id, status) => store.updateInvoiceStatus(id, status),
  findOperationTarget: async (op) => store.findOperationTarget(op),
  resolveHitl: async (actionId, decision, edits, decidePar) =>
    store.resolveHitl(actionId, decision, edits, decidePar),
  claimExecution: async (actionId) => store.claimExecution(actionId),
  finishExecution: async (actionId, execution) => store.finishExecution(actionId, execution),
  findRecipient: async (draft) => store.findRecipient(draft),
  recordAgentRun: async (agentId, proposal, model) =>
    store.recordAgentRun(agentId, proposal, model),
  emitProofToCash: async (learnerId) => store.emitProofToCash(learnerId),
  logAgentRun: async (run) => {
    demoRuns.unshift(run);
    demoRuns.splice(200);
  },
  getAgentRuns: async (limit = 50) => demoRuns.slice(0, limit),
  listUsers: async () => demoUsers.map(publicUser),
  findUserById: async (id) => {
    const u = demoUsers.find((x) => x.id === id);
    return u ? publicUser(u) : null;
  },
  findUserForLogin: async (email) => {
    const u = demoUsers.find((x) => x.email === email.toLowerCase());
    return u ? { user: publicUser(u), passwordHash: u.passwordHash } : null;
  },
  createUser: async (input) => {
    const email = input.email.toLowerCase();
    if (demoUsers.some((u) => u.email === email)) return null;
    const user = {
      id: `usr-${demoUsers.length + 1}-${Date.now().toString(36)}`,
      email,
      nom: input.nom,
      role: input.role,
      actif: true,
      creeLe: new Date().toISOString(),
      passwordHash: input.passwordHash,
    };
    demoUsers.push(user);
    return publicUser(user);
  },
  updateUser: async (id, patch) => {
    const u = demoUsers.find((x) => x.id === id);
    if (!u) return null;
    Object.assign(u, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    return publicUser(u);
  },
  touchLogin: async (id) => {
    const u = demoUsers.find((x) => x.id === id);
    if (u) u.derniereConnexion = new Date().toISOString();
  },
  recordAudit: async (entry) => {
    demoAudit.unshift(entry);
    demoAudit.splice(1000);
  },
  getAudit: async (filter = {}) =>
    demoAudit
      .filter((e) => !filter.utilisateurId || e.utilisateurId === filter.utilisateurId)
      .filter((e) => !filter.action || e.action === filter.action)
      .slice(0, filter.limit ?? 200),
  async withLock(name, work) {
    if (demoLocks.has(name)) return null;
    demoLocks.add(name);
    try {
      return { value: await work() };
    } finally {
      demoLocks.delete(name);
    }
  },
};

/** Moteur actif, choisi à chaque appel : la configuration est lue à l'exécution. */
export async function getRepository(): Promise<Repository> {
  if (!isDatabaseConfigured()) return demoRepository;
  const { mysqlRepository } = await import("./db/mysql");
  return mysqlRepository;
}
