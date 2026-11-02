/**
 * Accès aux données du cockpit. Deux moteurs, une seule interface :
 * - MySQL / MariaDB dès que la base est configurée (données réelles, persistantes) ;
 * - sinon démonstration en mémoire (réinitialisée à chaque redémarrage).
 */
import { isDatabaseConfigured } from "./db/config";
import { store } from "./store";
import type {
  ClientInput,
  ClientPatch,
  ContactInput,
  ContactPatch,
  QuoteInput,
  InvoiceInput,
  MissionInput,
  MissionPatch,
  PaymentInput,
  WriteResult,
} from "./business";
import type {
  ActionExecution,
  Agent,
  AgentAction,
  AgentRunLog,
  Client,
  Contact,
  DashboardMetrics,
  EmailDraft,
  Invoice,
  InvoiceStatus,
  Mission,
  Payment,
  Quote,
  QuoteStatus,
  StatusOperation,
  User,
  AuditEntry,
} from "./types";

export type DataMode = "mysql" | "demo";

export interface NewUser {
  email: string;
  nom: string;
  role: User["role"];
  /** Obligatoire pour un compte client, interdit sinon. */
  clientId?: string;
  passwordHash: string;
}

/** Le rôle ne passe jamais de l'équipe à un client (ni l'inverse) : vérifié par l'appelant. */
export interface UserPatch {
  nom?: string;
  role?: "admin" | "membre";
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

/** Tout ce qui concerne une seule entreprise cliente. */
export interface SpaceData {
  client: Client;
  contacts: Contact[];
  missions: Mission[];
  quotes: Quote[];
  invoices: Invoice[];
  payments: Payment[];
}

export interface Repository {
  mode: DataMode;
  getClients(): Promise<Client[]>;
  getContacts(): Promise<Contact[]>;
  getQuotes(): Promise<Quote[]>;
  /** Données d'un seul espace, filtrées par la base (null si le client n'existe pas). */
  getSpace(clientId: string): Promise<SpaceData | null>;
  getMissions(): Promise<Mission[]>;
  getInvoices(): Promise<Invoice[]>;
  getPayments(): Promise<Payment[]>;
  getAgents(): Promise<Agent[]>;
  getAgentActions(): Promise<AgentAction[]>;
  getMetrics(): Promise<DashboardMetrics>;
  /* Clients, missions, factures et paiements (saisis dans le cockpit) */
  createClient(input: ClientInput): Promise<WriteResult<Client>>;
  updateClient(id: string, patch: ClientPatch): Promise<WriteResult<Client>>;
  createContact(input: ContactInput): Promise<WriteResult<Contact>>;
  updateContact(id: string, patch: ContactPatch): Promise<WriteResult<Contact>>;
  createMission(input: MissionInput): Promise<WriteResult<Mission>>;
  updateMission(id: string, patch: MissionPatch): Promise<WriteResult<Mission>>;
  /** Numéro FA-AAAA-NNNN attribué si absent. */
  createInvoice(input: InvoiceInput): Promise<WriteResult<Invoice>>;
  /** Statut choisi à la main ou par un agent ; « payée » découle des paiements. */
  updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<WriteResult<Invoice>>;
  /** Numéro DEV-AAAA-NNNN attribué automatiquement. */
  createQuote(input: QuoteInput): Promise<WriteResult<Quote>>;
  updateQuoteStatus(id: string, status: QuoteStatus): Promise<WriteResult<Quote>>;
  /** Réponse d'un compte client depuis son espace ; refusée hors de son entreprise. */
  respondToQuote(
    clientId: string,
    quoteId: string,
    decision: "accepte" | "refuse",
    par: string,
  ): Promise<WriteResult<Quote>>;
  /** Devis accepté → facture émise, une seule fois. */
  invoiceQuote(id: string): Promise<WriteResult<{ quote: Quote; invoice: Invoice }>>;
  /** Paiement reçu : la facture passe en « partiellement payée » ou « payée ». */
  recordPayment(input: PaymentInput): Promise<WriteResult<{ payment: Payment; invoice: Invoice }>>;
  /** Décision humaine sur une action en attente (null si introuvable ou déjà tranchée). */
  resolveHitl(
    actionId: string,
    decision: "approved" | "rejected",
    edits?: HitlEdits,
    decidePar?: string,
  ): Promise<AgentAction | null>;
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
  getClients: async () => store.getClients(),
  getContacts: async () => store.getContacts(),
  getQuotes: async () => store.getQuotes(),
  getSpace: async (clientId) => store.getSpace(clientId),
  createContact: async (input) => store.createContact(input),
  updateContact: async (id, patch) => store.updateContact(id, patch),
  createQuote: async (input) => store.createQuote(input),
  updateQuoteStatus: async (id, status) => store.updateQuoteStatus(id, status),
  invoiceQuote: async (id) => store.invoiceQuote(id),
  respondToQuote: async (clientId, quoteId, decision, par) => store.respondToQuote(clientId, quoteId, decision, par),
  getMissions: async () => store.getMissions(),
  getInvoices: async () => store.getInvoices(),
  getPayments: async () => store.getPayments(),
  getAgents: async () => store.getAgents(),
  getAgentActions: async () => store.getAgentActions(),
  getMetrics: async () => store.getMetrics(),
  createClient: async (input) => store.createClient(input),
  updateClient: async (id, patch) => store.updateClient(id, patch),
  createMission: async (input) => store.createMission(input),
  updateMission: async (id, patch) => store.updateMission(id, patch),
  createInvoice: async (input) => store.createInvoice(input),
  updateInvoiceStatus: async (id, status) => store.updateInvoiceStatus(id, status),
  recordPayment: async (input) => store.recordPayment(input),
  findOperationTarget: async (op) => store.findOperationTarget(op),
  resolveHitl: async (actionId, decision, edits, decidePar) =>
    store.resolveHitl(actionId, decision, edits, decidePar),
  claimExecution: async (actionId) => store.claimExecution(actionId),
  finishExecution: async (actionId, execution) => store.finishExecution(actionId, execution),
  findRecipient: async (draft) => store.findRecipient(draft),
  recordAgentRun: async (agentId, proposal, model) =>
    store.recordAgentRun(agentId, proposal, model),
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
      ...(input.clientId ? { clientId: input.clientId } : {}),
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
