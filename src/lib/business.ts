/**
 * Règles métier de l'agence, partagées par le mode démonstration et MySQL :
 * montants TTC, effet des paiements sur une facture, retards, numérotation
 * et validation des saisies du cockpit.
 */
import type {
  Client,
  ClientStatus,
  Contact,
  ContactCategory,
  Invoice,
  InvoiceRecurrence,
  InvoiceStatus,
  Mission,
  MissionStatus,
  MissionType,
  Payment,
  PaymentMode,
  Quote,
  QuoteLine,
  QuoteStatus,
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

export const CONTACT_CATEGORIES = [
  "interlocuteur",
  "client",
  "prospect",
  "fournisseur",
  "autre",
] as const satisfies readonly ContactCategory[];
export const QUOTE_STATUSES = [
  "brouillon",
  "envoye",
  "accepte",
  "refuse",
  "expire",
  "facture",
] as const satisfies readonly QuoteStatus[];
/** Statuts qu'on choisit à la main ; « expiré » se déduit de la date, « facturé » de la conversion. */
export const MANUAL_QUOTE_STATUSES = ["brouillon", "envoye", "accepte", "refuse"] as const;
export const MAX_QUOTE_LINES = 50;
/** Validité d'un devis par défaut (jours). */
export const QUOTE_VALIDITY_DAYS = 30;

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

/* ---------- devis ---------- */

/** Devis tel qu'enregistré ; totaux, nom du client et expiration se calculent à la lecture. */
export interface QuoteRecord {
  id: string;
  numero: string;
  clientId: string;
  missionId?: string;
  objet: string;
  lignes: QuoteLine[];
  tauxTva: number;
  status: QuoteStatus;
  emisLe: string;
  valableJusquau: string;
  factureId?: string;
  creeLe: string;
}

export function quoteTotalHT(lignes: QuoteLine[]) {
  return round2(lignes.reduce((sum, l) => sum + round2(l.quantite * l.prixUnitaireHT), 0));
}

/** Un devis envoyé dont la date de validité est passée est « expiré ». */
export function deriveQuote(record: QuoteRecord, client: Pick<Client, "nom"> | undefined, now = today()): Quote {
  const montantHT = quoteTotalHT(record.lignes);
  return {
    ...record,
    client: client?.nom ?? "Client supprimé",
    montantHT,
    montantTTC: ttc(montantHT, record.tauxTva),
    status: record.status === "envoye" && record.valableJusquau < now ? "expire" : record.status,
  };
}

export function deriveQuotes(records: QuoteRecord[], clients: Client[], now = today()): Quote[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  return records.map((r) => deriveQuote(r, byId.get(r.clientId), now));
}

/** Seul un devis accepté, pas encore facturé, devient une facture. */
export function quoteToInvoiceProblem(quote: Quote): string | null {
  if (quote.status === "facture" || quote.factureId) return "Devis déjà facturé";
  if (quote.status !== "accepte") return "Seul un devis accepté peut être facturé";
  if (quote.montantHT <= 0) return "Devis sans montant";
  return null;
}

/** Facture issue d'un devis accepté : même client, mission, montant et TVA ; échéance à 30 jours. */
export function invoiceFromQuote(quote: Quote, emiseLe = today()): InvoiceInput {
  const echeance = new Date(Date.parse(emiseLe) + 30 * 86_400_000).toISOString().slice(0, 10);
  return {
    clientId: quote.clientId,
    missionId: quote.missionId,
    objet: `${quote.objet} (devis ${quote.numero})`.slice(0, 255),
    montantHT: quote.montantHT,
    tauxTva: quote.tauxTva,
    status: "emise",
    emiseLe,
    echeance,
  };
}

/** Changement de statut à la main : un devis facturé ne bouge plus. */
export function quoteStatusProblem(current: QuoteStatus, next: QuoteStatus): string | null {
  if (current === "facture") return "Devis déjà facturé : statut verrouillé";
  if (!(MANUAL_QUOTE_STATUSES as readonly string[]).includes(next)) return "Statut non modifiable à la main";
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

export interface ContactInput {
  clientId: string;
  nom: string;
  prenom?: string;
  fonction?: string;
  email?: string;
  telephone?: string;
  categorie: ContactCategory;
  principal: boolean;
  notes?: string;
}
export type ContactPatch = Partial<Omit<ContactInput, "clientId">>;

export function checkContact(raw: Raw, { partial = false } = {}): Checked<ContactPatch & { clientId?: string }> {
  const errors: string[] = [];
  const email = text(raw, "email", "E-mail", 255, errors);
  if (email && !EMAIL.test(email)) errors.push("E-mail invalide");
  const principal = raw.principal;
  if (principal !== undefined && typeof principal !== "boolean") errors.push("Principal invalide");
  const value = defined({
    clientId: partial ? undefined : text(raw, "clientId", "Client", 64, errors, true),
    nom: text(raw, "nom", "Nom", 255, errors, !partial),
    prenom: text(raw, "prenom", "Prénom", 255, errors),
    fonction: text(raw, "fonction", "Fonction", 255, errors),
    email: email?.toLowerCase(),
    telephone: text(raw, "telephone", "Téléphone", 64, errors),
    categorie: oneOf(raw, "categorie", "Catégorie", CONTACT_CATEGORIES, errors) ?? (partial ? undefined : "interlocuteur"),
    principal: typeof principal === "boolean" ? principal : partial ? undefined : false,
    notes: text(raw, "notes", "Notes", 4000, errors),
  });
  if (partial && value.nom === "") errors.push("Nom obligatoire");
  return done(errors, value);
}

export interface QuoteInput {
  clientId: string;
  missionId?: string;
  objet: string;
  lignes: QuoteLine[];
  tauxTva: number;
  status: "brouillon" | "envoye";
  emisLe: string;
  valableJusquau: string;
}

export function checkQuote(raw: Raw): Checked<QuoteInput> {
  const errors: string[] = [];
  const emisLe = date(raw, "emisLe", "Date du devis", errors) || today();
  const valable =
    date(raw, "valableJusquau", "Validité", errors) ||
    new Date(Date.parse(emisLe) + QUOTE_VALIDITY_DAYS * 86_400_000).toISOString().slice(0, 10);
  const tva = amount(raw, "tauxTva", "Taux de TVA", errors);
  if (tva !== undefined && tva > 100) errors.push("Taux de TVA invalide");
  const lignes: QuoteLine[] = [];
  if (!Array.isArray(raw.lignes) || raw.lignes.length === 0) errors.push("Au moins une ligne");
  else if (raw.lignes.length > MAX_QUOTE_LINES) errors.push(`${MAX_QUOTE_LINES} lignes maximum`);
  else {
    raw.lignes.forEach((line, i) => {
      const l = (line ?? {}) as Raw;
      const lineErrors: string[] = [];
      const designation = text(l, "designation", "Désignation", 255, lineErrors, true);
      const quantite = amount(l, "quantite", "Quantité", lineErrors, { positive: true });
      const prix = amount(l, "prixUnitaireHT", "Prix unitaire HT", lineErrors);
      if (quantite === undefined && !lineErrors.some((e) => e.startsWith("Quantité"))) lineErrors.push("Quantité obligatoire");
      if (prix === undefined && !lineErrors.some((e) => e.startsWith("Prix"))) lineErrors.push("Prix unitaire HT obligatoire");
      if (lineErrors.length) errors.push(`Ligne ${i + 1} : ${lineErrors.join(", ")}`);
      else lignes.push({ designation: designation!, quantite: quantite!, prixUnitaireHT: prix! });
    });
  }
  const value: QuoteInput = {
    clientId: text(raw, "clientId", "Client", 64, errors, true) ?? "",
    missionId: text(raw, "missionId", "Mission", 64, errors) || undefined,
    objet: text(raw, "objet", "Objet", 255, errors, true) ?? "",
    lignes,
    tauxTva: tva ?? DEFAULT_TVA,
    status: oneOf(raw, "status", "Statut", ["brouillon", "envoye"] as const, errors) ?? "brouillon",
    emisLe,
    valableJusquau: valable,
  };
  if (value.valableJusquau < value.emisLe) errors.push("La validité précède la date du devis");
  if (lignes.length && quoteTotalHT(lignes) <= 0) errors.push("Montant total nul");
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

/** Un seul interlocuteur principal par espace : les autres perdent ce rôle. */
export function withSinglePrincipal(contacts: Contact[], principalId: string): Contact[] {
  return contacts.map((c) => (c.clientId === contacts.find((x) => x.id === principalId)?.clientId ? { ...c, principal: c.id === principalId } : c));
}
