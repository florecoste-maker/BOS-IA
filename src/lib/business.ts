/**
 * Règles métier de l'agence, partagées par le mode démonstration et MySQL :
 * montants TTC, effet des paiements sur une facture, retards, numérotation
 * et validation des saisies du cockpit.
 */
import type {
  Client,
  ClientStatus,
  Invoice,
  InvoiceRecurrence,
  InvoiceStatus,
  Mission,
  MissionStatus,
  MissionType,
  Payment,
  PaymentMode,
} from "./types";

export const CLIENT_STATUSES = ["prospect", "actif", "inactif", "perdu"] as const satisfies readonly ClientStatus[];
export const MISSION_TYPES = [
  "agent_ia",
  "automatisation",
  "conseil",
  "abonnement",
  "autre",
] as const satisfies readonly MissionType[];
export const MISSION_STATUSES = [
  "proposition",
  "signee",
  "en_cours",
  "livree",
  "terminee",
  "annulee",
] as const satisfies readonly MissionStatus[];
export const INVOICE_STATUSES = [
  "brouillon",
  "emise",
  "partiellement_payee",
  "payee",
  "relance",
  "impayee",
  "annulee",
] as const satisfies readonly InvoiceStatus[];
/** Statuts qu'on choisit à la main ; « payée » et « partiellement payée » viennent des paiements. */
export const MANUAL_INVOICE_STATUSES = ["brouillon", "emise", "relance", "impayee", "annulee"] as const;
export const RECURRENCES = ["mensuel", "trimestriel", "annuel"] as const satisfies readonly InvoiceRecurrence[];
export const PAYMENT_MODES = [
  "virement",
  "carte",
  "prelevement",
  "cheque",
  "especes",
  "stripe",
  "paypal",
  "autre",
] as const satisfies readonly PaymentMode[];

export const DEFAULT_TVA = 20;

/** Écart toléré sur un solde (arrondis au centime). */
const CENT = 0.005;

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function ttc(montantHT: number, tauxTva: number) {
  return round2(montantHT * (1 + tauxTva / 100));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ---------- factures ---------- */

/** Facture telle qu'enregistrée ; le reste (client, montants payés, retard) se calcule à la lecture. */
export interface InvoiceRecord {
  id: string;
  numero: string;
  clientId: string;
  missionId?: string;
  objet?: string;
  montantHT: number;
  tauxTva: number;
  status: InvoiceStatus;
  emiseLe: string;
  echeance: string;
  payeeLe?: string;
  recurrence?: InvoiceRecurrence;
}

/** Jours de retard : seulement pour une facture émise, non soldée, dont l'échéance est passée. */
export function daysLate(echeance: string, status: InvoiceStatus, now = today()) {
  if (status === "payee" || status === "annulee" || status === "brouillon") return 0;
  const diff = (Date.parse(now) - Date.parse(echeance)) / 86_400_000;
  return diff > 0 ? Math.floor(diff) : 0;
}

/** Facture complète pour l'affichage, à partir de la fiche client et des paiements. */
export function deriveInvoice(
  record: InvoiceRecord,
  client: Pick<Client, "nom" | "email"> | undefined,
  payments: Payment[],
  now = today(),
): Invoice {
  const montantTTC = ttc(record.montantHT, record.tauxTva);
  const montantPaye = round2(
    payments.filter((p) => p.factureId === record.id).reduce((sum, p) => sum + p.montant, 0),
  );
  const closed = record.status === "payee" || record.status === "annulee";
  return {
    ...record,
    client: client?.nom ?? "Client supprimé",
    emailClient: client?.email || undefined,
    montantTTC,
    montantPaye,
    resteDu: closed ? 0 : Math.max(0, round2(montantTTC - montantPaye)),
    joursRetard: daysLate(record.echeance, record.status, now),
  };
}

export function deriveInvoices(
  records: InvoiceRecord[],
  clients: Client[],
  payments: Payment[],
  now = today(),
): Invoice[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  return records.map((r) => deriveInvoice(r, byId.get(r.clientId), payments, now));
}

/**
 * Statut d'une facture après un paiement : soldée → « payée » (avec la date du
 * paiement qui la solde), sinon « partiellement payée ». Une facture en
 * relance ou impayée garde ce statut tant qu'elle n'est pas soldée.
 */
export function settleInvoice(
  status: InvoiceStatus,
  montantTTC: number,
  totalPaye: number,
  dernierPaiement: string,
): { status: InvoiceStatus; payeeLe?: string } {
  if (status === "annulee" || status === "brouillon") return { status };
  if (totalPaye >= montantTTC - CENT) return { status: "payee", payeeLe: dernierPaiement };
  if (totalPaye > 0 && (status === "emise" || status === "payee")) return { status: "partiellement_payee" };
  return { status };
}

/** Un paiement n'est accepté que sur une facture émise, non soldée, et sans dépasser le reste dû. */
export function paymentProblem(invoice: Invoice, montant: number): string | null {
  if (invoice.status === "brouillon") return "Facture en brouillon : émettez-la avant d'enregistrer un paiement";
  if (invoice.status === "annulee") return "Facture annulée : aucun paiement possible";
  if (invoice.status === "payee" || invoice.resteDu <= CENT) return "Facture déjà soldée";
  if (montant > invoice.resteDu + CENT) {
    return `Montant supérieur au reste dû (${invoice.resteDu.toFixed(2).replace(".", ",")} €)`;
  }
  return null;
}

/* ---------- numérotation ---------- */

/** Prochain numéro d'une série annuelle : FA-2026-0001, FA-2026-0002… */
export function nextNumber(prefix: string, year: number, existing: string[]) {
  const start = `${prefix}-${year}-`;
  const last = existing
    .filter((n) => n.startsWith(start))
    .map((n) => Number(n.slice(start.length)) || 0)
    .reduce((max, n) => Math.max(max, n), 0);
  return `${start}${String(last + 1).padStart(4, "0")}`;
}

/* ---------- validation des saisies ---------- */

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ClientInput {
  nom: string;
  contact?: string;
  email?: string;
  telephone?: string;
  secteur?: string;
  statut: ClientStatus;
  source?: string;
  notes?: string;
}
export type ClientPatch = Partial<ClientInput>;

export interface MissionInput {
  titre: string;
  clientId: string;
  type: MissionType;
  statut: MissionStatus;
  montantHT: number;
  debut?: string;
  fin?: string;
  notes?: string;
}
export type MissionPatch = Partial<Omit<MissionInput, "clientId">>;

export interface InvoiceInput {
  /** Vide : numéro attribué automatiquement (FA-AAAA-NNNN). */
  numero?: string;
  clientId: string;
  missionId?: string;
  objet?: string;
  montantHT: number;
  tauxTva: number;
  status: "brouillon" | "emise";
  emiseLe: string;
  echeance: string;
  recurrence?: InvoiceRecurrence;
}

export interface PaymentInput {
  factureId: string;
  montant: number;
  date: string;
  mode: PaymentMode;
  reference?: string;
}

type Raw = Record<string, unknown>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function text(raw: Raw, key: string, label: string, max: number, errors: string[], required = false) {
  const v = raw[key];
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
    if (required) errors.push(`${label} obligatoire`);
    return v === undefined ? undefined : "";
  }
  if (typeof v !== "string") {
    errors.push(`${label} invalide`);
    return undefined;
  }
  const t = v.trim();
  if (t.length > max) errors.push(`${label} : ${max} caractères maximum`);
  return t;
}

function oneOf<T extends string>(raw: Raw, key: string, label: string, values: readonly T[], errors: string[]) {
  const v = raw[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "string" && (values as readonly string[]).includes(v)) return v as T;
  errors.push(`${label} invalide`);
  return undefined;
}

function amount(raw: Raw, key: string, label: string, errors: string[], { positive = false } = {}) {
  const v = raw[key];
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".").replace(/\s/g, "")) : NaN;
  if (!Number.isFinite(n) || n < 0 || (positive && n === 0) || n > 100_000_000) {
    errors.push(`${label} invalide`);
    return undefined;
  }
  return round2(n);
}

function date(raw: Raw, key: string, label: string, errors: string[]) {
  const v = raw[key];
  if (v === undefined || v === null || v === "") return v === undefined ? undefined : "";
  if (!isIsoDate(v)) {
    errors.push(`${label} : date invalide`);
    return undefined;
  }
  return v;
}

/** Retire les champs absents (patch) ; une chaîne vide efface la valeur facultative. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function done<T>(errors: string[], value: T): Checked<T> {
  return errors.length ? { ok: false, error: errors.join(" ; ") } : { ok: true, value };
}

export function checkClient(raw: Raw, { partial = false } = {}): Checked<ClientPatch> {
  const errors: string[] = [];
  const email = text(raw, "email", "E-mail", 255, errors);
  if (email && !EMAIL.test(email)) errors.push("E-mail invalide");
  const value = defined({
    nom: text(raw, "nom", "Nom du client", 255, errors, !partial),
    contact: text(raw, "contact", "Contact", 255, errors),
    email: email?.toLowerCase(),
    telephone: text(raw, "telephone", "Téléphone", 64, errors),
    secteur: text(raw, "secteur", "Secteur", 255, errors),
    statut: oneOf(raw, "statut", "Statut", CLIENT_STATUSES, errors) ?? (partial ? undefined : "prospect"),
    source: text(raw, "source", "Source", 255, errors),
    notes: text(raw, "notes", "Notes", 4000, errors),
  });
  if (partial && value.nom === "") errors.push("Nom du client obligatoire");
  return done(errors, value);
}

export function checkMission(raw: Raw, { partial = false } = {}): Checked<MissionPatch & { clientId?: string }> {
  const errors: string[] = [];
  const value = defined({
    titre: text(raw, "titre", "Intitulé", 255, errors, !partial),
    clientId: partial ? undefined : text(raw, "clientId", "Client", 64, errors, true),
    type: oneOf(raw, "type", "Type de mission", MISSION_TYPES, errors) ?? (partial ? undefined : "agent_ia"),
    statut: oneOf(raw, "statut", "Statut", MISSION_STATUSES, errors) ?? (partial ? undefined : "proposition"),
    montantHT: amount(raw, "montantHT", "Montant HT", errors) ?? (partial ? undefined : 0),
    debut: date(raw, "debut", "Début", errors),
    fin: date(raw, "fin", "Fin prévue", errors),
    notes: text(raw, "notes", "Notes", 4000, errors),
  });
  if (partial && value.titre === "") errors.push("Intitulé obligatoire");
  if (value.debut && value.fin && value.fin < value.debut) errors.push("La fin prévue précède le début");
  return done(errors, value);
}

export function checkInvoice(raw: Raw): Checked<InvoiceInput> {
  const errors: string[] = [];
  const numero = text(raw, "numero", "Numéro", 64, errors);
  const emiseLe = date(raw, "emiseLe", "Date d'émission", errors) || today();
  const echeance = date(raw, "echeance", "Échéance", errors);
  const montantHT = amount(raw, "montantHT", "Montant HT", errors, { positive: true });
  const tva = amount(raw, "tauxTva", "Taux de TVA", errors);
  if (tva !== undefined && tva > 100) errors.push("Taux de TVA invalide");
  const value: InvoiceInput = {
    numero: numero || undefined,
    clientId: text(raw, "clientId", "Client", 64, errors, true) ?? "",
    missionId: text(raw, "missionId", "Mission", 64, errors) || undefined,
    objet: text(raw, "objet", "Objet", 255, errors) || undefined,
    montantHT: montantHT ?? 0,
    tauxTva: tva ?? DEFAULT_TVA,
    status: oneOf(raw, "status", "Statut", ["brouillon", "emise"] as const, errors) ?? "emise",
    emiseLe,
    echeance: echeance || "",
    recurrence: oneOf(raw, "recurrence", "Récurrence", RECURRENCES, errors),
  };
  if (montantHT === undefined && !errors.some((e) => e.startsWith("Montant"))) errors.push("Montant HT obligatoire");
  if (!value.echeance && !errors.some((e) => e.startsWith("Échéance"))) errors.push("Échéance obligatoire");
  if (value.echeance && value.echeance < value.emiseLe) errors.push("L'échéance précède la date d'émission");
  return done(errors, value);
}

export function checkPayment(raw: Raw): Checked<PaymentInput> {
  const errors: string[] = [];
  const montant = amount(raw, "montant", "Montant", errors, { positive: true });
  const day = date(raw, "date", "Date du paiement", errors) || today();
  // Un jour de marge : « aujourd'hui » à Paris peut être demain en UTC.
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (day > tomorrow) errors.push("Date du paiement dans le futur");
  const value: PaymentInput = {
    factureId: text(raw, "factureId", "Facture", 64, errors, true) ?? "",
    montant: montant ?? 0,
    date: day,
    mode: oneOf(raw, "mode", "Mode de paiement", PAYMENT_MODES, errors) ?? "virement",
    reference: text(raw, "reference", "Référence", 255, errors) || undefined,
  };
  if (montant === undefined && !errors.some((e) => e.startsWith("Montant"))) errors.push("Montant obligatoire");
  return done(errors, value);
}

/* ---------- résultats des écritures ---------- */

export type WriteResult<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

export function failure(error: string, status = 400): { ok: false; error: string; status: number } {
  return { ok: false, error, status };
}

/** Mission rattachée à ce client ? (une facture ne peut pas viser la mission d'un autre client) */
export function missionBelongs(mission: Mission | undefined, clientId: string) {
  return Boolean(mission && mission.clientId === clientId);
}
