/**
 * Variables de BOS-IA lues dans un fichier persistant `bos-ia.env`.
 *
 * Sur Hostinger, l'application est lancée par LiteSpeed (lsnode) depuis un
 * dossier recréé à chaque déploiement (`hbuilds/versions/<id>/nodejs`), et le
 * processus ne reçoit pas les variables saisies dans hPanel. Le fichier est
 * cherché dans ce dossier puis dans chacun de ses parents (par exemple
 * `~/bos-ia.env`) : il survit aux déploiements et n'est jamais servi au web.
 * Les variables déjà présentes dans le processus restent prioritaires.
 */
import { existsSync } from "node:fs";
import path from "node:path";

export const ENV_FILE_NAME = "bos-ia.env";

/** Chemins des fichiers chargés (pour le diagnostic, jamais leur contenu), partagés entre bundles. */
const registry = globalThis as typeof globalThis & { __bosEnvFiles?: string[] };

export function loadedEnvFiles() {
  return registry.__bosEnvFiles ?? [];
}

export function loadPersistentEnv(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    const file = path.join(dir, ENV_FILE_NAME);
    if (existsSync(file)) {
      try {
        // Lecture littérale (pas d'interpolation de `$`), sans écraser l'existant.
        process.loadEnvFile(file);
        registry.__bosEnvFiles = [...loadedEnvFiles(), file];
      } catch (error) {
        console.error(`Lecture impossible de ${file} :`, error instanceof Error ? error.message : error);
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
