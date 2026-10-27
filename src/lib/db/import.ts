/**
 * Écriture d'un import validé dans MySQL, en une transaction : tout ou rien.
 * Chaque ligne est créée ou mise à jour selon sa clé (code, e-mail, référence,
 * numéro). Une cellule vide garde la valeur déjà enregistrée.
 * En vérification (`dryRun`), la transaction est annulée : rapport exact, rien d'écrit.
 */
import { randomUUID } from "node:crypto";
import type { ExecuteValues, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { ImportIssue, ImportKind, ImportRecord } from "@/lib/import/schema";
import { toSqlDateTime, transaction } from "./mysql";

export interface ImportReport {
  created: number;
  updated: number;
  errors: ImportIssue[];
  committed: boolean;
}

/** Valeurs d'une ligne ; `null` ou `undefined` = cellule vide. */
type Values = Record<string, ExecuteValues | undefined>;

class Rollback extends Error {
  constructor(readonly report: ImportReport) {
    super("rollback");
  }
}

async function findId(conn: PoolConnection, table: string, column: string, value: ExecuteValues) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM ${table} WHERE ${column} = ? LIMIT 1 FOR UPDATE`,
    [value],
  );
  return rows[0] ? String(rows[0].id) : null;
}

/** Retire les valeurs absentes : à la mise à jour, une cellule vide ne modifie rien. */
function present(values: Values): Record<string, ExecuteValues> {
  return Object.fromEntries(
    Object.entries(values).filter((e): e is [string, ExecuteValues] => e[1] !== null && e[1] !== undefined),
  );
}

async function upsert(
  conn: PoolConnection,
  table: string,
  keyColumn: string,
  keyValue: ExecuteValues,
  values: Values,
  defaults: Values,
  idPrefix: string,
): Promise<"created" | "updated"> {
  const id = await findId(conn, table, keyColumn, keyValue);
  const set = present(values);
  if (id) {
    const columns = Object.keys(set);
    if (columns.length) {
      await conn.execute(
        `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
        [...columns.map((c) => set[c]), id],
      );
    }
    return "updated";
  }
  const row = { id: `${idPrefix}-${randomUUID()}`, [keyColumn]: keyValue, ...defaults, ...set };
  const columns = Object.keys(row);
  await conn.execute(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    columns.map((c) => row[c] ?? null),
  );
  return "created";
}

const json = (v: unknown) => (Array.isArray(v) ? JSON.stringify(v) : null);
const bit = (v: unknown) => (typeof v === "boolean" ? (v ? 1 : 0) : null);
const datetime = (v: unknown) => (typeof v === "string" ? toSqlDateTime(v) : null);

async function importRow(
  conn: PoolConnection,
  kind: ImportKind,
  r: ImportRecord,
): Promise<"created" | "updated" | { error: string }> {
  const now = toSqlDateTime(new Date().toISOString());

  if (kind === "sessions") {
    return upsert(
      conn,
      "bos_sessions",
      "code",
      r.code,
      {
        titre: r.titre,
        debut: r.debut,
        fin: r.fin,
        formateur: r.formateur,
        places: r.places,
        inscrits: r.inscrits,
        statut: r.statut,
        qualiopi_indicateurs: json(r.qualiopi),
      },
      { inscrits: 0, statut: "planifiee", qualiopi_indicateurs: "[]" },
      "ses",
    );
  }

  if (kind === "apprenants") {
    let sessionId: string | null = null;
    if (r.session) {
      sessionId = await findId(conn, "bos_sessions", "code", r.session);
      if (!sessionId) return { error: `session « ${r.session} » introuvable` };
    }
    return upsert(
      conn,
      "bos_learners",
      "email",
      r.email,
      {
        nom: r.nom,
        prenom: r.prenom,
        entreprise: r.entreprise,
        status: r.statut,
        pipeline_stage: r.etape,
        session_id: sessionId,
        derniere_activite: datetime(r.derniereActivite),
        comprehension_validee: bit(r.comprehension),
        score_quiz: r.score,
      },
      {
        status: "inscrit",
        pipeline_stage: "inscription",
        derniere_activite: now,
        comprehension_validee: 0,
        created_at: now,
      },
      "lrn",
    );
  }

  if (kind === "dossiers") {
    const learnerId = await findId(conn, "bos_learners", "email", r.apprenant);
    if (!learnerId) return { error: `apprenant « ${r.apprenant} » introuvable` };
    const sessionId = await findId(conn, "bos_sessions", "code", r.session);
    if (!sessionId) return { error: `session « ${r.session} » introuvable` };
    return upsert(
      conn,
      "bos_opco_dossiers",
      "reference",
      r.reference,
      {
        organisme: r.organisme,
        apprenant_id: learnerId,
        session_id: sessionId,
        montant: r.montant,
        status: r.statut,
        completude: r.completude,
        pieces_manquantes: json(r.pieces),
        updated_at: now,
      },
      { status: "brouillon", completude: 0, pieces_manquantes: "[]" },
      "opco",
    );
  }

  let dossierId: string | null = null;
  if (r.dossier) {
    dossierId = await findId(conn, "bos_opco_dossiers", "reference", r.dossier);
    if (!dossierId) return { error: `dossier OPCO « ${r.dossier} » introuvable` };
  }
  return upsert(
    conn,
    "bos_invoices",
    "numero",
    r.numero,
    {
      client: r.client,
      email_client: r.emailClient,
      montant_ht: r.montant,
      emise_le: r.emiseLe,
      echeance: r.echeance,
      status: r.statut,
      acompte_pct: r.acompte,
      dossier_opco_id: dossierId,
    },
    { status: "emise", acompte_pct: 0 },
    "inv",
  );
}

export async function importIntoDatabase(
  kind: ImportKind,
  rows: Array<{ line: number; record: ImportRecord }>,
  { dryRun }: { dryRun: boolean },
): Promise<ImportReport> {
  try {
    return await transaction(async (conn) => {
      const report: ImportReport = { created: 0, updated: 0, errors: [], committed: false };
      for (const { line, record } of rows) {
        const result = await importRow(conn, kind, record);
        if (typeof result === "object") report.errors.push({ line, message: result.error });
        else report[result] += 1;
      }
      // Erreur sur une ligne ou simple vérification : on annule tout.
      if (dryRun || report.errors.length) throw new Rollback(report);
      return { ...report, committed: true };
    });
  } catch (error) {
    if (error instanceof Rollback) return error.report;
    throw error;
  }
}
