/**
 * Écriture d'un import validé dans MySQL, en une transaction : tout ou rien.
 * Chaque ligne est créée ou mise à jour selon sa clé (nom du client, code de
 * mission, numéro de facture ou de paiement). Une cellule vide garde la valeur
 * déjà enregistrée.
 * En vérification (`dryRun`), la transaction est annulée : rapport exact, rien d'écrit.
 */
import { randomUUID } from "node:crypto";
import type { ExecuteValues, PoolConnection, RowDataPacket } from "mysql2/promise";
import { settleInvoice, ttc } from "@/lib/business";
import type { InvoiceStatus } from "@/lib/types";
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

/** Statut et date de solde d'une facture recalculés d'après tous ses paiements. */
async function resettle(conn: PoolConnection, factureId: string): Promise<{ error: string } | null> {
  const [[facture]] = await conn.query<RowDataPacket[]>(
    "SELECT montant_ht, taux_tva, statut FROM bos_factures WHERE id = ? FOR UPDATE",
    [factureId],
  );
  const [[sum]] = await conn.query<RowDataPacket[]>(
    "SELECT COALESCE(SUM(montant), 0) AS total, MAX(date_paiement) AS dernier FROM bos_paiements WHERE facture_id = ?",
    [factureId],
  );
  const montantTTC = ttc(Number(facture.montant_ht), Number(facture.taux_tva));
  const total = Number(sum.total);
  if (total > montantTTC + 0.005) return { error: `paiements supérieurs au montant TTC de la facture (${montantTTC} €)` };
  const status = String(facture.statut) as InvoiceStatus;
  // Statut importé « payée » ou « annulée » conservé (restauration d'une sauvegarde).
  if (status === "payee" || status === "annulee") return null;
  const settled = settleInvoice(status, montantTTC, total, String(sum.dernier));
  await conn.execute("UPDATE bos_factures SET statut = ?, payee_le = COALESCE(?, payee_le) WHERE id = ?", [
    settled.status,
    settled.payeeLe ?? null,
    factureId,
  ]);
  return null;
}

async function importRow(
  conn: PoolConnection,
  kind: ImportKind,
  r: ImportRecord,
): Promise<"created" | "updated" | { error: string }> {
  const now = toSqlDateTime(new Date().toISOString());

  if (kind === "clients") {
    return upsert(
      conn,
      "bos_clients",
      "nom",
      r.nom,
      {
        contact: r.contact,
        email: r.email,
        telephone: r.telephone,
        secteur: r.secteur,
        statut: r.statut,
        source: r.source,
        notes: r.notes,
        derniere_activite: now,
      },
      { statut: "prospect", cree_le: now },
      "cli",
    );
  }

  if (kind === "missions") {
    const clientId = await findId(conn, "bos_clients", "nom", r.client);
    if (!clientId) return { error: `client « ${r.client} » introuvable` };
    return upsert(
      conn,
      "bos_missions",
      "code",
      r.code,
      {
        titre: r.titre,
        client_id: clientId,
        type: r.type,
        statut: r.statut,
        montant_ht: r.montant,
        debut: r.debut,
        fin: r.fin,
        notes: r.notes,
      },
      { type: "agent_ia", statut: "proposition", montant_ht: 0, cree_le: now },
      "mis",
    );
  }

  if (kind === "factures") {
    const clientId = await findId(conn, "bos_clients", "nom", r.client);
    if (!clientId) return { error: `client « ${r.client} » introuvable` };
    let missionId: string | null = null;
    if (r.mission) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, client_id FROM bos_missions WHERE code = ? LIMIT 1",
        [r.mission],
      );
      if (!rows[0]) return { error: `mission « ${r.mission} » introuvable` };
      if (String(rows[0].client_id) !== clientId) return { error: `la mission « ${r.mission} » n'est pas celle de ce client` };
      missionId = String(rows[0].id);
    }
    return upsert(
      conn,
      "bos_factures",
      "numero",
      r.numero,
      {
        client_id: clientId,
        mission_id: missionId,
        objet: r.objet,
        montant_ht: r.montant,
        taux_tva: r.tva,
        emise_le: r.emiseLe,
        echeance: r.echeance,
        // Une date de solde sans statut vaut « payée ».
        statut: r.statut ?? (r.payeeLe ? "payee" : null),
        payee_le: r.payeeLe,
        recurrence: r.recurrence,
      },
      { statut: "emise", taux_tva: 20 },
      "inv",
    );
  }

  const factureId = await findId(conn, "bos_factures", "numero", r.facture);
  if (!factureId) return { error: `facture « ${r.facture} » introuvable` };
  const result = await upsert(
    conn,
    "bos_paiements",
    "numero",
    r.numero,
    {
      facture_id: factureId,
      montant: r.montant,
      date_paiement: r.date,
      mode: r.mode,
      reference: r.reference,
    },
    { mode: "virement", cree_le: now },
    "pay",
  );
  return (await resettle(conn, factureId)) ?? result;
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
