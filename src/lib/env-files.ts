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
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

export const ENV_FILE_NAME = "bos-ia.env";

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
    if (isPublic || loadedEnvFiles().includes(file)) continue;
    try {
      for (const [key, value] of Object.entries(readEnvFile(file))) {
        if (!process.env[key]?.trim()) process.env[key] = value;
      }
      registry.__bosEnvFiles = [...loadedEnvFiles(), file];
    } catch (error) {
      console.error(`Lecture impossible de ${file} :`, error instanceof Error ? error.message : error);
    }
  }
}

/** Appelé quand l'accès n'est pas configuré : prend en compte un fichier créé après le démarrage. */
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
