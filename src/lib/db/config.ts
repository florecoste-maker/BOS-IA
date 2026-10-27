/**
 * Connexion à la base MySQL / MariaDB (hPanel → Bases de données).
 * Lue à l'exécution : ajouter les variables dans hPanel puis redémarrer suffit.
 * Sans configuration, le cockpit reste en mode démonstration (données en mémoire).
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function readEnv(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

/** `DATABASE_URL` (mysql://user:mdp@hôte:3306/base) ou les variables DB_* séparées. */
export function getDatabaseConfig(): DatabaseConfig | null {
  const url = readEnv("DATABASE_URL");
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

  const host = readEnv("DB_HOST");
  const user = readEnv("DB_USER");
  const database = readEnv("DB_NAME");
  if (!host || !user || !database) return null;
  return {
    host,
    port: Number(readEnv("DB_PORT")) || 3306,
    user,
    password: process.env.DB_PASSWORD ?? "",
    database,
  };
}

export function isDatabaseConfigured() {
  return getDatabaseConfig() !== null;
}
