/**
 * Lecteur minimal de classeurs Excel (.xlsx) : première feuille, valeurs brutes.
 * Les dates Excel arrivent en numéro de série (ex. 45958) ; le schéma d'import
 * les convertit pour les colonnes de date.
 */
import { unzipSync } from "fflate";

/** Taille décompressée maximale (protection contre les « bombes zip »). */
const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;
const MAX_ROWS = 20_000;

export class XlsxError extends Error {}

function decodeXml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return String.fromCodePoint(code);
  });
}

/** Texte d'un nœud <si> ou <is> : concatène les <t>, ignore la phonétique <rPh>. */
function richText(xml: string) {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

/** « AB12 » → index de colonne 27. */
function columnIndex(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

export function readXlsx(bytes: Uint8Array): string[][] {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (!f.name.startsWith("xl/")) return false;
        total += f.originalSize;
        if (total > MAX_UNZIPPED_BYTES) throw new XlsxError("Classeur trop volumineux.");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof XlsxError) throw error;
    throw new XlsxError("Fichier Excel illisible (format .xlsx attendu).");
  }
  const text = (name: string) => {
    const f = files[name];
    return f ? new TextDecoder("utf-8").decode(f) : null;
  };

  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new XlsxError("Fichier Excel illisible (format .xlsx attendu).");
  const firstSheet = workbook.match(/<sheet\b[^>]*>/)?.[0];
  const relId = firstSheet && (attr(firstSheet, "r:id") ?? attr(firstSheet, "[a-z0-9]+:id"));
  const rels = text("xl/_rels/workbook.xml.rels") ?? "";
  let target: string | undefined;
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    if (attr(m[0], "Id") === relId) target = attr(m[0], "Target");
  }
  const sheetPath = target
    ? target.startsWith("/")
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, "")}`
    : "xl/worksheets/sheet1.xml";
  const sheet = text(sheetPath);
  if (!sheet) throw new XlsxError("Aucune feuille trouvée dans le classeur.");

  const shared: string[] = [];
  for (const m of (text("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    shared.push(richText(m[1]));
  }

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const rowAttrs = rowMatch[1] ?? rowMatch[3] ?? "";
    const rowIndex = Number(attr(rowAttrs, "r") ?? rows.length + 1) - 1;
    if (rowIndex > MAX_ROWS) throw new XlsxError(`Feuille trop longue (${MAX_ROWS} lignes maximum).`);
    const cells: string[] = [];
    for (const c of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r");
      const type = attr(c[1], "t");
      const body = c[2] ?? "";
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = richText(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
      else if (type === "b") value = raw === "1" ? "oui" : "non";
      else if (raw !== undefined) value = decodeXml(raw);
      cells[ref ? columnIndex(ref) : cells.length] = value;
    }
    rows[rowIndex] = Array.from(cells, (v) => v ?? "");
  }
  return Array.from(rows, (r) => r ?? []);
}
