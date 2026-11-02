/**
 * Test de connexion MySQL / MariaDB avant d'enregistrer des réglages : une base
 * injoignable ou des identifiants faux ne doivent jamais faire tomber le
 * cockpit, qui reste alors sur sa configuration précédente.
 */
import mysql from "mysql2/promise";
import { getDatabaseConfig, type DatabaseConfig } from "./config";

export type ConnectionTest = { ok: true } | { ok: false; erreur: string };

export async function testDatabaseConnection(config: DatabaseConfig, timeoutMs = 10_000): Promise<ConnectionTest> {
  let connection: mysql.Connection | null = null;
  try {
    connection = await mysql.createConnection({ ...config, connectTimeout: timeoutMs });
    await connection.query("SELECT 1");
    return { ok: true };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return { ok: false, erreur: [e.code, e.message].filter(Boolean).join(" : ") || "Connexion impossible" };
  } finally {
    await connection?.end().catch(() => {});
  }
}

const DB_KEY = /^(DB_[A-Z]+|DATABASE_URL)$/;

/** Hôtes essayés quand DB_HOST n'est pas fourni : la base Hostinger est sur le même serveur. */
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

export type DatabaseReport =
  | { statut: "non_configuree" }
  | { statut: "connectee"; hote: string }
  | { statut: "refusee" | "injoignable"; erreur: string };

/**
 * Réglages de base transmis (`values`, modifié sur place) : testés avant tout
 * enregistrement. En cas d'échec, ils sont retirés de `values` et le cockpit
 * garde sa configuration actuelle. Sans réglage transmis, teste la base en place.
 */
export async function checkDatabase(
  values: Record<string, string>,
  test: (config: DatabaseConfig) => Promise<ConnectionTest> = testDatabaseConnection,
  env: Record<string, string | undefined> = process.env,
): Promise<DatabaseReport> {
  const incoming = Object.fromEntries(Object.entries(values).filter(([k]) => DB_KEY.test(k)));
  if (!Object.keys(incoming).length) {
    const current = getDatabaseConfig(env);
    if (!current) return { statut: "non_configuree" };
    const result = await test(current);
    return result.ok ? { statut: "connectee", hote: current.host } : { statut: "injoignable", erreur: result.erreur };
  }

  for (const key of Object.keys(incoming)) delete values[key];
  const base = { ...env, ...incoming };
  const hosts = incoming.DB_HOST || incoming.DATABASE_URL ? [null] : LOCAL_HOSTS;
  let erreur = "Réglages incomplets : DB_NAME, DB_USER et DB_PASSWORD sont nécessaires";
  for (const host of hosts) {
    const config = getDatabaseConfig(host ? { ...base, DB_HOST: host } : base);
    if (!config) continue;
    const result = await test(config);
    if (result.ok) {
      Object.assign(values, incoming, host ? { DB_HOST: host } : {});
      return { statut: "connectee", hote: config.host };
    }
    erreur = result.erreur;
  }
  return { statut: "refusee", erreur };
}
