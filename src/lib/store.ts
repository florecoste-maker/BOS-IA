/**
 * Données de démonstration en mémoire (sans base MySQL), réinitialisées à
 * chaque redémarrage. Exemples fictifs d'une agence d'agents IA : aucune
 * donnée réelle. Les écritures suivent les mêmes règles que MySQL (lib/business).
 */
import type {
  ActionExecution,
  Agent,
  AgentAction,
  Client,
  DashboardMetrics,
  EmailDraft,
  Invoice,
  InvoiceStatus,
  Mission,
  Payment,
  StatusOperation,
} from "./types";
import { editedOperation } from "./actions/operations";
import { cleanEdits, isRetryable } from "./actions/rules";
import {
  type ClientInput,
  type ClientPatch,
  type InvoiceInput,
  type InvoiceRecord,
  type MissionInput,
  type MissionPatch,
  type PaymentInput,
  type WriteResult,
  deriveInvoice,
  deriveInvoices,
  failure,
  missionBelongs,
  nextNumber,
  paymentProblem,
  round2,
  settleInvoice,
} from "./business";
import { statusLabel } from "./format";
import { computeMetrics as computeMetricsFrom } from "./metrics";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const clients: Client[] = [
  {
    id: "cli-001",
    nom: "Atelier Nord",
    contact: "Camille Dupont",
    email: "camille.dupont@atelier-nord.example",
    telephone: "01 23 45 67 89",
    secteur: "Artisanat — menuiserie",
    statut: "actif",
    source: "Recommandation",
    notes: "Agent IA de réponse aux demandes de devis.",
    creeLe: daysAgo(60),
    derniereActivite: daysAgo(2),
  },
  {
    id: "cli-002",
    nom: "Océan Services",
    contact: "Yasmine Benali",
    email: "y.benali@ocean-services.example",
    secteur: "Services aux entreprises",
    statut: "actif",
    source: "Site jamaliance.com",
    creeLe: daysAgo(35),
    derniereActivite: daysAgo(1),
  },
  {
    id: "cli-003",
    nom: "Groupe Pacifique",
    contact: "Mialy Rakoto",
    email: "compta@groupe-pacifique.example",
    secteur: "Distribution",
    statut: "actif",
    source: "Salon",
    creeLe: daysAgo(80),
    derniereActivite: daysAgo(12),
  },
  {
    id: "cli-004",
    nom: "TechBridge",
    contact: "Li Chen",
    email: "li.chen@techbridge.example",
    secteur: "Logiciel",
    statut: "prospect",
    source: "Rendez-vous TidyCal",
    notes: "Intéressé par un agent de qualification des leads.",
    creeLe: daysAgo(9),
    derniereActivite: daysAgo(9),
  },
  {
    id: "cli-005",
    nom: "Cabinet Lefèvre",
    contact: "Nora Lefèvre",
    secteur: "Expertise comptable",
    statut: "prospect",
    source: "LinkedIn",
    creeLe: daysAgo(3),
    derniereActivite: daysAgo(3),
  },
];

const missions: Mission[] = [
  {
    id: "mis-001",
    code: "MIS-2026-0001",
    titre: "Agent IA — réponses aux demandes de devis",
    clientId: "cli-001",
    type: "agent_ia",
    statut: "livree",
    montantHT: 4800,
    debut: day(-50),
    fin: day(-10),
    creeLe: daysAgo(55),
  },
  {
    id: "mis-002",
    code: "MIS-2026-0002",
    titre: "Automatisation du tri des e-mails entrants",
    clientId: "cli-002",
    type: "automatisation",
    statut: "en_cours",
    montantHT: 3200,
    debut: day(-14),
    fin: day(5),
    creeLe: daysAgo(30),
  },
  {
    id: "mis-003",
    code: "MIS-2026-0003",
    titre: "Maintenance et suivi des agents IA",
    clientId: "cli-001",
    type: "abonnement",
    statut: "en_cours",
    montantHT: 150,
    debut: day(-10),
    creeLe: daysAgo(10),
  },
  {
    id: "mis-004",
    code: "MIS-2026-0004",
    titre: "Audit des processus et feuille de route IA",
    clientId: "cli-003",
    type: "conseil",
    statut: "terminee",
    montantHT: 2500,
    debut: day(-70),
    fin: day(-45),
    creeLe: daysAgo(75),
  },
  {
    id: "mis-005",
    code: "MIS-2026-0005",
    titre: "Agent de qualification des leads",
    clientId: "cli-004",
    type: "agent_ia",
    statut: "proposition",
    montantHT: 5400,
    creeLe: daysAgo(5),
  },
];

const invoices: InvoiceRecord[] = [
  {
    id: "inv-001",
    numero: "FA-2026-0001",
    clientId: "cli-001",
    missionId: "mis-001",
    objet: "Agent IA devis — acompte 30 %",
    montantHT: 1440,
    tauxTva: 20,
    status: "payee",
    emiseLe: day(-50),
    echeance: day(-35),
    payeeLe: day(-44),
  },
  {
    id: "inv-002",
    numero: "FA-2026-0002",
    clientId: "cli-001",
    missionId: "mis-001",
    objet: "Agent IA devis — solde à la livraison",
    montantHT: 3360,
    tauxTva: 20,
    status: "partiellement_payee",
    emiseLe: day(-10),
    echeance: day(20),
  },
  {
    id: "inv-003",
    numero: "FA-2026-0003",
    clientId: "cli-003",
    missionId: "mis-004",
    objet: "Audit des processus IA",
    montantHT: 2500,
    tauxTva: 20,
    status: "relance",
    emiseLe: day(-45),
    echeance: day(-15),
  },
  {
    id: "inv-004",
    numero: "FA-2026-0004",
    clientId: "cli-001",
    missionId: "mis-003",
    objet: "Maintenance des agents IA — mois en cours",
    montantHT: 150,
    tauxTva: 20,
    status: "emise",
    emiseLe: day(-2),
    echeance: day(28),
    recurrence: "mensuel",
  },
  {
    id: "inv-005",
    numero: "FA-2026-0005",
    clientId: "cli-002",
    missionId: "mis-002",
    objet: "Automatisation e-mails — acompte 40 %",
    montantHT: 1280,
    tauxTva: 20,
    status: "emise",
    emiseLe: day(-14),
    echeance: day(-1),
  },
];

const payments: Payment[] = [
  {
    id: "pay-001",
    numero: "REG-2026-0001",
    factureId: "inv-001",
    montant: 1728,
    date: day(-44),
    mode: "virement",
    reference: "VIR ATELIER NORD",
    creeLe: daysAgo(44),
  },
  {
    id: "pay-002",
    numero: "REG-2026-0002",
    factureId: "inv-002",
    montant: 2000,
    date: day(-3),
    mode: "virement",
    creeLe: daysAgo(3),
  },
];

const agents: Agent[] = [
  {
    id: "agt-001",
    nom: "Suivi commercial",
    role: "Relance des prospects et des clients sans nouvelles",
    tier: "IPOA",
    autonomy: "informed_proactive",
    status: "actif",
    derniereAction: "Prospect TechBridge sans réponse depuis 9 jours",
    risque: "moyen",
    hitlObligatoire: true,
  },
  {
    id: "agt-002",
    nom: "Suivi des missions",
    role: "Échéances, livraisons et avancement des missions",
    tier: "IPOA",
    autonomy: "informed_proactive",
    status: "actif",
    derniereAction: "Livraison de l'automatisation Océan Services dans 5 jours",
    risque: "faible",
    hitlObligatoire: false,
  },
  {
    id: "agt-003",
    nom: "Recouvrement assisté",
    role: "Relances adaptatives des factures échues",
    tier: "MDGA",
    autonomy: "monitored_delegated",
    status: "en_attente_hitl",
    derniereAction: "Proposition de relance FA-2026-0003 (15 j de retard)",
    risque: "eleve",
    hitlObligatoire: true,
  },
  {
    id: "agt-004",
    nom: "Pilotage financier",
    role: "Trésorerie, encaissements et abonnements",
    tier: "QAA",
    autonomy: "quality_assured",
    status: "actif",
    derniereAction: "Reste à encaisser et abonnements vérifiés",
    risque: "faible",
    hitlObligatoire: false,
  },
  {
    id: "agt-005",
    nom: "Conformité RGPD",
    role: "Données clients minimales et durées de conservation",
    tier: "QAA",
    autonomy: "quality_assured",
    status: "actif",
    derniereAction: "Aucune donnée superflue détectée",
    risque: "moyen",
    hitlObligatoire: false,
  },
  {
    id: "agt-006",
    nom: "Assistant e-mails",
    role: "Rédaction des e-mails aux clients (suivi, confirmations, réponses)",
    tier: "FCA",
    autonomy: "monitored_delegated",
    status: "actif",
    derniereAction: "Brouillon de confirmation de démarrage pour Océan Services",
    risque: "moyen",
    hitlObligatoire: true,
  },
];

const agentActions: AgentAction[] = [
  {
    id: "act-001",
    agentId: "agt-003",
    type: "relance_facture",
    description: "Envoyer une relance courtoise à Groupe Pacifique pour FA-2026-0003 (15 j de retard).",
    timestamp: daysAgo(0),
    requiresHitl: true,
    hitlStatus: "pending",
  },
  {
    id: "act-002",
    agentId: "agt-001",
    type: "relance_prospect",
    description: "TechBridge n'a pas répondu à la proposition MIS-2026-0005 : proposer un échange de 20 minutes.",
    timestamp: daysAgo(0),
    requiresHitl: true,
    hitlStatus: "pending",
  },
  {
    id: "act-003",
    agentId: "agt-005",
    type: "controle_rgpd",
    description: "Fiches clients limitées aux coordonnées professionnelles : rien à corriger.",
    timestamp: daysAgo(0),
    requiresHitl: false,
  },
];

const stamp = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const optional = (v: string | undefined) => (v ? v : undefined);

function currentInvoices(): Invoice[] {
  return deriveInvoices(invoices, clients, payments);
}

function invoiceById(invoiceId: string): Invoice | undefined {
  const record = invoices.find((i) => i.id === invoiceId);
  return record ? deriveInvoice(record, clients.find((c) => c.id === record.clientId), payments) : undefined;
}

function computeMetrics(): DashboardMetrics {
  return computeMetricsFrom({
    clients,
    missions,
    invoices: currentInvoices(),
    payments,
    agents,
    agentActions,
  });
}

function touchClient(clientId: string) {
  const client = clients.find((c) => c.id === clientId);
  if (client) client.derniereActivite = stamp();
}

/** Base de démonstration en mémoire. */
export const store = {
  getClients: () => clients.map((c) => ({ ...c })),
  getMissions: () => missions.map((m) => ({ ...m })),
  getInvoices: currentInvoices,
  getPayments: () => payments.map((p) => ({ ...p })),
  getAgents: () => [...agents],
  getAgentActions: () => [...agentActions],
  getMetrics: computeMetrics,

  createClient(input: ClientInput): WriteResult<Client> {
    if (clients.some((c) => c.nom.toLowerCase() === input.nom.toLowerCase())) {
      return failure(`Un client « ${input.nom} » existe déjà`, 409);
    }
    const client: Client = {
      id: id("cli"),
      nom: input.nom,
      contact: optional(input.contact),
      email: optional(input.email),
      telephone: optional(input.telephone),
      secteur: optional(input.secteur),
      statut: input.statut,
      source: optional(input.source),
      notes: optional(input.notes),
      creeLe: stamp(),
      derniereActivite: stamp(),
    };
    clients.push(client);
    return { ok: true, value: { ...client } };
  },

  updateClient(clientId: string, patch: ClientPatch): WriteResult<Client> {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return failure("Client introuvable", 404);
    if (patch.nom && clients.some((c) => c.id !== clientId && c.nom.toLowerCase() === patch.nom!.toLowerCase())) {
      return failure(`Un client « ${patch.nom} » existe déjà`, 409);
    }
    for (const [key, value] of Object.entries(patch)) {
      (client as unknown as Record<string, unknown>)[key] = key === "nom" || key === "statut" ? value : optional(value as string);
    }
    client.derniereActivite = stamp();
    return { ok: true, value: { ...client } };
  },

  createMission(input: MissionInput): WriteResult<Mission> {
    if (!clients.some((c) => c.id === input.clientId)) return failure("Client introuvable", 404);
    const mission: Mission = {
      id: id("mis"),
      code: nextNumber("MIS", new Date().getUTCFullYear(), missions.map((m) => m.code)),
      titre: input.titre,
      clientId: input.clientId,
      type: input.type,
      statut: input.statut,
      montantHT: input.montantHT,
      debut: optional(input.debut),
      fin: optional(input.fin),
      notes: optional(input.notes),
      creeLe: stamp(),
    };
    missions.push(mission);
    touchClient(input.clientId);
    return { ok: true, value: { ...mission } };
  },

  updateMission(missionId: string, patch: MissionPatch): WriteResult<Mission> {
    const mission = missions.find((m) => m.id === missionId);
    if (!mission) return failure("Mission introuvable", 404);
    const next = { ...mission };
    for (const [key, value] of Object.entries(patch)) {
      (next as unknown as Record<string, unknown>)[key] =
        typeof value === "string" && ["debut", "fin", "notes"].includes(key) ? optional(value) : value;
    }
    if (next.debut && next.fin && next.fin < next.debut) return failure("La fin prévue précède le début");
    Object.assign(mission, next);
    touchClient(mission.clientId);
    return { ok: true, value: { ...mission } };
  },

  createInvoice(input: InvoiceInput): WriteResult<Invoice> {
    if (!clients.some((c) => c.id === input.clientId)) return failure("Client introuvable", 404);
    if (input.missionId && !missionBelongs(missions.find((m) => m.id === input.missionId), input.clientId)) {
      return failure("Cette mission n'appartient pas à ce client");
    }
    const numero =
      input.numero ?? nextNumber("FA", Number(input.emiseLe.slice(0, 4)), invoices.map((i) => i.numero));
    if (invoices.some((i) => i.numero.toLowerCase() === numero.toLowerCase())) {
      return failure(`La facture ${numero} existe déjà`, 409);
    }
    const record: InvoiceRecord = {
      id: id("inv"),
      numero,
      clientId: input.clientId,
      missionId: input.missionId,
      objet: input.objet,
      montantHT: input.montantHT,
      tauxTva: input.tauxTva,
      status: input.status,
      emiseLe: input.emiseLe,
      echeance: input.echeance,
      recurrence: input.recurrence,
    };
    invoices.push(record);
    touchClient(input.clientId);
    return { ok: true, value: invoiceById(record.id)! };
  },

  /** Changement de statut à la main ou par un agent ; une facture payée ne se rouvre pas. */
  updateInvoiceStatus(invoiceId: string, status: InvoiceStatus): WriteResult<Invoice> {
    const record = invoices.find((i) => i.id === invoiceId);
    if (!record) return failure("Facture introuvable", 404);
    if (record.status === "payee") return failure("Facture déjà payée : statut verrouillé", 409);
    if (status === "payee" || status === "partiellement_payee") {
      return failure("Enregistrez un paiement : le statut « payée » en découle", 400);
    }
    record.status = status;
    return { ok: true, value: invoiceById(record.id)! };
  },

  recordPayment(input: PaymentInput): WriteResult<{ payment: Payment; invoice: Invoice }> {
    const record = invoices.find((i) => i.id === input.factureId);
    const invoice = record && invoiceById(record.id);
    if (!record || !invoice) return failure("Facture introuvable", 404);
    const problem = paymentProblem(invoice, input.montant);
    if (problem) return failure(problem, 409);
    const payment: Payment = {
      id: id("pay"),
      numero: nextNumber("REG", Number(input.date.slice(0, 4)), payments.map((p) => p.numero)),
      factureId: record.id,
      montant: round2(input.montant),
      date: input.date,
      mode: input.mode,
      reference: optional(input.reference),
      creeLe: stamp(),
    };
    payments.push(payment);
    const paid = payments.filter((p) => p.factureId === record.id);
    const last = paid.map((p) => p.date).sort().at(-1)!;
    const settled = settleInvoice(record.status, invoice.montantTTC, invoice.montantPaye + payment.montant, last);
    record.status = settled.status;
    if (settled.payeeLe) record.payeeLe = settled.payeeLe;
    touchClient(record.clientId);
    return { ok: true, value: { payment: { ...payment }, invoice: invoiceById(record.id)! } };
  },

  findOperationTarget(op: StatusOperation) {
    if (op.type === "statut_client") {
      const c = clients.find((x) => x.id === op.refId);
      return c ? { libelle: c.nom, actuel: statusLabel(c.statut) } : null;
    }
    if (op.type === "statut_mission") {
      const m = missions.find((x) => x.id === op.refId);
      return m ? { libelle: `Mission ${m.code} (${m.titre})`, actuel: statusLabel(m.statut) } : null;
    }
    const i = invoiceById(op.refId);
    return i ? { libelle: `Facture ${i.numero} (${i.client})`, actuel: statusLabel(i.status) } : null;
  },

  /** Décision humaine, une seule fois : une action déjà tranchée est refusée (null). */
  resolveHitl(
    actionId: string,
    decision: "approved" | "rejected",
    edits?: { objet?: string; corps?: string; valeur?: string },
    decidePar?: string,
  ) {
    const action = agentActions.find((a) => a.id === actionId);
    if (!action || !action.requiresHitl || action.hitlStatus !== "pending") return null;
    action.hitlStatus = decision;
    action.decidePar = decidePar;
    action.decideLe = stamp();
    if (decision === "approved" && action.email) {
      action.email = { ...action.email, ...cleanEdits(edits) };
    }
    if (decision === "approved" && action.operation) {
      action.operation = editedOperation(action.operation, edits?.valeur);
    }
    const agent = agents.find((a) => a.id === action.agentId);
    if (agent && agent.status === "en_attente_hitl") {
      agent.status = decision === "approved" ? "actif" : "pause";
      agent.derniereAction =
        decision === "approved" ? `HITL approuvé — ${action.type}` : `HITL refusé — ${action.type}`;
    }
    return { ...action };
  },

  /** Réserve l'exécution d'une action approuvée (une seule à la fois, relance après échec). */
  claimExecution(actionId: string) {
    const action = agentActions.find((a) => a.id === actionId);
    if (!action || action.hitlStatus !== "approved") return null;
    if (action.execution && !isRetryable(action.execution)) return null;
    action.execution = { statut: "en_cours", le: stamp(), message: "" };
    return { ...action };
  },

  finishExecution(actionId: string, execution: ActionExecution) {
    const action = agentActions.find((a) => a.id === actionId);
    if (action) action.execution = execution;
  },

  findRecipient(draft: EmailDraft) {
    if (draft.cible === "client") {
      const client = clients.find((c) => c.id === draft.refId);
      return client ? { nom: client.contact ? `${client.contact} (${client.nom})` : client.nom, email: client.email ?? null } : null;
    }
    const invoice = invoiceById(draft.refId);
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
        operation?: StatusOperation | null;
      }>;
    },
    model: string,
  ) {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return null;
    const timestamp = stamp();
    const created: AgentAction[] = proposal.actions.map((a, i) => ({
      id: `act-${Date.now()}-${i}`,
      agentId,
      type: a.type,
      description: a.description,
      timestamp,
      requiresHitl: a.requiresHitl,
      hitlStatus: a.requiresHitl ? "pending" : undefined,
      ...(a.email ? { email: a.email } : {}),
      ...(a.operation ? { operation: a.operation } : {}),
    }));
    agentActions.unshift(...created);
    agent.derniereAction = proposal.resume;
    if (created.some((a) => a.requiresHitl)) agent.status = "en_attente_hitl";
    return { agentId, model, resume: proposal.resume, actions: created };
  },
};
