import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/config";
import { decodeText, parseCsv } from "@/lib/import/csv";
import { IMPORT_KINDS, parseImport, type ImportKind } from "@/lib/import/schema";
import { XlsxError, readXlsx } from "@/lib/import/xlsx";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function isXlsx(name: string, bytes: Uint8Array) {
  // Signature ZIP « PK\x03\x04 » ou extension .xlsx
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  return name.toLowerCase().endsWith(".xlsx") || zip;
}

/**
 * Import CSV / Excel. `mode=verifier` : rapport sans rien écrire ;
 * `mode=importer` : écrit tout ou rien (aucune ligne si une seule est en erreur).
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Import impossible en mode démonstration : connectez d'abord la base MySQL." },
      { status: 409 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("fichier");
  const kind = String(form?.get("type") ?? "") as ImportKind;
  const dryRun = form?.get("mode") !== "importer";

  if (!IMPORT_KINDS.some((k) => k.kind === kind)) {
    return NextResponse.json({ error: "Type d'import inconnu" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (2 Mo maximum)" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const legacyXls = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (legacyXls || file.name.toLowerCase().endsWith(".xls")) {
    return NextResponse.json(
      { error: "Ancien format Excel (.xls) non pris en charge : enregistrez le fichier en .xlsx ou en CSV." },
      { status: 400 },
    );
  }
  let table: string[][];
  try {
    table = isXlsx(file.name, bytes) ? readXlsx(bytes) : parseCsv(decodeText(bytes));
  } catch (error) {
    if (error instanceof XlsxError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  const parsed = parseImport(kind, table);
  const base = { type: kind, lignes: parsed.rows.length + parsed.errors.length, warnings: parsed.warnings };
  const { importIntoDatabase } = await import("@/lib/db/import");

  if (parsed.errors.length) {
    // Vérifie aussi les références des lignes valides : toutes les erreurs en une fois.
    const check = await importIntoDatabase(kind, parsed.rows, { dryRun: true });
    const errors = [...parsed.errors, ...check.errors].sort((a, b) => a.line - b.line);
    return NextResponse.json({ ...base, created: 0, updated: 0, committed: false, errors });
  }

  const report = await importIntoDatabase(kind, parsed.rows, { dryRun });
  return NextResponse.json({ ...base, ...report });
}
