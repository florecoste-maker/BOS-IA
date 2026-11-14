/**
 * Moteur SQLite intégré (module `node:sqlite` de Node 22, aucune dépendance,
 * aucun mot de passe). Il imite la petite partie de l'API mysql2 utilisée par
 * le moteur MySQL (query / execute / getConnection / transactions), si bien que
 * toute la logique métier de `mysql.ts` est partagée entre les deux moteurs.
 *
 * Sécurité des données :
 * - fichier hors du dossier de l'application (voir getSqlitePath) ;
 * - journal WAL + synchronous=FULL : une transaction validée est écrite sur disque ;
 * - une seule transaction à la fois (verrou en mémoire + BEGIN IMMEDIATE entre processus).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

type SqlValue = string | number | null;
type Row = Record<string, unknown>;

interface Statement {
  all(...params: SqlValue[]): Row[];
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}
interface Database {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}

export interface WriteResult {
  affectedRows: number;
  insertId: number;
}

/* ---------- traduction SQL MySQL → SQLite ---------- */

/** Types MySQL du schéma → types SQLite (comparaisons de texte insensibles à la casse, comme MySQL). */
export function sqliteType(ddl: string) {
  return ddl
    .replace(/\bVARCHAR\(\d+\)/gi, "TEXT COLLATE NOCASE")
    .replace(/\b(LONGTEXT|DATETIME\(\d\)|DATETIME|DATE)\b/gi, "TEXT")
    .replace(/\bTINYINT\(1\)|\bINT\b/gi, "INTEGER")
    .replace(/\bDECIMAL\(\d+,\s*\d+\)/gi, "REAL");
}

/** CREATE TABLE MySQL → CREATE TABLE + CREATE INDEX SQLite. */
export function translateSchema(statements: string[]): string[] {
  const out: string[] = [];
  for (const statement of statements) {
    const table = /CREATE TABLE IF NOT EXISTS (\w+)/i.exec(statement)?.[1];
    const indexes: string[] = [];
    let body = statement.replace(/\s*DEFAULT CHARSET=\w+/gi, "");
    body = body.replace(/,\s*INDEX (\w+) \(([^)]+)\)/gi, (_m, name: string, cols: string) => {
      indexes.push(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${cols})`);
      return "";
    });
    out.push(sqliteType(body), ...indexes);
  }
  return out;
}

/** Ajustements des requêtes : verrous de ligne inutiles (transaction exclusive), INSERT IGNORE. */
export function translateQuery(sql: string) {
  return sql.replace(/\s+FOR UPDATE\b/gi, "").replace(/\bINSERT IGNORE\b/gi, "INSERT OR IGNORE");
}

const READS = /^\s*(SELECT|PRAGMA|WITH)\b/i;

function toValue(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number" || typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** Codes d'erreur SQLite de contrainte d'unicité → code MySQL attendu par le moteur. */
function normalizeError(error: unknown): unknown {
  const e = error as { errcode?: number; code?: string };
  if (e && (e.errcode === 2067 || e.errcode === 1555)) e.code = "ER_DUP_ENTRY";
  return error;
}

/* ---------- verrou : une seule transaction à la fois ---------- */

class Mutex {
  private tail: Promise<void> = Promise.resolve();
  acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const ready = this.tail.then(() => release);
    this.tail = this.tail.then(() => next);
    return ready;
  }
}

/* ---------- connexion façon mysql2 ---------- */

export class SqliteConnection {
  private readonly database: Database;
  private readonly onRelease: () => void;

  constructor(database: Database, onRelease: () => void = () => {}) {
    this.database = database;
    this.onRelease = onRelease;
  }

  run(sql: string, params: unknown[] = []): [Row[] | WriteResult, unknown] {
    const values = params.map(toValue);
    try {
      const statement = this.database.prepare(translateQuery(sql));
      if (READS.test(sql)) return [statement.all(...values).map((r) => ({ ...r })), undefined];
      const info = statement.run(...values);
      return [{ affectedRows: Number(info.changes), insertId: Number(info.lastInsertRowid) }, undefined];
    } catch (error) {
      throw normalizeError(error);
    }
  }

  async query(sql: string, params?: unknown[]) {
    return this.run(sql, params);
  }
  async execute(sql: string, params?: unknown[]) {
    return this.run(sql, params);
  }
  async beginTransaction() {
    this.database.exec("BEGIN IMMEDIATE");
  }
  async commit() {
    this.database.exec("COMMIT");
  }
  async rollback() {
    this.database.exec("ROLLBACK");
  }
  release() {
    this.onRelease();
  }
}

/** « Pool » SQLite : une connexion par processus, transactions sérialisées. */
export class SqlitePool {
  private readonly mutex = new Mutex();
  private readonly inTransaction = new AsyncLocalStorage<SqliteConnection>();
  private readonly direct: SqliteConnection;
  private readonly database: Database;
  readonly path: string;

  constructor(database: Database, path: string) {
    this.database = database;
    this.path = path;
    this.direct = new SqliteConnection(database);
  }

  /** Requête hors transaction : attend qu'aucune transaction ne soit ouverte (sauf la sienne). */
  private async runOutside(sql: string, params?: unknown[]) {
    if (this.inTransaction.getStore()) return this.direct.run(sql, params);
    const release = await this.mutex.acquire();
    try {
      return this.direct.run(sql, params);
    } finally {
      release();
    }
  }

  query(sql: string, params?: unknown[]) {
    return this.runOutside(sql, params);
  }
  execute(sql: string, params?: unknown[]) {
    return this.runOutside(sql, params);
  }

  /** Transaction exclusive : les autres requêtes attendent sa fin. */
  async transaction<T>(work: (conn: SqliteConnection) => Promise<T>): Promise<T> {
    const current = this.inTransaction.getStore();
    if (current) return work(current);
    const release = await this.mutex.acquire();
    const conn = new SqliteConnection(this.database);
    try {
      await conn.beginTransaction();
      const result = await this.inTransaction.run(conn, () => work(conn));
      await conn.commit();
      return result;
    } catch (error) {
      try {
        await conn.rollback();
      } catch {
        /* transaction déjà annulée */
      }
      throw error;
    } finally {
      release();
    }
  }

  async end() {
    const release = await this.mutex.acquire();
    try {
      this.database.close();
    } finally {
      release();
    }
  }
}

/** Ouvre (ou crée) le fichier SQLite et règle la durabilité. */
export function openSqlite(path: string): SqlitePool {
  // `node:sqlite` est chargé à l'exécution (et non importé) : le bundler n'y touche pas.
  let DatabaseSync: (new (path: string) => Database) | undefined;
  try {
    const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
    DatabaseSync = (getBuiltin?.("node:sqlite") as { DatabaseSync?: new (path: string) => Database } | undefined)
      ?.DatabaseSync;
  } catch {
    DatabaseSync = undefined;
  }
  if (!DatabaseSync) {
    const error = new Error(
      `SQLite indisponible dans Node ${process.versions.node} : choisissez Node.js 22.13 ou plus récent dans hPanel`,
    );
    (error as { code?: string }).code = "SQLITE_INDISPONIBLE";
    throw error;
  }
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec("PRAGMA busy_timeout = 10000");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = FULL");
  database.exec("PRAGMA foreign_keys = OFF");
  return new SqlitePool(database, path);
}
