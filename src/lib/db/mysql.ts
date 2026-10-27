/**
 * Moteur MySQL / MariaDB du cockpit BOS-IA.
 * Les tables (préfixe `bos_`) sont créées au premier accès ; seuls les 6 agents
 * (configuration du Digital Nexus) sont insérés : aucune donnée métier fictive.
 */
import { randomUUID } from "node:crypto";
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { computeMetrics } from "@/lib/metrics";
import { STALE_EXECUTION_MS, cleanEdits } from "@/lib/actions/rules";
import { store } from "@/lib/store";
import type {
  ActionExecution,
  Agent,
  AgentAction,
  AgentRunLog,
  EmailDraft,
  Invoice,
  Learner,
  OpcoDossier,
  TrainingSession,
} from "@/lib/types";
import type { Repository } from "@/lib/data";
import { getDatabaseConfig, type DatabaseConfig } from "./config";

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS bos_sessions (
    id VARCHAR(64) PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    code VARCHAR(64) NOT NULL,
    debut DATE NOT NULL,
    fin DATE NOT NULL,
    formateur VARCHAR(255) NOT NULL,
    places INT NOT NULL,
    inscrits INT NOT NULL DEFAULT 0,
    statut VARCHAR(32) NOT NULL,
    qualiopi_indicateurs JSON NOT NULL
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_learners (
    id VARCHAR(64) PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    entreprise VARCHAR(255) NULL,
    status VARCHAR(32) NOT NULL,
    pipeline_stage VARCHAR(32) NOT NULL,
    session_id VARCHAR(64) NULL,
    derniere_activite DATETIME(3) NOT NULL,
    comprehension_validee TINYINT(1) NOT NULL DEFAULT 0,
    score_quiz INT NULL,
    created_at DATETIME(3) NOT NULL
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_opco_dossiers (
    id VARCHAR(64) PRIMARY KEY,
    reference VARCHAR(64) NOT NULL,
    organisme VARCHAR(255) NOT NULL,
    apprenant_id VARCHAR(64) NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    montant DECIMAL(12,2) NOT NULL,
    status VARCHAR(32) NOT NULL,
    completude INT NOT NULL DEFAULT 0,
    pieces_manquantes JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL
  ) DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS bos_invoices (
    id VARCHAR(64) PRIMARY KEY,
    numero VARCHAR(64) NOT NULL UNIQUE,
    client VARCHAR(255) NOT NULL,
    dossier_opco_id VARCHAR(64) NULL,
    montant_ht DECIMAL(12,2) NOT NULL,
    acompte_pct INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    emise_le DATE NOT NULL,
    echeance DATE NOT NULL
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
];

/**
 * Colonnes ajoutées après la création initiale des tables. MySQL 8 ne connaît
 * pas « ADD COLUMN IF NOT EXISTS » : on vérifie dans information_schema.
 */
export const MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "bos_invoices", column: "email_client", ddl: "VARCHAR(255) NULL" },
  { table: "bos_invoices", column: "payee_le", ddl: "DATE NULL" },
  { table: "bos_invoices", column: "recurrence", ddl: "VARCHAR(16) NULL" },
  { table: "bos_agent_actions", column: "email_cible", ddl: "VARCHAR(16) NULL" },
  { table: "bos_agent_actions", column: "email_ref", ddl: "VARCHAR(64) NULL" },
  { table: "bos_agent_actions", column: "email_objet", ddl: "VARCHAR(255) NULL" },
  { table: "bos_agent_actions", column: "email_corps", ddl: "TEXT NULL" },
  { table: "bos_agent_actions", column: "exec_statut", ddl: "VARCHAR(16) NULL" },
  { table: "bos_agent_actions", column: "exec_le", ddl: "DATETIME(3) NULL" },
  { table: "bos_agent_actions", column: "exec_message", ddl: "TEXT NULL" },
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** MySQL renvoie un JSON déjà décodé, MariaDB une chaîne. */
export function parseJsonArray(value: unknown): string[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

/** Jours de retard calculés à la lecture : une facture payée n'est jamais en retard. */
export function daysLate(
  echeance: string,
  status: Invoice["status"],
  now = today(),
  payeeLe?: string,
) {
  if (status === "payee" || payeeLe) return 0;
  const diff = (Date.parse(now) - Date.parse(echeance)) / 86_400_000;
  return diff > 0 ? Math.floor(diff) : 0;
}

type Row = RowDataPacket & Record<string, unknown>;

function toSession(r: Row): TrainingSession {
  return {
    id: String(r.id),
    titre: String(r.titre),
    code: String(r.code),
    debut: String(r.debut),
    fin: String(r.fin),
    formateur: String(r.formateur),
    places: Number(r.places),
    inscrits: Number(r.inscrits),
    statut: r.statut as TrainingSession["statut"],
    qualiopiIndicateurs: parseJsonArray(r.qualiopi_indicateurs),
  };
}

function toLearner(r: Row): Learner {
  return {
    id: String(r.id),
    nom: String(r.nom),
    prenom: String(r.prenom),
    email: String(r.email),
    entreprise: r.entreprise == null ? undefined : String(r.entreprise),
    status: r.status as Learner["status"],
    pipelineStage: r.pipeline_stage as Learner["pipelineStage"],
    sessionId: r.session_id == null ? undefined : String(r.session_id),
    derniereActivite: fromSqlDateTime(String(r.derniere_activite)),
    comprehensionValidee: Boolean(Number(r.comprehension_validee)),
    scoreQuiz: r.score_quiz == null ? undefined : Number(r.score_quiz),
    createdAt: fromSqlDateTime(String(r.created_at)),
  };
}

function toDossier(r: Row): OpcoDossier {
  return {
    id: String(r.id),
    reference: String(r.reference),
    organisme: String(r.organisme),
    apprenantId: String(r.apprenant_id),
    sessionId: String(r.session_id),
    montant: Number(r.montant),
    status: r.status as OpcoDossier["status"],
    completude: Number(r.completude),
    piecesManquantes: parseJsonArray(r.pieces_manquantes),
    updatedAt: fromSqlDateTime(String(r.updated_at)),
  };
}

function toInvoice(r: Row): Invoice {
  const status = r.status as Invoice["status"];
  const echeance = String(r.echeance);
  const payeeLe = r.payee_le == null ? undefined : String(r.payee_le);
  return {
    id: String(r.id),
    numero: String(r.numero),
    client: String(r.client),
    dossierOpcoId: r.dossier_opco_id == null ? undefined : String(r.dossier_opco_id),
    montantHT: Number(r.montant_ht),
    acomptePct: Number(r.acompte_pct),
    status,
    emiseLe: String(r.emise_le),
    echeance,
    joursRetard: daysLate(echeance, status, undefined, payeeLe),
    emailClient: r.email_client == null ? undefined : String(r.email_client),
    payeeLe,
    recurrence: r.recurrence == null ? undefined : (r.recurrence as Invoice["recurrence"]),
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

const getSessions = () => select("SELECT * FROM bos_sessions ORDER BY debut", toSession);
const getLearners = () => select("SELECT * FROM bos_learners ORDER BY created_at", toLearner);
const getOpcoDossiers = () =>
  select("SELECT * FROM bos_opco_dossiers ORDER BY updated_at DESC", toDossier);
const getInvoices = () => select("SELECT * FROM bos_invoices ORDER BY emise_le DESC", toInvoice);
const getAgents = () => select("SELECT * FROM bos_agents ORDER BY id", toAgent);
const getAgentActions = () =>
  select("SELECT * FROM bos_agent_actions ORDER BY created_at DESC LIMIT 200", toAction);

async function findLearner(id: string, conn?: PoolConnection) {
  const rows = await select(
    "SELECT * FROM bos_learners WHERE id = ?",
    toLearner,
    [id],
    conn,
  );
  return rows[0] ?? null;
}

/** Prochain numéro de facture de l'année : FA-2026-0001, FA-2026-0002… */
async function nextInvoiceNumber(conn: PoolConnection) {
  const prefix = `FA-${new Date().getUTCFullYear()}-`;
  const [rows] = await conn.query<Row[]>(
    "SELECT numero FROM bos_invoices WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1 FOR UPDATE",
    [`${prefix}%`],
  );
  const last = rows[0] ? Number(String(rows[0].numero).slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(last + 1).padStart(4, "0")}`;
}

function addDays(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ---------- moteur ---------- */

export const mysqlRepository: Repository = {
  mode: "mysql",
  getSessions,
  getLearners,
  getOpcoDossiers,
  getInvoices,
  getAgents,
  getAgentActions,

  async getMetrics() {
    const [learners, opcoDossiers, invoices, agents, agentActions] = await Promise.all([
      getLearners(),
      getOpcoDossiers(),
      getInvoices(),
      getAgents(),
      getAgentActions(),
    ]);
    return computeMetrics({ learners, opcoDossiers, invoices, agents, agentActions });
  },

  async updateLearnerStatus(id, status) {
    const now = toSqlDateTime(new Date().toISOString());
    const certified = status === "certifie";
    const [result] = await (await db()).execute<mysql.ResultSetHeader>(
      `UPDATE bos_learners SET status = ?, derniere_activite = ?,
         pipeline_stage = IF(?, 'completion', pipeline_stage),
         comprehension_validee = IF(?, 1, comprehension_validee)
       WHERE id = ?`,
      [status, now, certified, certified, id],
    );
    return result.affectedRows ? findLearner(id) : null;
  },

  async validateComprehension(id, score) {
    const passed = score >= 70;
    const [result] = await (await db()).execute<mysql.ResultSetHeader>(
      `UPDATE bos_learners SET comprehension_validee = ?, score_quiz = ?,
         pipeline_stage = ?, derniere_activite = ? WHERE id = ?`,
      [
        passed ? 1 : 0,
        score,
        passed ? "certification" : "evaluation",
        toSqlDateTime(new Date().toISOString()),
        id,
      ],
    );
    return result.affectedRows ? findLearner(id) : null;
  },

  async markInvoicePaid(id, payeeLe) {
    const [result] = await (await db()).execute<mysql.ResultSetHeader>(
      "UPDATE bos_invoices SET status = 'payee', payee_le = ? WHERE id = ?",
      [payeeLe, id],
    );
    if (!result.affectedRows) return null;
    const rows = await select("SELECT * FROM bos_invoices WHERE id = ?", toInvoice, [id]);
    return rows[0] ?? null;
  },

  async completeOpcoDossier(id) {
    const pool = await db();
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE bos_opco_dossiers SET completude = 100, pieces_manquantes = '[]',
         status = 'transmis', updated_at = ? WHERE id = ?`,
      [toSqlDateTime(new Date().toISOString()), id],
    );
    if (!result.affectedRows) return null;
    const rows = await select("SELECT * FROM bos_opco_dossiers WHERE id = ?", toDossier, [id]);
    return rows[0] ?? null;
  },

  resolveHitl(actionId, decision, edits) {
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
      await conn.execute(
        `UPDATE bos_agent_actions SET hitl_status = ?,
           email_objet = COALESCE(?, email_objet), email_corps = COALESCE(?, email_corps)
         WHERE id = ?`,
        [decision, changes.objet ?? null, changes.corps ?? null, actionId],
      );
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
    if (draft.cible === "apprenant") {
      const rows = await select("SELECT * FROM bos_learners WHERE id = ?", toLearner, [draft.refId]);
      const l = rows[0];
      return l ? { nom: `${l.prenom} ${l.nom}`, email: l.email || null } : null;
    }
    const rows = await select("SELECT * FROM bos_invoices WHERE id = ?", toInvoice, [draft.refId]);
    const i = rows[0];
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
      }));
      for (const action of created) {
        await conn.execute(
          `INSERT INTO bos_agent_actions
             (id, agent_id, type, description, created_at, requires_hitl, hitl_status, model,
              email_cible, email_ref, email_objet, email_corps)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  emitProofToCash(learnerId) {
    return transaction(async (conn) => {
      const learner = await findLearner(learnerId, conn);
      if (!learner || !learner.comprehensionValidee) {
        return { ok: false as const, error: "Compréhension non validée" };
      }
      const now = new Date().toISOString();
      await conn.execute(
        "UPDATE bos_learners SET status = 'certifie', pipeline_stage = 'completion' WHERE id = ?",
        [learnerId],
      );

      const dossiers = await select(
        "SELECT * FROM bos_opco_dossiers WHERE apprenant_id = ? LIMIT 1 FOR UPDATE",
        toDossier,
        [learnerId],
        conn,
      );
      let dossier: OpcoDossier | undefined = dossiers[0];
      if (dossier) {
        await conn.execute(
          `UPDATE bos_opco_dossiers SET completude = 100, pieces_manquantes = '[]',
             status = 'accepte', updated_at = ? WHERE id = ?`,
          [toSqlDateTime(now), dossier.id],
        );
        dossier = {
          ...dossier,
          completude: 100,
          piecesManquantes: [],
          status: "accepte",
          updatedAt: now,
        };
      }

      const montant = dossier?.montant ?? 0;
      const invoice: Invoice = {
        id: `inv-${randomUUID()}`,
        numero: await nextInvoiceNumber(conn),
        client: learner.entreprise ?? `${learner.prenom} ${learner.nom}`,
        dossierOpcoId: dossier?.id,
        montantHT: montant,
        acomptePct: 30,
        status: "brouillon",
        emiseLe: now.slice(0, 10),
        echeance: addDays(30),
        joursRetard: 0,
      };
      await conn.execute(
        `INSERT INTO bos_invoices
           (id, numero, client, dossier_opco_id, montant_ht, acompte_pct, status, emise_le, echeance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice.id,
          invoice.numero,
          invoice.client,
          invoice.dossierOpcoId ?? null,
          invoice.montantHT,
          invoice.acomptePct,
          invoice.status,
          invoice.emiseLe,
          invoice.echeance,
        ],
      );

      return {
        ok: true as const,
        completion_record: { learnerId, validatedAt: now, score: learner.scoreQuiz },
        dossier,
        invoice,
      };
    });
  },
};
