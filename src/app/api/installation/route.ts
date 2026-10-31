import { NextResponse } from "next/server";
import { getAuthConfig } from "@/lib/auth";
import { checkDatabase } from "@/lib/db/connection-test";
import { ensureSessionSecret, loadPersistentEnv, writeEnvVariables } from "@/lib/env-files";
import { issueInstallationCode } from "@/lib/installation/code";
import { verifyGithubToken } from "@/lib/installation/github-oidc";

export const dynamic = "force-dynamic";

/**
 * Réglages que le workflow peut transmettre depuis les secrets du dépôt GitHub.
 * Jamais BOS_ADMIN_PASSWORD (choisi sur /installation) ni BOS_SESSION_SECRET
 * (généré par le serveur).
 */
const TRANSMISSIBLES = new Set([
  "BOS_CRON_SECRET",
  "ANTHROPIC_API_KEY",
  "BOS_AGENTS_MODEL",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DATABASE_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "SMTP_SECURE",
  "BOS_ALERTES_EMAIL",
  "TIDYCAL_API_TOKEN",
  "TIDYCAL_BOOKING_TYPE_ID",
]);

/**
 * Appelé par le workflow GitHub « Installation du cockpit » (jeton OIDC de
 * GitHub, aucun secret partagé). Enregistre les secrets transmis dans
 * `bos-ia.env` et, tant que le mot de passe administrateur n'existe pas,
 * renvoie un code d'installation à usage unique. Réponse : noms seulement.
 */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Jeton GitHub absent" }, { status: 401 });
  try {
    await verifyGithubToken(token);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Jeton refusé" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { variables?: Record<string, unknown> };
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.variables ?? {})) {
    if (TRANSMISSIBLES.has(key) && typeof value === "string" && value.trim()) values[key] = value.trim();
  }

  loadPersistentEnv();
  const baseDeDonnees = await checkDatabase(values);
  try {
    if (Object.keys(values).length) writeEnvVariables(values);
    ensureSessionSecret();
  } catch (error) {
    return NextResponse.json(
      { error: `Écriture impossible sur le serveur : ${error instanceof Error ? error.message : error}` },
      { status: 500 },
    );
  }

  const auth = getAuthConfig();
  const installer = !auth.password;
  return NextResponse.json({
    service: "bos-ia",
    variables_enregistrees: Object.keys(values).sort(),
    base_de_donnees: baseDeDonnees,
    acces: auth.configured,
    problemes: auth.problems,
    ...(installer ? { code: issueInstallationCode() } : {}),
  });
}
