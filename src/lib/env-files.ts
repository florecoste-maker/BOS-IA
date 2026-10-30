/**
 * Variables de BOS-IA lues dans un fichier persistant `bos-ia.env`.
 *
 * Sur Hostinger, l'application est lancée par LiteSpeed (lsnode) depuis un
 * dossier recréé à chaque déploiement (`hbuilds/versions/<id>/nodejs`), et le
 * processus ne reçoit pas les variables saisies dans hPanel. Le fichier est
 * cherché dans ce dossier puis dans chacun de ses parents (par exemple
 * `~/bos-ia.env`) : il survit aux déploiements et n'est jamais servi au web.
 * Les variables déjà présentes dans le processus restent prioritaires.
 *
 * Lecture tolérante aux fichiers créés depuis un navigateur : BOM en tête,
 * fins de ligne Windows, espaces autour du nom, nom proche (`bos_ia.env`,
 * `bos-ia.env.txt`, `.bos-ia.env`). Un fichier placé dans `public_html` est
 * signalé mais jamais chargé (il serait lisible sur le web).
 */
import { randomBytes } from "node:crypto";
import { linkSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

export const ENV_FILE_NAME = "bos-ia.env";

/** Secret de session généré par le serveur lui-même (jamais saisi ni affiché). */
export const SESSION_KEY_FILE = "bos-ia-session.key";

const CANDIDATE = /^\.?bos[-_ ]?ia\.env(\.txt)?$/i;

/** Nouvel essai au plus toutes les 10 s tant que le cockpit n'est pas configuré. */
const RETRY_MS = 10_000;

export interface EnvFileReport {
  chemin: string;
  charge: boolean;
  public: boolean;
  cles: string[];
  erreur?: string;
}

/** État partagé entre bundles (instrumentation, proxy, routes). */
const registry = globalThis as typeof globalThis & {
  __bosEnvFiles?: string[];
  __bosEnvLastScan?: number;
};

export function loadedEnvFiles() {
  return registry.__bosEnvFiles ?? [];
}

function candidatesIn(dir: string) {
  try {
    return readdirSync(dir)
      .filter((name) => CANDIDATE.test(name))
      .map((name) => path.join(dir, name))
      .filter((file) => statSync(file).isFile());
  } catch {
    return [];
  }
}

/** Fichiers candidats : dossier de l'application, ses parents, et leurs `public_html`. */
export function findEnvFiles(start = process.cwd()) {
  const found: { file: string; isPublic: boolean }[] = [];
  let dir = path.resolve(start);
  for (;;) {
    for (const file of candidatesIn(dir)) found.push({ file, isPublic: dir.split(path.sep).includes("public_html") });
    for (const file of candidatesIn(path.join(dir, "public_html"))) found.push({ file, isPublic: true });
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

/** Contenu d'un fichier, nettoyé (BOM, CRLF, espaces autour des noms). */
export function readEnvFile(file: string): Record<string, string> {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const parsed = parseEnv(text) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const name = key.replace(/^﻿/, "").replace(/^export\s+/, "").trim();
    if (name) out[name] = value.trim();
  }
  return out;
}

export function loadPersistentEnv(start = process.cwd()) {
  registry.__bosEnvLastScan = Date.now();
  for (const { file, isPublic } of findEnvFiles(start)) {
    if (isPublic) continue;
    try {
      // Relu à chaque passage : une variable ajoutée depuis (installation, workflow) est prise en compte.
      for (const [key, value] of Object.entries(readEnvFile(file))) {
        if (!process.env[key]?.trim()) process.env[key] = value;
      }
      if (!loadedEnvFiles().includes(file)) registry.__bosEnvFiles = [...loadedEnvFiles(), file];
    } catch (error) {
      console.error(`Lecture impossible de ${file} :`, error instanceof Error ? error.message : error);
    }
  }
  if (process.env.NODE_ENV === "production") ensureSessionSecret();
}

/** Relecture limitée à une toutes les 10 s : prend en compte un fichier créé ou complété après le démarrage. */
export function retryPersistentEnv() {
  if (Date.now() - (registry.__bosEnvLastScan ?? 0) < RETRY_MS) return;
  loadPersistentEnv();
}

/** Diagnostic : chemins et noms de variables trouvés, jamais les valeurs. */
export function describeEnvFiles(anonymize: (p: string) => string): EnvFileReport[] {
  return findEnvFiles().map(({ file, isPublic }) => {
    const report: EnvFileReport = {
      chemin: anonymize(file),
      charge: loadedEnvFiles().includes(file),
      public: isPublic,
      cles: [],
    };
    try {
      report.cles = Object.entries(readEnvFile(file)).map(([k, v]) => (v ? k : `${k} (vide)`));
    } catch (error) {
      report.erreur = error instanceof Error ? error.message : String(error);
    }
    return report;
  });
}

/**
 * Dossier où BOS-IA écrit ses réglages : la racine du compte Hostinger (le
 * parent de `domains`), sinon le dossier personnel s'il contient l'application.
 * Toujours un parent du dossier de l'application : `findEnvFiles` le relit.
 */
export function persistentDir(start = process.cwd()) {
  const resolved = path.resolve(start);
  const parts = resolved.split(path.sep);
  const domains = parts.lastIndexOf("domains");
  if (domains > 0) return parts.slice(0, domains).join(path.sep) || path.sep;
  const home = os.homedir();
  return resolved === home || resolved.startsWith(`${home}${path.sep}`) ? home : resolved;
}

/**
 * Valeur entre guillemets relue telle quelle par `parseEnv`, ou null si
 * impossible. Les guillemets doubles interprètent `\n` : en dernier recours,
 * et seulement sans barre oblique inverse.
 */
export function quoteEnvValue(value: string) {
  if (/[\r\n]/.test(value)) return null;
  const q = ["'", "`", '"'].find((c) => !value.includes(c) && (c !== '"' || !value.includes("\\")));
  return q ? `${q}${value}${q}` : null;
}

/** Écriture atomique (fichier temporaire puis renommage), lisible par le seul compte. */
function writePrivate(file: string, content: string) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, file);
}

/**
 * Enregistre des variables dans `bos-ia.env` (créé au besoin, hors de tout
 * dossier public) et les applique au processus courant. Une variable déjà
 * présente dans le fichier est remplacée. Renvoie le chemin du fichier.
 */
export function writeEnvVariables(values: Record<string, string>, start = process.cwd()) {
  const dir = persistentDir(start);
  const existing = candidatesIn(dir).find((f) => path.basename(f) === ENV_FILE_NAME) ?? candidatesIn(dir)[0];
  const file = existing ?? path.join(dir, ENV_FILE_NAME);
  let lines: string[] = [];
  try {
    lines = readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  } catch {
    lines = [];
  }
  for (const [key, value] of Object.entries(values)) {
    const quoted = quoteEnvValue(value);
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || quoted === null) throw new Error(`Valeur impossible à enregistrer : ${key}`);
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
    lines = lines.filter((line) => !pattern.test(line));
    lines.push(`${key}=${quoted}`);
  }
  writePrivate(file, `${lines.join("\n").trim()}\n`);
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  if (!loadedEnvFiles().includes(file)) registry.__bosEnvFiles = [...loadedEnvFiles(), file];
  return file;
}

/**
 * BOS_SESSION_SECRET absent : le serveur en crée un (48 octets aléatoires) dans
 * `bos-ia-session.key`, à côté de `bos-ia.env`. Création exclusive (lien
 * atomique) : plusieurs processus Node partagent toujours le même secret.
 */
export function ensureSessionSecret(start = process.cwd()) {
  if (process.env.BOS_SESSION_SECRET?.trim()) return;
  const file = path.join(persistentDir(start), SESSION_KEY_FILE);
  try {
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    writeFileSync(tmp, `${randomBytes(48).toString("base64url")}\n`, { mode: 0o600 });
    try {
      linkSync(tmp, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    } finally {
      unlinkSync(tmp);
    }
    const secret = readFileSync(file, "utf8").trim();
    if (secret.length >= 32) process.env.BOS_SESSION_SECRET = secret;
  } catch (error) {
    console.error("Secret de session impossible à créer :", error instanceof Error ? error.message : error);
  }
}
