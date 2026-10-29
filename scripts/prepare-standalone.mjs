/**
 * Copie `public/` et `.next/static/` dans `.next/standalone/`.
 * Le serveur autonome (`server.js`) ne les inclut pas par défaut :
 * sans cette copie, CSS, JS client et images répondent 404 en production.
 *
 * Écrit aussi `.next/standalone/.env.production.local` avec les variables de
 * l'application connues au build (hPanel, `.env` de la racine). Hostinger peut
 * ne les fournir qu'au build, ou lancer directement le serveur autonome, qui ne
 * lit que les `.env` de son dossier : sans ce fichier, le cockpit reste fermé.
 * Les variables présentes au démarrage restent prioritaires.
 */
import { cpSync, existsSync, writeFileSync } from "node:fs";
import nextEnv from "@next/env";

const standalone = ".next/standalone";

if (!existsSync(standalone)) {
  console.error(`${standalone} introuvable : vérifiez output: "standalone" dans next.config.mjs.`);
  process.exit(1);
}

cpSync("public", `${standalone}/public`, { recursive: true });
cpSync(".next/static", `${standalone}/.next/static`, { recursive: true });
console.log("Assets copiés dans .next/standalone (public + .next/static).");

/** Variables lues par l'application (NEXT_PUBLIC_* est déjà figé dans le build). */
const APP_ENV = /^(BOS_|DB_|DATABASE_URL$|SMTP_|ANTHROPIC_API_KEY$|TIDYCAL_)/;

/** Valeur lue telle quelle par @next/env : `$` échappé (sinon interpolé), guillemets libres. */
function quote(value) {
  const escaped = value.replaceAll("$", "\\$");
  const q = ['"', "'", "`"].find((c) => !value.includes(c));
  return q ? `${q}${escaped}${q}` : null;
}

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error: console.error });

const lines = [];
const skipped = [];
for (const [key, value] of Object.entries(process.env)) {
  if (!APP_ENV.test(key) || !value?.trim()) continue;
  const quoted = value.includes("\n") ? null : quote(value);
  if (quoted) lines.push(`${key}=${quoted}`);
  else skipped.push(key);
}

writeFileSync(`${standalone}/.env.production.local`, `${lines.join("\n")}\n`, { mode: 0o600 });
// Trace du build pour /api/health?diagnostic=1 : noms et comptes, aucune valeur.
writeFileSync(
  `${standalone}/build-env.json`,
  JSON.stringify({
    date: new Date().toISOString(),
    nb_variables: Object.keys(process.env).length,
    reprises: lines.map((l) => l.split("=")[0]),
    proches: Object.keys(process.env).filter((k) => /bos|admin_?pass|session_?secret|cron_?secret/i.test(k)).sort(),
  }),
);
console.log(
  `Variables reprises pour le démarrage : ${lines.map((l) => l.split("=")[0]).join(", ") || "aucune"}.`,
);
if (skipped.length) console.warn(`Variables ignorées (valeur sur plusieurs lignes ou guillemets mixtes) : ${skipped.join(", ")}`);
