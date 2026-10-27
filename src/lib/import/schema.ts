/**
 * Colonnes attendues pour chaque type d'import et validation ligne par ligne.
 * En-têtes reconnus sans tenir compte des accents ni de la casse ; valeurs
 * françaises acceptées (27/10/2026, « 1 490,50 € », « Oui », « En formation »…).
 */
import { statusLabel } from "@/lib/format";

export type ImportKind = "sessions" | "apprenants" | "dossiers" | "factures";

export const IMPORT_KINDS: Array<{ kind: ImportKind; label: string; key: string }> = [
  { kind: "sessions", label: "Sessions de formation", key: "code" },
  { kind: "apprenants", label: "Apprenants", key: "email" },
  { kind: "dossiers", label: "Dossiers OPCO", key: "reference" },
  { kind: "factures", label: "Factures", key: "numero" },
];

type FieldType =
  | "text"
  | "email"
  | "int"
  | "percent"
  | "decimal"
  | "date"
  | "datetime"
  | "bool"
  | "list"
  | { enum: readonly string[] };

export interface Field {
  key: string;
  header: string;
  aliases?: string[];
  type: FieldType;
  required?: boolean;
  example: string;
  help?: string;
}

const LEARNER_STATUS = ["lead", "inscrit", "en_formation", "inactif", "certifie", "abandon"] as const;
const PIPELINE_STAGE = [
  "lead",
  "inscription",
  "parcours",
  "evaluation",
  "certification",
  "completion",
] as const;
const SESSION_STATUS = ["planifiee", "en_cours", "terminee"] as const;
const OPCO_STATUS = ["brouillon", "completude", "transmis", "accepte", "refuse", "paye"] as const;
const INVOICE_STATUS = [
  "brouillon",
  "emise",
  "acompte_paye",
  "solde_du",
  "payee",
  "relance",
  "impayee",
] as const;

export const FIELDS: Record<ImportKind, Field[]> = {
  sessions: [
    { key: "code", header: "code", type: "text", required: true, example: "GWS-INIT-7H", help: "Identifiant unique de la session" },
    { key: "titre", header: "titre", aliases: ["intitule", "formation"], type: "text", required: true, example: "Google Workspace — Prise en main" },
    { key: "debut", header: "debut", aliases: ["date_debut", "date_de_debut"], type: "date", required: true, example: "03/11/2026" },
    { key: "fin", header: "fin", aliases: ["date_fin", "date_de_fin"], type: "date", required: true, example: "04/11/2026" },
    { key: "formateur", header: "formateur", aliases: ["formatrice", "intervenant"], type: "text", required: true, example: "A. Moreau" },
    { key: "places", header: "places", aliases: ["capacite", "nb_places"], type: "int", required: true, example: "12" },
    { key: "inscrits", header: "inscrits", aliases: ["nb_inscrits"], type: "int", example: "8" },
    { key: "statut", header: "statut", type: { enum: SESSION_STATUS }, example: "Planifiée", help: "Planifiée, En cours ou Terminée (défaut : Planifiée)" },
    { key: "qualiopi", header: "indicateurs_qualiopi", aliases: ["qualiopi", "indicateurs"], type: "list", example: "I4|I11", help: "Séparés par | ou ," },
  ],
  apprenants: [
    { key: "email", header: "email", aliases: ["e_mail", "courriel", "mail", "adresse_email"], type: "email", required: true, example: "camille.dupont@exemple.fr", help: "Identifiant unique de l'apprenant" },
    { key: "nom", header: "nom", type: "text", required: true, example: "Dupont" },
    { key: "prenom", header: "prenom", type: "text", required: true, example: "Camille" },
    { key: "entreprise", header: "entreprise", aliases: ["societe", "employeur", "client"], type: "text", example: "Atelier Nord" },
    { key: "statut", header: "statut", type: { enum: LEARNER_STATUS }, example: "Inscrit", help: "Lead, Inscrit, En formation, Ghost learner, Certifié, Abandon (défaut : Inscrit)" },
    { key: "etape", header: "etape", aliases: ["etape_pipeline", "pipeline"], type: { enum: PIPELINE_STAGE }, example: "inscription", help: "lead, inscription, parcours, evaluation, certification, completion (défaut : inscription)" },
    { key: "session", header: "session_code", aliases: ["session", "code_session"], type: "text", example: "GWS-INIT-7H", help: "Code d'une session existante ou importée avant" },
    { key: "derniereActivite", header: "derniere_activite", aliases: ["derniere_connexion"], type: "datetime", example: "27/10/2026" },
    { key: "comprehension", header: "comprehension_validee", aliases: ["comprehension"], type: "bool", example: "non", help: "oui / non" },
    { key: "score", header: "score_quiz", aliases: ["score", "note"], type: "percent", example: "85", help: "0 à 100" },
  ],
  dossiers: [
    { key: "reference", header: "reference", aliases: ["ref", "numero_dossier"], type: "text", required: true, example: "OPCO-2026-0842", help: "Identifiant unique du dossier" },
    { key: "organisme", header: "organisme", aliases: ["opco", "financeur"], type: "text", required: true, example: "AKTO" },
    { key: "apprenant", header: "apprenant_email", aliases: ["email_apprenant", "apprenant", "email"], type: "email", required: true, example: "camille.dupont@exemple.fr" },
    { key: "session", header: "session_code", aliases: ["session", "code_session"], type: "text", required: true, example: "GWS-INIT-7H" },
    { key: "montant", header: "montant", aliases: ["montant_ht", "montant_finance"], type: "decimal", required: true, example: "1490,00" },
    { key: "statut", header: "statut", type: { enum: OPCO_STATUS }, example: "Complétude", help: "Brouillon, Complétude, Transmis, Accepté, Refusé, Payé (défaut : Brouillon)" },
    { key: "completude", header: "completude", aliases: ["completude_pct"], type: "percent", example: "70", help: "0 à 100" },
    { key: "pieces", header: "pieces_manquantes", aliases: ["pieces"], type: "list", example: "Attestation employeur|Programme signé", help: "Séparées par |" },
  ],
  factures: [
    { key: "numero", header: "numero", aliases: ["numero_facture", "facture", "n_facture"], type: "text", required: true, example: "FA-2026-0142", help: "Identifiant unique de la facture" },
    { key: "client", header: "client", aliases: ["entreprise", "societe"], type: "text", required: true, example: "Atelier Nord" },
    { key: "montant", header: "montant_ht", aliases: ["montant", "total_ht"], type: "decimal", required: true, example: "1490,00" },
    { key: "emiseLe", header: "emise_le", aliases: ["date_emission", "date", "date_facture"], type: "date", required: true, example: "06/10/2026" },
    { key: "echeance", header: "echeance", aliases: ["date_echeance"], type: "date", required: true, example: "05/11/2026" },
    { key: "statut", header: "statut", type: { enum: INVOICE_STATUS }, example: "Émise", help: "Brouillon, Émise, Acompte payé, Solde dû, Payée, Relance, Impayée (défaut : Émise)" },
    { key: "acompte", header: "acompte_pct", aliases: ["acompte"], type: "percent", example: "30", help: "0 à 100" },
    { key: "dossier", header: "dossier_reference", aliases: ["dossier_opco", "reference_dossier"], type: "text", example: "OPCO-2026-0842", help: "Référence d'un dossier OPCO existant" },
  ],
};

export type ImportValue = string | number | boolean | string[] | null;
export type ImportRecord = Record<string, ImportValue>;

export interface ImportIssue {
  line: number;
  message: string;
}

export interface ParsedImport {
  rows: Array<{ line: number; record: ImportRecord }>;
  errors: ImportIssue[];
  warnings: string[];
}

export const MAX_IMPORT_ROWS = 5000;

/** « Date de début » → « date_de_debut ». */
export function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function validDate(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Numéro de série Excel (jours depuis le 30/12/1899) → AAAA-MM-JJ. */
function fromExcelSerial(serial: number) {
  const ms = Math.round((serial - 25569) * 86_400_000);
  return new Date(ms).toISOString();
}

/** JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA, AAAA-MM-JJ ou numéro de série Excel → AAAA-MM-JJ. */
export function parseDate(value: string): string | null {
  const v = value.trim();
  let m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    const serial = Number(v);
    if (serial >= 20000 && serial <= 80000) return fromExcelSerial(serial).slice(0, 10);
  }
  return null;
}

/** Date seule (minuit UTC), date + heure « JJ/MM/AAAA HH:MM », ISO 8601 ou série Excel. */
export function parseDateTime(value: string): string | null {
  const v = value.trim();
  const iso = v.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  if (iso) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  if (/^\d{5}\.\d+$/.test(v)) {
    const serial = Number(v);
    if (serial >= 20000 && serial <= 80000) return fromExcelSerial(serial);
  }
  const m = v.match(/^(\S+)(?:\s+(\d{1,2})[:h](\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const date = parseDate(m[1]);
  if (!date) return null;
  const [h, mi, s] = [Number(m[2] ?? 0), Number(m[3] ?? 0), Number(m[4] ?? 0)];
  if (h > 23 || mi > 59 || s > 59) return null;
  return `${date}T${pad(h)}:${pad(mi)}:${pad(s)}.000Z`;
}

/** « 1 490,50 € », « 1490.5 », « 1,490.50 » → 1490.5. */
export function parseDecimal(value: string): number | null {
  let v = value.replace(/[\s  €]/g, "");
  if (!v) return null;
  const comma = v.lastIndexOf(",");
  const dot = v.lastIndexOf(".");
  if (comma > dot) v = v.replace(/\./g, "").replace(",", ".");
  else v = v.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}

const TRUE_VALUES = new Set(["oui", "o", "vrai", "true", "1", "x", "yes", "y"]);
const FALSE_VALUES = new Set(["non", "n", "faux", "false", "0", "no"]);

function enumMatcher(values: readonly string[]) {
  const map = new Map<string, string>();
  for (const v of values) {
    map.set(normalizeHeader(v), v);
    map.set(normalizeHeader(statusLabel(v)), v);
  }
  return map;
}

function convert(field: Field, raw: string): { value: ImportValue } | { error: string } {
  const v = raw.trim();
  if (!v) {
    return field.required ? { error: `« ${field.header} » est obligatoire` } : { value: null };
  }
  const t = field.type;
  if (typeof t === "object") {
    const match = enumMatcher(t.enum).get(normalizeHeader(v));
    return match
      ? { value: match }
      : { error: `« ${field.header} » : valeur « ${v} » inconnue (${field.help ?? t.enum.join(", ")})` };
  }
  switch (t) {
    case "text":
      return v.length > 255 ? { error: `« ${field.header} » dépasse 255 caractères` } : { value: v };
    case "email": {
      const email = v.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255
        ? { value: email }
        : { error: `« ${field.header} » : adresse e-mail invalide « ${v} »` };
    }
    case "int":
    case "percent": {
      const n = parseDecimal(v);
      if (n === null || !Number.isInteger(n) || n < 0) {
        return { error: `« ${field.header} » : nombre entier attendu, reçu « ${v} »` };
      }
      if (t === "percent" && n > 100) return { error: `« ${field.header} » : 0 à 100 attendu, reçu « ${v} »` };
      return { value: n };
    }
    case "decimal": {
      const n = parseDecimal(v);
      return n === null || n < 0
        ? { error: `« ${field.header} » : montant invalide « ${v} »` }
        : { value: Math.round(n * 100) / 100 };
    }
    case "date": {
      const d = parseDate(v);
      return d ? { value: d } : { error: `« ${field.header} » : date invalide « ${v} » (JJ/MM/AAAA attendu)` };
    }
    case "datetime": {
      const d = parseDateTime(v);
      return d ? { value: d } : { error: `« ${field.header} » : date invalide « ${v} » (JJ/MM/AAAA attendu)` };
    }
    case "bool": {
      const b = normalizeHeader(v);
      if (TRUE_VALUES.has(b)) return { value: true };
      if (FALSE_VALUES.has(b)) return { value: false };
      return { error: `« ${field.header} » : oui ou non attendu, reçu « ${v} »` };
    }
    case "list":
      // « | » prioritaire : une pièce peut contenir une virgule (« Attestation, signée »).
      return {
        value: v
          .split(v.includes("|") ? "|" : /[,;]/)
          .map((s) => s.trim())
          .filter(Boolean),
      };
  }
}

/** Valide un tableau (première ligne = en-têtes) pour le type d'import donné. */
export function parseImport(kind: ImportKind, table: string[][]): ParsedImport {
  const fields = FIELDS[kind];
  const errors: ImportIssue[] = [];
  const warnings: string[] = [];
  const rows: ParsedImport["rows"] = [];

  const headerIndex = table.findIndex((r) => r.some((c) => c.trim()));
  if (headerIndex < 0) return { rows, errors: [{ line: 1, message: "Fichier vide" }], warnings };
  const headers = table[headerIndex].map(normalizeHeader);

  const columns = new Map<string, number>();
  headers.forEach((h, i) => {
    if (!h) return;
    const field = fields.find((f) => f.header === h || f.key.toLowerCase() === h || f.aliases?.includes(h));
    if (!field) warnings.push(`Colonne « ${table[headerIndex][i].trim()} » ignorée (non reconnue)`);
    else if (columns.has(field.key)) warnings.push(`Colonne « ${table[headerIndex][i].trim()} » en double, ignorée`);
    else columns.set(field.key, i);
  });
  const missing = fields.filter((f) => f.required && !columns.has(f.key)).map((f) => f.header);
  if (missing.length) {
    return {
      rows,
      errors: [{ line: headerIndex + 1, message: `Colonnes obligatoires manquantes : ${missing.join(", ")}` }],
      warnings,
    };
  }

  const keyField = IMPORT_KINDS.find((k) => k.kind === kind)!.key;
  const seen = new Map<string, number>();
  const dataRows = table.slice(headerIndex + 1);
  if (dataRows.filter((r) => r.some((c) => c.trim())).length > MAX_IMPORT_ROWS) {
    return {
      rows,
      errors: [{ line: 1, message: `Trop de lignes (${MAX_IMPORT_ROWS} maximum par import)` }],
      warnings,
    };
  }

  dataRows.forEach((cells, offset) => {
    const line = headerIndex + 2 + offset;
    if (!cells.some((c) => c.trim())) return;
    const record: ImportRecord = {};
    const lineErrors: string[] = [];
    for (const field of fields) {
      const index = columns.get(field.key);
      const result = convert(field, index === undefined ? "" : (cells[index] ?? ""));
      if ("error" in result) lineErrors.push(result.error);
      else record[field.key] = result.value;
    }
    if (lineErrors.length) {
      errors.push({ line, message: lineErrors.join(" ; ") });
      return;
    }
    const key = String(record[fields.find((f) => f.key === keyField)!.key]);
    const normalizedKey = key.toLowerCase();
    if (seen.has(normalizedKey)) {
      errors.push({ line, message: `« ${key} » apparaît déjà ligne ${seen.get(normalizedKey)}` });
      return;
    }
    seen.set(normalizedKey, line);
    rows.push({ line, record });
  });

  if (!rows.length && !errors.length) errors.push({ line: headerIndex + 2, message: "Aucune ligne de données" });
  return { rows, errors, warnings };
}

/** Modèle CSV (séparateur « ; », UTF-8 avec BOM) : ouvrable tel quel dans Excel. */
export function templateCsv(kind: ImportKind) {
  const fields = FIELDS[kind];
  const quote = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return `﻿${fields.map((f) => quote(f.header)).join(";")}\r\n${fields.map((f) => quote(f.example)).join(";")}\r\n`;
}
