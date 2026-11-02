/**
 * Moteur MySQL / MariaDB du cockpit BOS-IA.
 * Les tables (préfixe `bos_`) sont créées au premier accès ; seuls les 6 agents
 * sont insérés : aucune donnée métier fictive. Clients, missions, factures et
 * paiements sont saisis dans le cockpit (ou importés).
 */
import { randomUUID } from "node:crypto";
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { computeMetrics } from "@/lib/metrics";
import { editedOperation } from "@/lib/actions/operations";
import { STALE_EXECUTION_MS, cleanEdits } from "@/lib/actions/rules";
import {
  type InvoiceRecord,
  type QuoteRecord,
  deriveInvoice,
  deriveQuote,
  deriveQuotes,
  invoiceFromQuote,
  quoteStatusProblem,
  quoteToInvoiceProblem,
  deriveInvoices,
  failure,
  missionBelongs,
  nextNumber,
  paymentProblem,
  round2,
  settleInvoice,
} from "@/lib/business";
import { statusLabel } from "@/lib/format";
import { store } from "@/lib/store";
import type {
  ActionExecution,
  Agent,
  AgentAction,
  AgentRunLog,
  AuditEntry,
  Client,
  Contact,
  EmailDraft,
  Invoice,
  Mission,
  Payment,
  QuoteLine,
  StatusOperation,
  User,
} from "@/lib/types";
import type { Repository } from "@/lib/data";
import { getDatabaseConfig, type DatabaseConfig } from "./config";

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS bos_clients (
    id VARCHAR(64) PRIMARY KEY,
    nom VARCHAR(255) NOT NULL UNIQUE,
    contact VARCHAR(255) NULL,
    email VARCHAR(255) NULL,
    telephone VARCHAR(64) NULL,
    secteur VARCHAR(255) NULL,
    statut VARCHAR(32) NOT NULL,
    source VARCHAR(255) NULL,
    notes TEXT NULL,
    cree_le DATETIME(3) NOT NULL,
    derniere_activite DATETIME(3) NOT NULL
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_contacts (
    id VARCHAR(64) PRIMARY KEY,
    client_id VARCHAR(64) NOT NULL,
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255) NULL,
    fonction VARCHAR(255) NULL,
    email VARCHAR(255) NULL,
    telephone VARCHAR(64) NULL,
    categorie VARCHAR(32) NOT NULL,
    principal TINYINT(1) NOT NULL DEFAULT 0,
    notes TEXT NULL,
    cree_le DATETIME(3) NOT NULL,
    INDEX idx_bos_contacts_client (client_id)
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_devis (
    id VARCHAR(64) PRIMARY KEY,
    numero VARCHAR(64) NOT NULL UNIQUE,
    client_id VARCHAR(64) NOT NULL,
    mission_id VARCHAR(64) NULL,
    objet VARCHAR(255) NOT NULL,
    lignes LONGTEXT NOT NULL,
    taux_tva DECIMAL(5,2) NOT NULL DEFAULT 20,
    statut VARCHAR(16) NOT NULL,
    emis_le DATE NOT NULL,
    valable_jusquau DATE NOT NULL,
    facture_id VARCHAR(64) NULL,
    cree_le DATETIME(3) NOT NULL,
    INDEX idx_bos_devis_client (client_id)
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_missions (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    titre VARCHAR(255) NOT NULL,
    client_id VARCHAR(64) NOT NULL,
    type VARCHAR(32) NOT NULL,
    statut VARCHAR(32) NOT NULL,
    montant_ht DECIMAL(12,2) NOT NULL DEFAULT 0,
    debut DATE NULL,
    fin DATE NULL,
    notes TEXT NULL,
    cree_le DATETIME(3) NOT NULL,
    INDEX idx_bos_missions_client (client_id)
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_factures (
    id VARCHAR(64) PRIMARY KEY,
    numero VARCHAR(64) NOT NULL UNIQUE,
    client_id VARCHAR(64) NOT NULL,
    mission_id VARCHAR(64) NULL,
    objet VARCHAR(255) NULL,
    montant_ht DECIMAL(12,2) NOT NULL,
    taux_tva DECIMAL(5,2) NOT NULL DEFAULT 20,
    statut VARCHAR(32) NOT NULL,
    emise_le DATE NOT NULL,
    echeance DATE NOT NULL,
    payee_le DATE NULL,
    recurrence VARCHAR(16) NULL,
    INDEX idx_bos_factures_client (client_id)
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_paiements (
    id VARCHAR(64) PRIMARY KEY,
    numero VARCHAR(64) NOT NULL UNIQUE,
    facture_id VARCHAR(64) NOT NULL,
    montant DECIMAL(12,2) NOT NULL,
    date_paiement DATE NOT NULL,
    mode VARCHAR(32) NOT NULL,
    reference VARCHAR(255) NULL,
    cree_le DATETIME(3) NOT NULL,
    INDEX idx_bos_paiements_facture (facture_id)
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_agents (
    id VARCHAR(64) PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    tier VARCHAR(16) NOT NULL,
    autonomy VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    derniere_action TEXT NOT NULL,
    risque VARCHAR(16) NOT NULL,
    hitl_obligatoire TINYINT(1) NOT NULL DEFAULT 0
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_agent_actions (
    id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(64) NOT NULL,
    type VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    requires_hitl TINYINT(1) NOT NULL DEFAULT 0,
    hitl_status VARCHAR(16) NULL,
    model VARCHAR(128) NULL,
    INDEX idx_bos_agent_actions_created (created_at)
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_agent_runs (
    id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(64) NOT NULL,
    declencheur VARCHAR(16) NOT NULL,
    debut DATETIME(3) NOT NULL,
    fin DATETIME(3) NOT NULL,
    statut VARCHAR(16) NOT NULL,
    message TEXT NOT NULL,
    actions INT NOT NULL DEFAULT 0,
    model VARCHAR(128) NULL,
    INDEX idx_bos_agent_runs_debut (debut)
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    nom VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL,
    actif TINYINT(1) NOT NULL DEFAULT 1,
    password_hash VARCHAR(255) NOT NULL,
    cree_le DATETIME(3) NOT NULL,
    derniere_connexion DATETIME(3) NULL
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_audit (
    id VARCHAR(64) PRIMARY KEY,
    le DATETIME(3) NOT NULL,
    utilisateur_id VARCHAR(64) NOT NULL,
    utilisateur VARCHAR(255) NOT NULL,
    action VARCHAR(64) NOT NULL,
    objet VARCHAR(255) NOT NULL,
    details TEXT NULL,
    ip VARCHAR(64) NULL,
    INDEX idx_bos_audit_le (le),
    INDEX idx_bos_audit_user (utilisateur_id)
  ) DEFAULT CHARSET=utf8mb4`,
];

/**
 * Colonnes ajoutées après la création initiale des tables. MySQL 8 ne connaît
 * pas « ADD COLUMN IF NOT EXISTS » : on vérifie dans information_schema.
 */
export const MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "bos_users", column: "client_id", ddl: "VARCHAR(64) NULL" },
  { table: "bos_agent_actions", column: "email_cible", ddl: "VARCHAR(16) NULL" },
  { table: "bos_agent_actions", column: "email_ref", ddl: "VARCHAR(64) NULL" },
  { table: "bos_agent_actions", column: "email_objet", ddl: "VARCHAR(255) NULL" },
  { table: "bos_agent_actions", column: "email_corps", ddl: "TEXT NULL" },
  { table: "bos_agent_actions", column: "exec_statut", ddl: "VARCHAR(16) NULL" },
  { table: "bos_agent_actions", column: "exec_le", ddl: "DATETIME(3) NULL" },
  { table: "bos_agent_actions", column: "exec_message", ddl: "TEXT NULL" },
  { table: "bos_agent_actions", column: "decide_par", ddl: "VARCHAR(255) NULL" },
  { table: "bos_agent_actions", column: "decide_le", ddl: "DATETIME(3) NULL" },
  { table: "bos_agent_actions", column: "op_type", ddl: "VARCHAR(32) NULL" },
  { table: "bos_agent_actions", column: "op_ref", ddl: "VARCHAR(64) NULL" },
  { table: "bos_agent_actions", column: "op_valeur", ddl: "VARCHAR(32) NULL" },
];

async function migrate(pool: Pool) {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'bos\\_%'",
  );
  const existing = new Set(rows.map((r) => `${r.t}.${r.c}`));
  for (const m of MIGRATIONS) {
    if (!existing.has(`${m.table}.${m.column}`)) {
      await pool.query(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.ddl}`);
    }
  }
}

/* ---------- connexion ---------- */

interface DbState {
  key: string;
  pool: Pool;
  ready: Promise<void>;
}

const globalForDb = globalThis as typeof globalThis & { __bosDb?: DbState };

function configKey(c: DatabaseConfig) {
  return `${c.user}@${c.host}:${c.port}/${c.database}`;
}

async function prepare(pool: Pool) {
  for (const statement of SCHEMA) await pool.query(statement);
  await migrate(pool);
  const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM bos_agents");
  if (Number(rows[0].n) === 0) {
    for (const agent of store.getAgents()) {
      await pool.execute(
        `INSERT IGNORE INTO bos_agents
           (id, nom, role, tier, autonomy, status, derniere_action, risque, hitl_obligatoire)
         VALUES (?, ?, ?, ?, ?, 'actif', 'Aucune analyse pour l''instant', ?, ?)`,
        [
          agent.id,
          agent.nom,
          agent.role,
          agent.tier,
          agent.autonomy,
          agent.risque,
          agent.hitlObligatoire ? 1 : 0,
        ],
      );
    }
  }
}

/** Pool partagé ; schéma vérifié une fois par processus (et réessayé après un échec). */
async function db(): Promise<Pool> {
  const config = getDatabaseConfig();
  if (!config) throw new Error("Base de données non configurée");
  const key = configKey(config);

  let state = globalForDb.__bosDb;
  if (!state || state.key !== key) {
    if (state) void state.pool.end().catch(() => {});
    const pool = mysql.createPool({
      ...config,
      charset: "utf8mb4",
      timezone: "Z",
      dateStrings: true,
      connectionLimit: 5,
      connectTimeout: 10_000,
    });
    state = { key, pool, ready: prepare(pool) };
    globalForDb.__bosDb = state;
  }

  try {
    await state.ready;
  } catch (error) {
    if (globalForDb.__bosDb === state) {
      globalForDb.__bosDb = undefined;
      void state.pool.end().catch(() => {});
    }
    throw error;
  }
  return state.pool;
}

export async function transaction<T>(work: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await (await db()).getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

/** Vérifie que la base répond (pour /app/integrations). */
export async function probeDatabase(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await (await db()).query("SELECT 1");
    return { ok: true };
  } catch (error) {
    const code = (error as { code?: string }).code;
    return { ok: false, message: code ? `Connexion refusée (${code})` : "Connexion impossible" };
  }
}

/* ---------- conversions ---------- */

/** ISO 8601 → DATETIME(3) UTC. */
export function toSqlDateTime(iso: string) {
  return new Date(iso).toISOString().slice(0, 23).replace("T", " ");
}

/** DATETIME renvoyé en chaîne (dateStrings, fuseau UTC) → ISO 8601. */
export function fromSqlDateTime(value: string) {
  return new Date(`${value.replace(" ", "T")}Z`).toISOString();
}

type Row = RowDataPacket & Record<string, unknown>;

const opt = (v: unknown) => (v == null || v === "" ? undefined : String(v));
/** Chaîne vide → NULL en base (champ facultatif effacé). */
const nul = (v: string | undefined) => (v ? v : null);

function toClient(r: Row): Client {
  return {
    id: String(r.id),
    nom: String(r.nom),
    contact: opt(r.contact),
    email: opt(r.email),
    telephone: opt(r.telephone),
    secteur: opt(r.secteur),
    statut: r.statut as Client["statut"],
    source: opt(r.source),
    notes: opt(r.notes),
    creeLe: fromSqlDateTime(String(r.cree_le)),
    derniereActivite: fromSqlDateTime(String(r.derniere_activite)),
  };
}

function toContact(r: Row): Contact {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    nom: String(r.nom),
    prenom: opt(r.prenom),
    fonction: opt(r.fonction),
    email: opt(r.email),
    telephone: opt(r.telephone),
    categorie: r.categorie as Contact["categorie"],
    principal: Boolean(Number(r.principal)),
    notes: opt(r.notes),
    creeLe: fromSqlDateTime(String(r.cree_le)),
  };
}

function parseLines(value: unknown): QuoteLine[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed)
    ? parsed.map((l) => ({
        designation: String(l.designation),
        quantite: Number(l.quantite),
        prixUnitaireHT: Number(l.prixUnitaireHT),
      }))
    : [];
}

function toQuoteRecord(r: Row): QuoteRecord {
  return {
    id: String(r.id),
    numero: String(r.numero),
    clientId: String(r.client_id),
    missionId: opt(r.mission_id),
    objet: String(r.objet),
    lignes: parseLines(r.lignes),
    tauxTva: Number(r.taux_tva),
    status: r.statut as QuoteRecord["status"],
    emisLe: String(r.emis_le),
    valableJusquau: String(r.valable_jusquau),
    factureId: opt(r.facture_id),
    creeLe: fromSqlDateTime(String(r.cree_le)),
  };
}

function toMission(r: Row): Mission {
  return {
    id: String(r.id),
    code: String(r.code),
    titre: String(r.titre),
    clientId: String(r.client_id),
    type: r.type as Mission["type"],
    statut: r.statut as Mission["statut"],
    montantHT: Number(r.montant_ht),
    debut: opt(r.debut),
    fin: opt(r.fin),
    notes: opt(r.notes),
    creeLe: fromSqlDateTime(String(r.cree_le)),
  };
}

function toInvoiceRecord(r: Row): InvoiceRecord {
  return {
    id: String(r.id),
    numero: String(r.numero),
    clientId: String(r.client_id),
    missionId: opt(r.mission_id),
    objet: opt(r.objet),
    montantHT: Number(r.montant_ht),
    tauxTva: Number(r.taux_tva),
    status: r.statut as Invoice["status"],
    emiseLe: String(r.emise_le),
    echeance: String(r.echeance),
    payeeLe: opt(r.payee_le),
    recurrence: opt(r.recurrence) as Invoice["recurrence"],
  };
}

function toPayment(r: Row): Payment {
  return {
    id: String(r.id),
    numero: String(r.numero),
    factureId: String(r.facture_id),
    montant: Number(r.montant),
    date: String(r.date_paiement),
    mode: r.mode as Payment["mode"],
    reference: opt(r.reference),
    creeLe: fromSqlDateTime(String(r.cree_le)),
  };
}

function toAgent(r: Row): Agent {
  return {
    id: String(r.id),
    nom: String(r.nom),
    role: String(r.role),
    tier: r.tier as Agent["tier"],
    autonomy: r.autonomy as Agent["autonomy"],
    status: r.status as Agent["status"],
    derniereAction: String(r.derniere_action),
    risque: r.risque as Agent["risque"],
    hitlObligatoire: Boolean(Number(r.hitl_obligatoire)),
  };
}

function toAction(r: Row): AgentAction {
  return {
    id: String(r.id),
    agentId: String(r.agent_id),
    type: String(r.type),
    description: String(r.description),
    timestamp: fromSqlDateTime(String(r.created_at)),
    requiresHitl: Boolean(Number(r.requires_hitl)),
    hitlStatus: r.hitl_status == null ? undefined : (r.hitl_status as AgentAction["hitlStatus"]),
    ...(r.email_cible
      ? {
          email: {
            cible: r.email_cible as EmailDraft["cible"],
            refId: String(r.email_ref),
            objet: String(r.email_objet ?? ""),
            corps: String(r.email_corps ?? ""),
          },
        }
      : {}),
    ...(r.op_type
      ? {
          operation: {
            type: r.op_type as StatusOperation["type"],
            refId: String(r.op_ref),
            valeur: String(r.op_valeur),
          },
        }
      : {}),
    ...(r.decide_par ? { decidePar: String(r.decide_par) } : {}),
    ...(r.decide_le ? { decideLe: fromSqlDateTime(String(r.decide_le)) } : {}),
    ...(r.exec_statut
      ? {
          execution: {
            statut: r.exec_statut as ActionExecution["statut"],
            le: r.exec_le ? fromSqlDateTime(String(r.exec_le)) : "",
            message: String(r.exec_message ?? ""),
          },
        }
      : {}),
  };
}

function toUser(r: Row): User {
  return {
    id: String(r.id),
    email: String(r.email),
    nom: String(r.nom),
    role: r.role as User["role"],
    ...(r.client_id ? { clientId: String(r.client_id) } : {}),
    actif: Boolean(Number(r.actif)),
    creeLe: fromSqlDateTime(String(r.cree_le)),
    derniereConnexion: r.derniere_connexion ? fromSqlDateTime(String(r.derniere_connexion)) : undefined,
  };
}

function toAudit(r: Row): AuditEntry {
  return {
    id: String(r.id),
    le: fromSqlDateTime(String(r.le)),
    utilisateurId: String(r.utilisateur_id),
    utilisateur: String(r.utilisateur),
    action: String(r.action),
    objet: String(r.objet),
    details: r.details == null ? undefined : String(r.details),
    ip: r.ip == null ? undefined : String(r.ip),
  };
}

function toRun(r: Row): AgentRunLog {
  return {
    id: String(r.id),
    agentId: String(r.agent_id),
    declencheur: r.declencheur as AgentRunLog["declencheur"],
    debut: fromSqlDateTime(String(r.debut)),
    fin: fromSqlDateTime(String(r.fin)),
    statut: r.statut as AgentRunLog["statut"],
    message: String(r.message),
    actions: Number(r.actions),
    model: r.model == null ? undefined : String(r.model),
  };
}

/* ---------- lectures ---------- */

async function select<T>(
  sql: string,
  map: (r: Row) => T,
  params: unknown[] = [],
  conn?: PoolConnection,
): Promise<T[]> {
  const runner = conn ?? (await db());
  const [rows] = await runner.query<Row[]>(sql, params);
  return rows.map(map);
}

const getClients = () => select("SELECT * FROM bos_clients ORDER BY nom", toClient);
const getMissions = () => select("SELECT * FROM bos_missions ORDER BY cree_le DESC", toMission);
const getPayments = () =>
  select("SELECT * FROM bos_paiements ORDER BY date_paiement DESC, numero DESC", toPayment);
const getAgents = () => select("SELECT * FROM bos_agents ORDER BY id", toAgent);
const getAgentActions = () =>
  select("SELECT * FROM bos_agent_actions ORDER BY created_at DESC LIMIT 200", toAction);

async function getInvoices() {
  const [records, clients, payments] = await Promise.all([
    select("SELECT * FROM bos_factures ORDER BY emise_le DESC, numero DESC", toInvoiceRecord),
    getClients(),
    getPayments(),
  ]);
  return deriveInvoices(records, clients, payments);
}

const getContacts = () => select("SELECT * FROM bos_contacts ORDER BY principal DESC, nom", toContact);

async function getQuotes() {
  const [records, clients] = await Promise.all([
    select("SELECT * FROM bos_devis ORDER BY emis_le DESC, numero DESC", toQuoteRecord),
    getClients(),
  ]);
  return deriveQuotes(records, clients);
}

async function findQuote(id: string, conn?: PoolConnection, lock = false) {
  const record = (
    await select(`SELECT * FROM bos_devis WHERE id = ?${lock ? " FOR UPDATE" : ""}`, toQuoteRecord, [id], conn)
  )[0];
  if (!record) return undefined;
  return { record, quote: deriveQuote(record, await findClient(record.clientId, conn)) };
}

async function findClient(id: string, conn?: PoolConnection) {
  return (await select("SELECT * FROM bos_clients WHERE id = ?", toClient, [id], conn))[0];
}

async function findMission(id: string, conn?: PoolConnection) {
  return (await select("SELECT * FROM bos_missions WHERE id = ?", toMission, [id], conn))[0];
}

/** Facture complète (client, paiements) ; `lock` la verrouille dans une transaction. */
async function findInvoice(id: string, conn?: PoolConnection, lock = false) {
  const record = (
    await select(`SELECT * FROM bos_factures WHERE id = ?${lock ? " FOR UPDATE" : ""}`, toInvoiceRecord, [id], conn)
  )[0];
  if (!record) return undefined;
  const [client, payments] = await Promise.all([
    findClient(record.clientId, conn),
    select("SELECT * FROM bos_paiements WHERE facture_id = ?", toPayment, [id], conn),
  ]);
  return { record, invoice: deriveInvoice(record, client, payments), payments };
}

/** Prochain numéro d'une série (FA, MIS, REG) de l'année, sous verrou pour éviter les doublons. */
async function nextSerial(conn: PoolConnection, table: string, column: string, prefix: string, year: number) {
  const [rows] = await conn.query<Row[]>(
    `SELECT ${column} AS n FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1 FOR UPDATE`,
    [`${prefix}-${year}-%`],
  );
  return nextNumber(prefix, year, rows.map((r) => String(r.n)));
}

const isDuplicate = (error: unknown) => (error as { code?: string }).code === "ER_DUP_ENTRY";
const nowSql = () => toSqlDateTime(new Date().toISOString());

async function touchClient(conn: PoolConnection, clientId: string) {
  await conn.execute("UPDATE bos_clients SET derniere_activite = ? WHERE id = ?", [nowSql(), clientId]);
}

/* ---------- moteur ---------- */

/** Un seul interlocuteur principal par espace. */
async function keepSinglePrincipal(conn: PoolConnection, contact: Contact) {
  if (!contact.principal) return;
  await conn.execute("UPDATE bos_contacts SET principal = 0 WHERE client_id = ? AND id <> ?", [contact.clientId, contact.id]);
}

export const mysqlRepository: Repository = {
  mode: "mysql",
  getClients,
  getContacts,
  getQuotes,

  /** Chaque requête filtre sur client_id : aucune donnée d'un autre espace ne peut remonter. */
  async getSpace(clientId) {
    const client = await findClient(clientId);
    if (!client) return null;
    const [contacts, missions, quoteRecords, invoiceRecords, payments] = await Promise.all([
      select("SELECT * FROM bos_contacts WHERE client_id = ? ORDER BY principal DESC, nom", toContact, [clientId]),
      select("SELECT * FROM bos_missions WHERE client_id = ? ORDER BY cree_le DESC", toMission, [clientId]),
      select("SELECT * FROM bos_devis WHERE client_id = ? ORDER BY emis_le DESC, numero DESC", toQuoteRecord, [clientId]),
      select("SELECT * FROM bos_factures WHERE client_id = ? ORDER BY emise_le DESC, numero DESC", toInvoiceRecord, [clientId]),
      select(
        `SELECT p.* FROM bos_paiements p JOIN bos_factures f ON f.id = p.facture_id
         WHERE f.client_id = ? ORDER BY p.date_paiement DESC, p.numero DESC`,
        toPayment,
        [clientId],
      ),
    ]);
    return {
      client,
      contacts,
      missions,
      quotes: deriveQuotes(quoteRecords, [client]),
      invoices: deriveInvoices(invoiceRecords, [client], payments),
      payments,
    };
  },

  createContact(input) {
    return transaction(async (conn) => {
      if (!(await findClient(input.clientId, conn))) return failure("Client introuvable", 404);
      const id = `con-${randomUUID()}`;
      await conn.execute(
        `INSERT INTO bos_contacts
           (id, client_id, nom, prenom, fonction, email, telephone, categorie, principal, notes, cree_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.clientId,
          input.nom,
          nul(input.prenom),
          nul(input.fonction),
          nul(input.email),
          nul(input.telephone),
          input.categorie,
          input.principal ? 1 : 0,
          nul(input.notes),
          nowSql(),
        ],
      );
      const contact = (await select("SELECT * FROM bos_contacts WHERE id = ?", toContact, [id], conn))[0];
      await keepSinglePrincipal(conn, contact);
      await touchClient(conn, input.clientId);
      return { ok: true as const, value: contact };
    });
  },

  updateContact(id, patch) {
    return transaction(async (conn) => {
      const entries = Object.entries(patch)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, k === "principal" ? (v ? 1 : 0) : k === "nom" || k === "categorie" ? v : nul(v as string)] as const);
      if (entries.length) {
        const [result] = await conn.execute<mysql.ResultSetHeader>(
          `UPDATE bos_contacts SET ${entries.map(([c]) => `${c} = ?`).join(", ")} WHERE id = ?`,
          [...entries.map(([, v]) => v as string | number | null), id],
        );
        if (!result.affectedRows) return failure("Contact introuvable", 404);
      }
      const contact = (await select("SELECT * FROM bos_contacts WHERE id = ?", toContact, [id], conn))[0];
      if (!contact) return failure("Contact introuvable", 404);
      await keepSinglePrincipal(conn, contact);
      await touchClient(conn, contact.clientId);
      return { ok: true as const, value: contact };
    });
  },

  createQuote(input) {
    return transaction(async (conn) => {
      if (!(await findClient(input.clientId, conn))) return failure("Client introuvable", 404);
      if (input.missionId && !missionBelongs(await findMission(input.missionId, conn), input.clientId)) {
        return failure("Cette mission n'appartient pas à ce client");
      }
      const id = `dev-${randomUUID()}`;
      const numero = await nextSerial(conn, "bos_devis", "numero", "DEV", Number(input.emisLe.slice(0, 4)));
      await conn.execute(
        `INSERT INTO bos_devis
           (id, numero, client_id, mission_id, objet, lignes, taux_tva, statut, emis_le, valable_jusquau, cree_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          numero,
          input.clientId,
          input.missionId ?? null,
          input.objet,
          JSON.stringify(input.lignes),
          input.tauxTva,
          input.status,
          input.emisLe,
          input.valableJusquau,
          nowSql(),
        ],
      );
      await touchClient(conn, input.clientId);
      return { ok: true as const, value: (await findQuote(id, conn))!.quote };
    });
  },

  updateQuoteStatus(id, status) {
    return transaction(async (conn) => {
      const found = await findQuote(id, conn, true);
      if (!found) return failure("Devis introuvable", 404);
      const problem = quoteStatusProblem(found.record.status, status);
      if (problem) return failure(problem, 409);
      await conn.execute("UPDATE bos_devis SET statut = ? WHERE id = ?", [status, id]);
      return { ok: true as const, value: (await findQuote(id, conn))!.quote };
    });
  },

  async invoiceQuote(id) {
    // Devis verrouillé : un double clic ne crée pas deux factures.
    const result = await transaction(async (conn) => {
      const found = await findQuote(id, conn, true);
      if (!found) return failure("Devis introuvable", 404);
      const problem = quoteToInvoiceProblem(found.quote);
      if (problem) return failure(problem, 409);
      const input = invoiceFromQuote(found.quote);
      const invoiceId = `inv-${randomUUID()}`;
      const numero = await nextSerial(conn, "bos_factures", "numero", "FA", Number(input.emiseLe.slice(0, 4)));
      await conn.execute(
        `INSERT INTO bos_factures
           (id, numero, client_id, mission_id, objet, montant_ht, taux_tva, statut, emise_le, echeance)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'emise', ?, ?)`,
        [invoiceId, numero, input.clientId, input.missionId ?? null, input.objet ?? null, input.montantHT, input.tauxTva, input.emiseLe, input.echeance],
      );
      await conn.execute("UPDATE bos_devis SET statut = 'facture', facture_id = ? WHERE id = ?", [invoiceId, id]);
      await touchClient(conn, input.clientId);
      return {
        ok: true as const,
        value: { quote: (await findQuote(id, conn))!.quote, invoice: (await findInvoice(invoiceId, conn))!.invoice },
      };
    });
    return result;
  },
  getMissions,
  getInvoices,
  getPayments,
  getAgents,
  getAgentActions,

  async getMetrics() {
    const [clients, missions, invoices, payments, agents, agentActions] = await Promise.all([
      getClients(),
      getMissions(),
      getInvoices(),
      getPayments(),
      getAgents(),
      getAgentActions(),
    ]);
    return computeMetrics({ clients, missions, invoices, payments, agents, agentActions });
  },

  async createClient(input) {
    const id = `cli-${randomUUID()}`;
    try {
      await (await db()).execute(
        `INSERT INTO bos_clients
           (id, nom, contact, email, telephone, secteur, statut, source, notes, cree_le, derniere_activite)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.nom,
          nul(input.contact),
          nul(input.email),
          nul(input.telephone),
          nul(input.secteur),
          input.statut,
          nul(input.source),
          nul(input.notes),
          nowSql(),
          nowSql(),
        ],
      );
    } catch (error) {
      if (isDuplicate(error)) return failure(`Un client « ${input.nom} » existe déjà`, 409);
      throw error;
    }
    return { ok: true, value: (await findClient(id))! };
  },

  async updateClient(id, patch) {
    const columns = Object.entries(patch)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, k === "nom" || k === "statut" ? v : nul(v as string)] as const);
    try {
      const [result] = await (await db()).execute<mysql.ResultSetHeader>(
        `UPDATE bos_clients SET ${[...columns.map(([c]) => `${c} = ?`), "derniere_activite = ?"].join(", ")} WHERE id = ?`,
        [...columns.map(([, v]) => v as string | null), nowSql(), id],
      );
      if (!result.affectedRows) return failure("Client introuvable", 404);
    } catch (error) {
      if (isDuplicate(error)) return failure(`Un client « ${patch.nom} » existe déjà`, 409);
      throw error;
    }
    return { ok: true, value: (await findClient(id))! };
  },

  createMission(input) {
    return transaction(async (conn) => {
      if (!(await findClient(input.clientId, conn))) return failure("Client introuvable", 404);
      const id = `mis-${randomUUID()}`;
      const code = await nextSerial(conn, "bos_missions", "code", "MIS", new Date().getUTCFullYear());
      await conn.execute(
        `INSERT INTO bos_missions
           (id, code, titre, client_id, type, statut, montant_ht, debut, fin, notes, cree_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          code,
          input.titre,
          input.clientId,
          input.type,
          input.statut,
          input.montantHT,
          nul(input.debut),
          nul(input.fin),
          nul(input.notes),
          nowSql(),
        ],
      );
      await touchClient(conn, input.clientId);
      return { ok: true as const, value: (await findMission(id, conn))! };
    });
  },

  updateMission(id, patch) {
    return transaction(async (conn) => {
      const current = (await select("SELECT * FROM bos_missions WHERE id = ? FOR UPDATE", toMission, [id], conn))[0];
      if (!current) return failure("Mission introuvable", 404);
      const column: Record<string, string> = { montantHT: "montant_ht" };
      const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
      const next = { ...current, ...Object.fromEntries(entries.map(([k, v]) => [k, v === "" ? undefined : v])) };
      if (next.debut && next.fin && next.fin < next.debut) return failure("La fin prévue précède le début");
      if (entries.length) {
        await conn.execute(
          `UPDATE bos_missions SET ${entries.map(([k]) => `${column[k] ?? k} = ?`).join(", ")} WHERE id = ?`,
          [...entries.map(([, v]) => (v === "" ? null : (v as string | number))), id],
        );
      }
      await touchClient(conn, current.clientId);
      return { ok: true as const, value: (await findMission(id, conn))! };
    });
  },

  createInvoice(input) {
    return transaction(async (conn) => {
      if (!(await findClient(input.clientId, conn))) return failure("Client introuvable", 404);
      if (input.missionId && !missionBelongs(await findMission(input.missionId, conn), input.clientId)) {
        return failure("Cette mission n'appartient pas à ce client");
      }
      const id = `inv-${randomUUID()}`;
      const numero =
        input.numero ?? (await nextSerial(conn, "bos_factures", "numero", "FA", Number(input.emiseLe.slice(0, 4))));
      try {
        await conn.execute(
          `INSERT INTO bos_factures
             (id, numero, client_id, mission_id, objet, montant_ht, taux_tva, statut, emise_le, echeance, recurrence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            numero,
            input.clientId,
            input.missionId ?? null,
            input.objet ?? null,
            input.montantHT,
            input.tauxTva,
            input.status,
            input.emiseLe,
            input.echeance,
            input.recurrence ?? null,
          ],
        );
      } catch (error) {
        if (isDuplicate(error)) return failure(`La facture ${numero} existe déjà`, 409);
        throw error;
      }
      await touchClient(conn, input.clientId);
      return { ok: true as const, value: (await findInvoice(id, conn))!.invoice };
    });
  },

  updateInvoiceStatus(id, status) {
    return transaction(async (conn) => {
      const found = await findInvoice(id, conn, true);
      if (!found) return failure("Facture introuvable", 404);
      if (found.record.status === "payee") return failure("Facture déjà payée : statut verrouillé", 409);
      if (status === "payee" || status === "partiellement_payee") {
        return failure("Enregistrez un paiement : le statut « payée » en découle", 400);
      }
      await conn.execute("UPDATE bos_factures SET statut = ? WHERE id = ?", [status, id]);
      return { ok: true as const, value: (await findInvoice(id, conn))!.invoice };
    });
  },

  recordPayment(input) {
    return transaction(async (conn) => {
      // Facture verrouillée : deux paiements simultanés ne dépassent pas le reste dû.
      const found = await findInvoice(input.factureId, conn, true);
      if (!found) return failure("Facture introuvable", 404);
      const problem = paymentProblem(found.invoice, input.montant);
      if (problem) return failure(problem, 409);
      const payment: Payment = {
        id: `pay-${randomUUID()}`,
        numero: await nextSerial(conn, "bos_paiements", "numero", "REG", Number(input.date.slice(0, 4))),
        factureId: input.factureId,
        montant: round2(input.montant),
        date: input.date,
        mode: input.mode,
        reference: input.reference,
        creeLe: new Date().toISOString(),
      };
      await conn.execute(
        `INSERT INTO bos_paiements (id, numero, facture_id, montant, date_paiement, mode, reference, cree_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payment.id,
          payment.numero,
          payment.factureId,
          payment.montant,
          payment.date,
          payment.mode,
          payment.reference ?? null,
          toSqlDateTime(payment.creeLe),
        ],
      );
      const last = [...found.payments.map((p) => p.date), payment.date].sort().at(-1)!;
      const settled = settleInvoice(
        found.record.status,
        found.invoice.montantTTC,
        found.invoice.montantPaye + payment.montant,
        last,
      );
      await conn.execute("UPDATE bos_factures SET statut = ?, payee_le = COALESCE(?, payee_le) WHERE id = ?", [
        settled.status,
        settled.payeeLe ?? null,
        input.factureId,
      ]);
      await touchClient(conn, found.record.clientId);
      return { ok: true as const, value: { payment, invoice: (await findInvoice(input.factureId, conn))!.invoice } };
    });
  },

  async findOperationTarget(op) {
    if (op.type === "statut_client") {
      const c = await findClient(op.refId);
      return c ? { libelle: c.nom, actuel: statusLabel(c.statut) } : null;
    }
    if (op.type === "statut_mission") {
      const m = await findMission(op.refId);
      return m ? { libelle: `Mission ${m.code} (${m.titre})`, actuel: statusLabel(m.statut) } : null;
    }
    const i = (await findInvoice(op.refId))?.invoice;
    return i ? { libelle: `Facture ${i.numero} (${i.client})`, actuel: statusLabel(i.status) } : null;
  },

  resolveHitl(actionId, decision, edits, decidePar) {
    return transaction(async (conn) => {
      const actions = await select(
        "SELECT * FROM bos_agent_actions WHERE id = ? FOR UPDATE",
        toAction,
        [actionId],
        conn,
      );
      const action = actions[0];
      // Une décision ne se prend qu'une fois : pas de double envoi sur double clic.
      if (!action || !action.requiresHitl || action.hitlStatus !== "pending") return null;
      const changes = decision === "approved" && action.email ? cleanEdits(edits) : {};
      // Valeur de statut choisie par l'humain : revérifiée contre la liste autorisée.
      const operation =
        decision === "approved" && action.operation ? editedOperation(action.operation, edits?.valeur) : action.operation;
      const decideLe = new Date().toISOString();
      await conn.execute(
        `UPDATE bos_agent_actions SET hitl_status = ?, decide_par = ?, decide_le = ?,
           email_objet = COALESCE(?, email_objet), email_corps = COALESCE(?, email_corps),
           op_valeur = COALESCE(?, op_valeur)
         WHERE id = ?`,
        [
          decision,
          decidePar ?? null,
          toSqlDateTime(decideLe),
          changes.objet ?? null,
          changes.corps ?? null,
          operation?.valeur ?? null,
          actionId,
        ],
      );
      if (operation) action.operation = operation;
      action.decidePar = decidePar;
      action.decideLe = decideLe;
      if (action.email) action.email = { ...action.email, ...changes };
      await conn.execute(
        `UPDATE bos_agents SET status = ?, derniere_action = ?
         WHERE id = ? AND status = 'en_attente_hitl'`,
        [
          decision === "approved" ? "actif" : "pause",
          `${decision === "approved" ? "HITL approuvé" : "HITL refusé"} — ${action.type}`,
          action.agentId,
        ],
      );
      return { ...action, hitlStatus: decision };
    });
  },

  async claimExecution(actionId) {
    const pool = await db();
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE bos_agent_actions SET exec_statut = 'en_cours', exec_le = ?, exec_message = ''
       WHERE id = ? AND hitl_status = 'approved'
         AND (exec_statut IS NULL OR exec_statut IN ('echec', 'a_faire')
              OR (exec_statut = 'en_cours' AND exec_le < ?))`,
      [
        toSqlDateTime(new Date().toISOString()),
        actionId,
        toSqlDateTime(new Date(Date.now() - STALE_EXECUTION_MS).toISOString()),
      ],
    );
    if (!result.affectedRows) return null;
    const rows = await select("SELECT * FROM bos_agent_actions WHERE id = ?", toAction, [actionId]);
    return rows[0] ?? null;
  },

  async finishExecution(actionId, execution) {
    await (await db()).execute(
      "UPDATE bos_agent_actions SET exec_statut = ?, exec_le = ?, exec_message = ? WHERE id = ?",
      [execution.statut, toSqlDateTime(execution.le), execution.message.slice(0, 2000), actionId],
    );
  },

  async findRecipient(draft) {
    if (draft.cible === "client") {
      const c = await findClient(draft.refId);
      return c ? { nom: c.contact ? `${c.contact} (${c.nom})` : c.nom, email: c.email ?? null } : null;
    }
    const i = (await findInvoice(draft.refId))?.invoice;
    return i ? { nom: i.client, email: i.emailClient ?? null } : null;
  },

  recordAgentRun(agentId, proposal, model) {
    return transaction(async (conn) => {
      const agents = await select(
        "SELECT * FROM bos_agents WHERE id = ? FOR UPDATE",
        toAgent,
        [agentId],
        conn,
      );
      if (!agents[0]) return null;
      const timestamp = new Date().toISOString();
      const created: AgentAction[] = proposal.actions.map((a) => ({
        id: `act-${randomUUID()}`,
        agentId,
        type: a.type,
        description: a.description,
        timestamp,
        requiresHitl: a.requiresHitl,
        hitlStatus: a.requiresHitl ? "pending" : undefined,
        ...(a.email ? { email: a.email } : {}),
        ...(a.operation ? { operation: a.operation } : {}),
      }));
      for (const action of created) {
        await conn.execute(
          `INSERT INTO bos_agent_actions
             (id, agent_id, type, description, created_at, requires_hitl, hitl_status, model,
              email_cible, email_ref, email_objet, email_corps, op_type, op_ref, op_valeur)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            action.id,
            agentId,
            action.type,
            action.description,
            toSqlDateTime(timestamp),
            action.requiresHitl ? 1 : 0,
            action.hitlStatus ?? null,
            model,
            action.email?.cible ?? null,
            action.email?.refId ?? null,
            action.email?.objet ?? null,
            action.email?.corps ?? null,
            action.operation?.type ?? null,
            action.operation?.refId ?? null,
            action.operation?.valeur ?? null,
          ],
        );
      }
      const waiting = created.some((a) => a.requiresHitl);
      await conn.execute(
        `UPDATE bos_agents SET derniere_action = ?,
           status = IF(?, 'en_attente_hitl', status) WHERE id = ?`,
        [proposal.resume, waiting, agentId],
      );
      return { agentId, model, resume: proposal.resume, actions: created };
    });
  },

  listUsers: () => select("SELECT * FROM bos_users ORDER BY nom", toUser),

  async findUserById(id) {
    const rows = await select("SELECT * FROM bos_users WHERE id = ?", toUser, [id]);
    return rows[0] ?? null;
  },

  async findUserForLogin(email) {
    const [rows] = await (await db()).query<Row[]>("SELECT * FROM bos_users WHERE email = ?", [
      email.toLowerCase(),
    ]);
    return rows[0] ? { user: toUser(rows[0]), passwordHash: String(rows[0].password_hash) } : null;
  },

  async createUser(input) {
    const id = `usr-${randomUUID()}`;
    try {
      await (await db()).execute(
        `INSERT INTO bos_users (id, email, nom, role, client_id, actif, password_hash, cree_le)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          id,
          input.email.toLowerCase(),
          input.nom,
          input.role,
          input.role === "client" ? (input.clientId ?? null) : null,
          input.passwordHash,
          toSqlDateTime(new Date().toISOString()),
        ],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") return null;
      throw error;
    }
    return this.findUserById(id);
  },

  async updateUser(id, patch) {
    const columns: Record<string, unknown> = {
      nom: patch.nom,
      role: patch.role,
      actif: patch.actif === undefined ? undefined : patch.actif ? 1 : 0,
      password_hash: patch.passwordHash,
    };
    const set = Object.entries(columns).filter(([, v]) => v !== undefined);
    if (set.length) {
      await (await db()).execute(
        `UPDATE bos_users SET ${set.map(([c]) => `${c} = ?`).join(", ")} WHERE id = ?`,
        [...set.map(([, v]) => v as string | number), id],
      );
    }
    return this.findUserById(id);
  },

  async touchLogin(id) {
    await (await db()).execute("UPDATE bos_users SET derniere_connexion = ? WHERE id = ?", [
      toSqlDateTime(new Date().toISOString()),
      id,
    ]);
  },

  async recordAudit(entry) {
    await (await db()).execute(
      `INSERT INTO bos_audit (id, le, utilisateur_id, utilisateur, action, objet, details, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        toSqlDateTime(entry.le),
        entry.utilisateurId,
        entry.utilisateur.slice(0, 255),
        entry.action.slice(0, 64),
        entry.objet.slice(0, 255),
        entry.details?.slice(0, 4000) ?? null,
        entry.ip?.slice(0, 64) ?? null,
      ],
    );
  },

  getAudit(filter = {}) {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (filter.utilisateurId) {
      where.push("utilisateur_id = ?");
      params.push(filter.utilisateurId);
    }
    if (filter.action) {
      where.push("action = ?");
      params.push(filter.action);
    }
    params.push(Math.max(1, Math.min(5000, Math.floor(filter.limit ?? 200))));
    return select(
      `SELECT * FROM bos_audit ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY le DESC LIMIT ?`,
      toAudit,
      params,
    );
  },

  async logAgentRun(run) {
    await (await db()).execute(
      `INSERT INTO bos_agent_runs
         (id, agent_id, declencheur, debut, fin, statut, message, actions, model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.id,
        run.agentId,
        run.declencheur,
        toSqlDateTime(run.debut),
        toSqlDateTime(run.fin),
        run.statut,
        run.message.slice(0, 2000),
        run.actions,
        run.model ?? null,
      ],
    );
  },

  getAgentRuns: (limit = 50) =>
    select(
      "SELECT * FROM bos_agent_runs ORDER BY debut DESC LIMIT ?",
      toRun,
      [Math.max(1, Math.min(500, Math.floor(limit)))],
    ),

  /** Verrou MySQL nommé (GET_LOCK), tenu sur une connexion dédiée le temps du travail. */
  async withLock(name, work) {
    const conn = await (await db()).getConnection();
    try {
      const [rows] = await conn.query<Row[]>("SELECT GET_LOCK(?, 0) AS ok", [`bos:${name}`]);
      if (Number(rows[0].ok) !== 1) return null;
      try {
        return { value: await work() };
      } finally {
        await conn.query("SELECT RELEASE_LOCK(?)", [`bos:${name}`]).catch(() => {});
      }
    } finally {
      conn.release();
    }
  },
};
