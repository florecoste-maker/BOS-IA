import type {
  ActionExecution,
  Agent,
  AgentAction,
  EmailDraft,
  DashboardMetrics,
  Invoice,
  Learner,
  OpcoDossier,
  TrainingSession,
} from "./types";
import { cleanEdits, isRetryable } from "./actions/rules";
import { computeMetrics as computeMetricsFrom } from "./metrics";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const sessions: TrainingSession[] = [
  {
    id: "ses-001",
    titre: "Google Workspace — Prise en main",
    code: "GWS-INIT-7H",
    debut: daysFromNow(-14),
    fin: daysFromNow(-7),
    formateur: "A. Moreau",
    places: 12,
    inscrits: 11,
    statut: "terminee",
    qualiopiIndicateurs: ["I4", "I11", "I12", "I13"],
  },
  {
    id: "ses-002",
    titre: "Gemini Enterprise — Agents métier",
    code: "GEM-AGT-14H",
    debut: daysFromNow(-3),
    fin: daysFromNow(4),
    formateur: "L. Ramanantsoa",
    places: 10,
    inscrits: 8,
    statut: "en_cours",
    qualiopiIndicateurs: ["I4", "I6", "I11", "I26"],
  },
  {
    id: "ses-003",
    titre: "Sécurité & Souveraineté Cloud",
    code: "SEC-SOUV-7H",
    debut: daysFromNow(10),
    fin: daysFromNow(11),
    formateur: "J. Santolaria",
    places: 15,
    inscrits: 4,
    statut: "planifiee",
    qualiopiIndicateurs: ["I4", "I11"],
  },
];

const learners: Learner[] = [
  {
    id: "lrn-001",
    nom: "Dupont",
    prenom: "Camille",
    email: "camille.dupont@atelier-nord.fr",
    entreprise: "Atelier Nord",
    status: "certifie",
    pipelineStage: "completion",
    sessionId: "ses-001",
    derniereActivite: daysAgo(2),
    comprehensionValidee: true,
    scoreQuiz: 92,
    createdAt: daysAgo(30),
  },
  {
    id: "lrn-002",
    nom: "Benali",
    prenom: "Yasmine",
    email: "y.benali@ocean-services.re",
    entreprise: "Océan Services",
    status: "en_formation",
    pipelineStage: "parcours",
    sessionId: "ses-002",
    derniereActivite: daysAgo(0),
    comprehensionValidee: false,
    createdAt: daysAgo(10),
  },
  {
    id: "lrn-003",
    nom: "Martin",
    prenom: "Hugo",
    email: "h.martin@startup.io",
    entreprise: "Startup.io",
    status: "inactif",
    pipelineStage: "parcours",
    sessionId: "ses-002",
    derniereActivite: daysAgo(9),
    comprehensionValidee: false,
    createdAt: daysAgo(12),
  },
  {
    id: "lrn-004",
    nom: "Rakoto",
    prenom: "Mialy",
    email: "m.rakoto@groupe-pacifique.mg",
    entreprise: "Groupe Pacifique",
    status: "en_formation",
    pipelineStage: "evaluation",
    sessionId: "ses-002",
    derniereActivite: daysAgo(1),
    comprehensionValidee: true,
    scoreQuiz: 78,
    createdAt: daysAgo(8),
  },
  {
    id: "lrn-005",
    nom: "Lefèvre",
    prenom: "Nora",
    email: "nora.lefevre@mairie-exemple.fr",
    entreprise: "Collectivité",
    status: "inscrit",
    pipelineStage: "inscription",
    sessionId: "ses-003",
    derniereActivite: daysAgo(3),
    comprehensionValidee: false,
    createdAt: daysAgo(5),
  },
  {
    id: "lrn-006",
    nom: "Chen",
    prenom: "Li",
    email: "li.chen@techbridge.be",
    entreprise: "TechBridge",
    status: "lead",
    pipelineStage: "lead",
    derniereActivite: daysAgo(1),
    comprehensionValidee: false,
    createdAt: daysAgo(1),
  },
];

const opcoDossiers: OpcoDossier[] = [
  {
    id: "opco-001",
    reference: "OPCO-2026-0842",
    organisme: "OPCO EP",
    apprenantId: "lrn-001",
    sessionId: "ses-001",
    montant: 1490,
    status: "paye",
    completude: 100,
    piecesManquantes: [],
    updatedAt: daysAgo(5),
  },
  {
    id: "opco-002",
    reference: "OPCO-2026-0911",
    organisme: "AKTO",
    apprenantId: "lrn-002",
    sessionId: "ses-002",
    montant: 2490,
    status: "completude",
    completude: 72,
    piecesManquantes: ["Attestation employeur", "Programme signé"],
    updatedAt: daysAgo(1),
  },
  {
    id: "opco-003",
    reference: "OPCO-2026-0933",
    organisme: "OPCO Mobilités",
    apprenantId: "lrn-004",
    sessionId: "ses-002",
    montant: 2490,
    status: "transmis",
    completude: 100,
    piecesManquantes: [],
    updatedAt: daysAgo(0),
  },
];

const invoices: Invoice[] = [
  {
    id: "inv-001",
    numero: "FA-2026-0142",
    client: "Atelier Nord",
    dossierOpcoId: "opco-001",
    montantHT: 1490,
    acomptePct: 30,
    status: "payee",
    emiseLe: daysAgo(20).slice(0, 10),
    echeance: daysAgo(5).slice(0, 10),
    joursRetard: 0,
    payeeLe: daysAgo(4).slice(0, 10),
  },
  {
    id: "inv-002",
    numero: "FA-2026-0158",
    client: "Océan Services",
    dossierOpcoId: "opco-002",
    montantHT: 2490,
    acomptePct: 30,
    status: "acompte_paye",
    emiseLe: daysAgo(8).slice(0, 10),
    echeance: daysFromNow(22),
    joursRetard: 0,
  },
  {
    id: "inv-003",
    numero: "FA-2026-0161",
    client: "Groupe Pacifique",
    dossierOpcoId: "opco-003",
    montantHT: 2490,
    acomptePct: 30,
    status: "relance",
    emiseLe: daysAgo(40).slice(0, 10),
    echeance: daysAgo(10).slice(0, 10),
    joursRetard: 10,
  },
  {
    id: "inv-004",
    numero: "ABO-2026-0044",
    client: "TechBridge",
    montantHT: 150,
    acomptePct: 100,
    status: "emise",
    emiseLe: daysAgo(2).slice(0, 10),
    echeance: daysFromNow(28),
    joursRetard: 0,
    recurrence: "mensuel",
  },
];

const agents: Agent[] = [
  {
    id: "agt-001",
    nom: "Data Truth Keeper",
    role: "Gardien des prix et référentiels",
    tier: "QAA",
    autonomy: "quality_assured",
    status: "actif",
    derniereAction: "Synchronisation grille tarifaire GWS-INIT",
    risque: "faible",
    hitlObligatoire: false,
  },
  {
    id: "agt-002",
    nom: "Compliance Guardian",
    role: "Auditeur RGPD temps réel",
    tier: "QAA",
    autonomy: "quality_assured",
    status: "actif",
    derniereAction: "Scan PII sur exports apprenants",
    risque: "moyen",
    hitlObligatoire: false,
  },
  {
    id: "agt-003",
    nom: "Veille Qualiopi",
    role: "Scan automatique des normes",
    tier: "IPOA",
    autonomy: "informed_proactive",
    status: "actif",
    derniereAction: "Alerte indicateur I26 — preuves manquantes ses-002",
    risque: "moyen",
    hitlObligatoire: false,
  },
  {
    id: "agt-004",
    nom: "Optimiseur Pipeline",
    role: "Amélioration continue des parcours",
    tier: "IPOA",
    autonomy: "informed_proactive",
    status: "actif",
    derniereAction: "Suggestion relance ghost learner Hugo Martin",
    risque: "faible",
    hitlObligatoire: false,
  },
  {
    id: "agt-005",
    nom: "Recouvrement Assisté",
    role: "Relances adaptatives factures",
    tier: "MDGA",
    autonomy: "monitored_delegated",
    status: "en_attente_hitl",
    derniereAction: "Proposition relance FA-2026-0161 (J+10)",
    risque: "eleve",
    hitlObligatoire: true,
  },
  {
    id: "agt-006",
    nom: "Assistant BPO Workspace",
    role: "Assistants Gmail / Sheets",
    tier: "FCA",
    autonomy: "monitored_delegated",
    status: "actif",
    derniereAction: "Draft confirmation inscription Lefèvre",
    risque: "moyen",
    hitlObligatoire: true,
  },
];

const agentActions: AgentAction[] = [
  {
    id: "act-001",
    agentId: "agt-005",
    type: "relance_facture",
    description:
      "Envoyer une relance courtoise à Groupe Pacifique pour FA-2026-0161 (10 j. de retard).",
    timestamp: daysAgo(0),
    requiresHitl: true,
    hitlStatus: "pending",
  },
  {
    id: "act-002",
    agentId: "agt-004",
    type: "relance_ghost",
    description:
      "Hugo Martin inactif depuis 9 jours — proposer un message de reprise de parcours.",
    timestamp: daysAgo(0),
    requiresHitl: true,
    hitlStatus: "pending",
  },
  {
    id: "act-003",
    agentId: "agt-002",
    type: "audit_rgpd",
    description: "Aucun export non chiffré détecté sur les 24 dernières heures.",
    timestamp: daysAgo(0),
    requiresHitl: false,
  },
];

function computeMetrics(): DashboardMetrics {
  return computeMetricsFrom({ learners, opcoDossiers, invoices, agents, agentActions });
}

/** System of Record in-memory (démo). Isolé par tenant conceptuel. */
export const store = {
  getSessions: () => [...sessions],
  getLearners: () => [...learners],
  getLearner: (id: string) => learners.find((l) => l.id === id),
  getOpcoDossiers: () => [...opcoDossiers],
  getInvoices: () => [...invoices],
  getAgents: () => [...agents],
  getAgentActions: () => [...agentActions],
  getMetrics: computeMetrics,

  updateLearnerStatus(id: string, status: Learner["status"]) {
    const learner = learners.find((l) => l.id === id);
    if (!learner) return null;
    learner.status = status;
    learner.derniereActivite = new Date().toISOString();
    if (status === "certifie") {
      learner.pipelineStage = "completion";
      learner.comprehensionValidee = true;
    }
    return { ...learner };
  },

  validateComprehension(id: string, score: number) {
    const learner = learners.find((l) => l.id === id);
    if (!learner) return null;
    learner.comprehensionValidee = score >= 70;
    learner.scoreQuiz = score;
    learner.pipelineStage = score >= 70 ? "certification" : "evaluation";
    learner.derniereActivite = new Date().toISOString();
    return { ...learner };
  },

  /** Paiement reçu : statut « payée » et date de paiement (AAAA-MM-JJ). */
  markInvoicePaid(id: string, payeeLe: string) {
    const invoice = invoices.find((i) => i.id === id);
    if (!invoice) return null;
    invoice.status = "payee";
    invoice.payeeLe = payeeLe;
    invoice.joursRetard = 0;
    return { ...invoice };
  },

  completeOpcoDossier(id: string) {
    const dossier = opcoDossiers.find((d) => d.id === id);
    if (!dossier) return null;
    dossier.completude = 100;
    dossier.piecesManquantes = [];
    dossier.status = "transmis";
    dossier.updatedAt = new Date().toISOString();
    return { ...dossier };
  },

  /** Décision humaine, une seule fois : une action déjà tranchée est refusée (null). */
  resolveHitl(
    actionId: string,
    decision: "approved" | "rejected",
    edits?: { objet?: string; corps?: string },
  ) {
    const action = agentActions.find((a) => a.id === actionId);
    if (!action || !action.requiresHitl || action.hitlStatus !== "pending") return null;
    action.hitlStatus = decision;
    if (decision === "approved" && action.email) {
      action.email = { ...action.email, ...cleanEdits(edits) };
    }
    const agent = agents.find((a) => a.id === action.agentId);
    if (agent && agent.status === "en_attente_hitl") {
      agent.status = decision === "approved" ? "actif" : "pause";
      agent.derniereAction =
        decision === "approved"
          ? `HITL approuvé — ${action.type}`
          : `HITL refusé — ${action.type}`;
    }
    return { ...action };
  },

  /** Réserve l'exécution d'une action approuvée (une seule à la fois, relance après échec). */
  claimExecution(actionId: string) {
    const action = agentActions.find((a) => a.id === actionId);
    if (!action || action.hitlStatus !== "approved") return null;
    if (action.execution && !isRetryable(action.execution)) return null;
    action.execution = { statut: "en_cours", le: new Date().toISOString(), message: "" };
    return { ...action };
  },

  finishExecution(actionId: string, execution: ActionExecution) {
    const action = agentActions.find((a) => a.id === actionId);
    if (action) action.execution = execution;
  },

  findRecipient(draft: EmailDraft) {
    if (draft.cible === "apprenant") {
      const learner = learners.find((l) => l.id === draft.refId);
      return learner ? { nom: `${learner.prenom} ${learner.nom}`, email: learner.email || null } : null;
    }
    const invoice = invoices.find((i) => i.id === draft.refId);
    return invoice ? { nom: invoice.client, email: invoice.emailClient ?? null } : null;
  },

  /** Enregistre une analyse d'agent IA ; les actions sensibles vont en file HITL. */
  recordAgentRun(
    agentId: string,
    proposal: {
      resume: string;
      actions: Array<{
        type: string;
        description: string;
        requiresHitl: boolean;
        email?: EmailDraft | null;
      }>;
    },
    model: string,
  ) {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return null;
    const timestamp = new Date().toISOString();
    const created: AgentAction[] = proposal.actions.map((a, i) => ({
      id: `act-${Date.now()}-${i}`,
      agentId,
      type: a.type,
      description: a.description,
      timestamp,
      requiresHitl: a.requiresHitl,
      hitlStatus: a.requiresHitl ? "pending" : undefined,
      ...(a.email ? { email: a.email } : {}),
    }));
    agentActions.unshift(...created);
    agent.derniereAction = proposal.resume;
    if (created.some((a) => a.requiresHitl)) agent.status = "en_attente_hitl";
    return { agentId, model, resume: proposal.resume, actions: created };
  },

  emitProofToCash(learnerId: string) {
    const learner = learners.find((l) => l.id === learnerId);
    if (!learner || !learner.comprehensionValidee) {
      return { ok: false as const, error: "Compréhension non validée" };
    }
    learner.status = "certifie";
    learner.pipelineStage = "completion";

    let dossier = opcoDossiers.find((d) => d.apprenantId === learnerId);
    if (!dossier && learner.sessionId) {
      dossier = {
        id: `opco-${Date.now()}`,
        reference: `OPCO-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        organisme: "OPCO EP",
        apprenantId: learnerId,
        sessionId: learner.sessionId,
        montant: 1490,
        status: "completude",
        completude: 100,
        piecesManquantes: [],
        updatedAt: new Date().toISOString(),
      };
      opcoDossiers.push(dossier);
    } else if (dossier) {
      dossier.completude = 100;
      dossier.piecesManquantes = [];
      dossier.status = "accepte";
      dossier.updatedAt = new Date().toISOString();
    }

    const invoice: Invoice = {
      id: `inv-${Date.now()}`,
      numero: `FA-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      client: learner.entreprise ?? `${learner.prenom} ${learner.nom}`,
      dossierOpcoId: dossier?.id,
      montantHT: dossier?.montant ?? 1490,
      acomptePct: 30,
      status: "emise",
      emiseLe: new Date().toISOString().slice(0, 10),
      echeance: daysFromNow(30),
      joursRetard: 0,
    };
    invoices.push(invoice);

    return {
      ok: true as const,
      completion_record: {
        learnerId,
        validatedAt: new Date().toISOString(),
        score: learner.scoreQuiz,
      },
      dossier,
      invoice,
    };
  },
};
