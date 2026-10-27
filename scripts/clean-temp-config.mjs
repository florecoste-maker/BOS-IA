/**
 * Supprime les fichiers temporaires `<nombre>.next.config.ts` (par exemple
 * `6ad9277318021.next.config.ts`) laissés à la racine par un build échoué
 * quand la config était encore en TypeScript. S'ils restent dans le dossier
 * de build Hostinger, ils perturbent le chargement de la configuration.
 */
import { readdirSync, rmSync } from "node:fs";

for (const name of readdirSync(".")) {
  if (/^[0-9a-z]+\.next\.config\.[cm]?ts$/i.test(name)) {
    rmSync(name, { force: true });
    console.log(`Fichier temporaire supprimé : ${name}`);
  }
}
