/**
 * Connexion à la base MySQL / MariaDB (hPanel → Bases de données).
 * Lue à l'exécution : ajouter les variables dans hPanel puis redémarrer suffit.
 * Sans configuration, le cockpit reste en mode démonstration (données en mémoire).
 */
import { homedir } from "node:os";
import { join } from "node:path";

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

type Env = Record<string, string | undefined>;

function readEnv(name: string, env: Env = process.env): string | null {
  const v = env[name]?.trim();
  return v ? v : null;
}

/**
 * `DATABASE_URL` (mysql://user:mdp@hôte:3306/base) ou les variables DB_* séparées.
 * `env` permet d'évaluer des réglages candidats avant de les enregistrer.
 */
export function getDatabaseConfig(env: Env = process.env): DatabaseConfig | null {
  const url = readEnv("DATABASE_URL", env);
  if (url) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== "mysql:" && parsed.protocol !== "mariadb:") return null;
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (!parsed.hostname || !parsed.username || !database) return null;
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database,
    };
  }

  const host = readEnv("DB_HOST", env);
  const user = readEnv("DB_USER", env);
  const database = readEnv("DB_NAME", env);
  if (!host || !user || !database) return null;
  return {
    host,
    port: Number(readEnv("DB_PORT", env)) || 3306,
    user,
    password: env.DB_PASSWORD ?? "",
    database,
  };
}

export type DatabaseEngine = "sqlite" | "mysql";

/**
 * Moteur choisi : `BOS_DB_ENGINE=sqlite` dans hPanel → base SQLite intégrée
 * (un fichier sur le serveur, sans mot de passe), prioritaire sur MySQL.
 * Sinon MySQL dès que ses variables sont présentes, sinon démonstration.
 */
export function getDatabaseEngine(env: Env = process.env): DatabaseEngine | null {
  if (readEnv("BOS_DB_ENGINE", env)?.toLowerCase() === "sqlite") return "sqlite";
  return getDatabaseConfig(env) ? "mysql" : null;
}

/**
 * Emplacement du fichier SQLite : `BOS_SQLITE_PATH`, sinon `~/bos-data/bos-ia.sqlite`,
 * c'est-à-dire HORS du dossier de l'application, qu'un redéploiement remplace.
 */
export function getSqlitePath(env: Env = process.env): string {
  return readEnv("BOS_SQLITE_PATH", env) ?? join(homedir(), "bos-data", "bos-ia.sqlite");
}

export function isDatabaseConfigured() {
  return getDatabaseEngine() !== null;
}
