/**
 * Diagnostic du chargement des variables en production (GET /api/health?diagnostic=1).
 * Ne renvoie que des noms, des indicateurs et des comptes : jamais une valeur.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describeEnvFiles, loadedEnvFiles } from "@/lib/env-files";

/** Noms proches des réglages attendus (casse, espaces, préfixes) pour repérer une faute de frappe. */
const RELEVANT = /bos|admin_?pass|session_?secret|cron_?secret|^\s*(db|smtp|tidycal|anthropic)_|database_?url/i;

/** Indices du mode de lancement chez l'hébergeur (noms seulement). */
const RUNTIME_HINTS = /^(PASSENGER|LSNODE|LSAPI|PM2|pm_|npm_lifecycle_event|npm_package_name|HOSTINGER|NODE_APP|PHUSION)/i;

function anonymize(p: string) {
  return p.replace(/^\/home\/[^/]+/, "~");
}

function envFiles(dir: string) {
  try {
    return readdirSync(dir).filter((f) => f.startsWith(".env"));
  } catch {
    return null;
  }
}

/** Noms définis dans un fichier .env (avant le `=`), sans les valeurs. */
function envFileKeys(file: string) {
  try {
    return readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.match(/^\s*(?:export\s+)?([^#=\s][^=]*?)\s*=/)?.[1])
      .filter((k): k is string => Boolean(k));
  } catch {
    return null;
  }
}

export function getEnvDiagnostic() {
  const cwd = process.cwd();
  const root = path.basename(cwd) === "standalone" ? path.resolve(cwd, "../..") : cwd;
  // Hostinger (LiteSpeed lsnode) exécute directement le contenu du standalone, copié ailleurs.
  const standalone = existsSync(path.join(cwd, "build-env.json")) ? cwd : path.join(root, ".next", "standalone");

  const variables = Object.keys(process.env)
    .filter((k) => RELEVANT.test(k))
    .sort()
    .map((nom) => ({ nom, rempli: Boolean(process.env[nom]?.trim()) }));

  let build: unknown = null;
  try {
    build = JSON.parse(readFileSync(path.join(standalone, "build-env.json"), "utf8"));
  } catch {
    build = null;
  }

  return {
    processus: {
      entree: process.argv[1] ? anonymize(process.argv[1]) : null,
      repertoire: anonymize(cwd),
      node: process.version,
      demarre_il_y_a_s: Math.round(process.uptime()),
      fichier_demarrage: process.env.LSNODE_STARTUP_FILE ? anonymize(process.env.LSNODE_STARTUP_FILE) : null,
      nb_variables: Object.keys(process.env).length,
      lancement: Object.keys(process.env).filter((k) => RUNTIME_HINTS.test(k)).sort(),
    },
    variables,
    fichiers_env: {
      bos_ia_env_charges: loadedEnvFiles().map(anonymize),
      bos_ia_env_trouves: describeEnvFiles(anonymize),
      racine: envFiles(root),
      standalone: envFiles(standalone),
      noms_dans_env_standalone: existsSync(path.join(standalone, ".env.production.local"))
        ? envFileKeys(path.join(standalone, ".env.production.local"))
        : null,
    },
    build,
  };
}
