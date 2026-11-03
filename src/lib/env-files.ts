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
 *
 * Priorité : variable réellement fournie au processus > `bos-ia.env` > copie
 * faite au build dans les `.env*` de l'application. `scripts/prepare-standalone.mjs`
 * recopie les variables hPanel dans `.next/standalone/.env.production.local`,
 * que Next charge au démarrage : sans cette règle, un ancien
 * BOS_ADMIN_PASSWORD de hPanel l'emportait sur le mot de passe choisi par le lien
 * d'installation (écrit dans `bos-ia.env`) dès le redémarrage suivant, et la
 * connexion répondait « Mot de passe de secours incorrect ».
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
  /** Valeurs venues de `bos-ia.env` : une modification ultérieure du fichier les remplace. */
  __bosEnvFromFile?: Record<string, string>;
  /** Noms dont la copie du build a été remplacée par `bos-ia.env` (diagnostic, jamais de valeur). */
  __bosEnvBuildReplaced?: string[];
};

export function buildCopiesReplaced() {
  return registry.__bosEnvBuildReplaced ?? [];
}

/** D'où vient la valeur utilisée d'une variable (diagnostic : jamais la valeur). */
export function envSource(key: string, start = process.cwd()) {
  const current = process.env[key];
  if (!current?.trim()) return "absent";
  if (fromFile()[key] === current) return "bos-ia.env";
  if (isBuildCopy(current, appEnvFileValues(start)[key])) return "copie du build (variables hPanel)";
  return "processus";
}

const APP_ENV_FILES = [".env", ".env.production", ".env.local", ".env.production.local"];

/**
 * Valeurs des fichiers `.env*` de l'application (dossier courant et, pour le
 * serveur autonome, la racine du projet) : la copie faite au build.
 */
export function appEnvFileValues(start = process.cwd()): Record<string, string> {
  const dir = path.resolve(start);
  const dirs = path.basename(dir) === "standalone" ? [path.resolve(dir, "../.."), dir] : [dir];
  const out: Record<string, string> = {};
  for (const d of dirs) {
    for (const name of APP_ENV_FILES) {
      try {
        Object.assign(out, readEnvFile(path.join(d, name)));
      } catch {
        // Fichier absent : rien à reprendre.
      }
    }
  }
  return out;
}

/** La valeur du processus est celle d'un `.env*` de l'application (`$` échappé pour @next/env). */
function isBuildCopy(current: string, copy: string | undefined) {
  if (copy === undefined) return false;
  return current === copy || current === copy.replaceAll("\\$", "$") || current.trim() === copy.trim();
}

function fromFile() {
  return (registry.__bosEnvFromFile ??= {});
}

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
  // Plusieurs fichiers : le plus proche de l'application l'emporte, comme avant.
  const vus = new Set<string>();
  const valeursFichier: Record<string, string> = {};
  const copiesBuild = appEnvFileValues(start);
  for (const { file, isPublic } of findEnvFiles(start)) {
    if (isPublic) continue;
    try {
      // Relu à chaque passage : une variable ajoutée depuis (installation, workflow) est prise en compte.
      // Une variable fournie par le processus (hPanel) reste prioritaire ; une valeur
      // venue du fichier suit ses modifications (réglages changés depuis le cockpit
      // par un autre processus Node).
      for (const [key, value] of Object.entries(readEnvFile(file))) {
        const current = process.env[key];
        if (vus.has(key)) continue;
        vus.add(key);
        valeursFichier[key] = value;
        // Une valeur vide du fichier ne remplace jamais la copie du build.
        const copieBuild = Boolean(current?.trim()) && Boolean(value) && current !== value && isBuildCopy(current!, copiesBuild[key]);
        if (!current?.trim() || current === fromFile()[key] || copieBuild) {
          process.env[key] = value;
          fromFile()[key] = value;
          if (copieBuild && !buildCopiesReplaced().includes(key)) {
            registry.__bosEnvBuildReplaced = [...buildCopiesReplaced(), key];
            console.warn(`${key} : valeur de bos-ia.env utilisée (copie du build plus ancienne ignorée).`);
          }
        }
      }
      if (!loadedEnvFiles().includes(file)) registry.__bosEnvFiles = [...loadedEnvFiles(), file];
    } catch (error) {
      console.error(`Lecture impossible de ${file} :`, error instanceof Error ? error.message : error);
    }
  }
  repairAuthEnv(valeursFichier);
  // Vercel : disque en lecture seule, le secret est dérivé du mot de passe (auth.ts).
  if (process.env.NODE_ENV === "production" && !process.env.VERCEL) ensureSessionSecret();
}

/** Mêmes seuils que auth.ts (12 et 32 caractères). */
const MIN_ADMIN_PASSWORD = 12;
const MIN_SESSION_SECRET = 32;

/**
 * Une valeur fournie par le processus (variables hPanel du site, reprises au
 * build) reste prioritaire… sauf si elle est inutilisable : un mot de passe
 * administrateur ou un secret de session trop court fermerait le cockpit alors
 * qu'un réglage valide existe. Cas réel : app.jamaliance.com, dont les
 * variables hPanel gardaient un mot de passe d'essai de moins de 12 caractères.
 */
export function repairAuthEnv(valeursFichier: Record<string, string>) {
  const password = process.env.BOS_ADMIN_PASSWORD?.trim();
  const fromFilePassword = valeursFichier.BOS_ADMIN_PASSWORD?.trim();
  if (password && password.length < MIN_ADMIN_PASSWORD && fromFilePassword && fromFilePassword.length >= MIN_ADMIN_PASSWORD) {
    process.env.BOS_ADMIN_PASSWORD = fromFilePassword;
    fromFile().BOS_ADMIN_PASSWORD = fromFilePassword;
    console.warn("BOS_ADMIN_PASSWORD du site trop court : valeur de bos-ia.env utilisée.");
  }
  const secret = process.env.BOS_SESSION_SECRET?.trim();
  if (secret && secret.length < MIN_SESSION_SECRET) {
    // Retiré : remplacé par bos-ia-session.key (Hostinger) ou dérivé du mot de passe (auth.ts).
    delete process.env.BOS_SESSION_SECRET;
    console.warn("BOS_SESSION_SECRET du site trop court : ignoré.");
  }
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
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
    fromFile()[key] = value;
  }
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
