/**
 * Copie `public/` et `.next/static/` dans `.next/standalone/`.
 * Le serveur autonome (`server.js`) ne les inclut pas par défaut :
 * sans cette copie, CSS, JS client et images répondent 404 en production.
 */
import { cpSync, existsSync } from "node:fs";

const standalone = ".next/standalone";

if (!existsSync(standalone)) {
  console.error(`${standalone} introuvable : vérifiez output: "standalone" dans next.config.mjs.`);
  process.exit(1);
}

cpSync("public", `${standalone}/public`, { recursive: true });
cpSync(".next/static", `${standalone}/.next/static`, { recursive: true });
console.log("Assets copiés dans .next/standalone (public + .next/static).");
