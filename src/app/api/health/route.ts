import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/agents/schedule";
import { getAuthConfig } from "@/lib/auth";
import { getEnvDiagnostic } from "@/lib/env-diagnostic";
import { retryPersistentEnv } from "@/lib/env-files";
import { runHealthChecks } from "@/lib/health";
import { loginTrace } from "@/lib/login-trace";

export const dynamic = "force-dynamic";

/**
 * Sonde publique de déploiement (aucune donnée métier ni secret).
 * `?diagnostic=1` : chargement des variables en production (noms seulement).
 * `?complet=1` avec `Authorization: Bearer $BOS_CRON_SECRET` : bilan de chaque
 * service, 503 si l'un est en erreur (le planificateur GitHub passe au rouge).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!getAuthConfig().configured) retryPersistentEnv();
  if (params.get("diagnostic") === "1") {
    // Noms et indicateurs uniquement : jamais la valeur d'une variable.
    // `problemes` : noms des réglages en cause et seuils, jamais leur valeur.
    const auth = getAuthConfig();
    return NextResponse.json({ service: "bos-ia", acces: auth.configured, problemes: auth.problems, ...getEnvDiagnostic() });
  }
  if (params.get("complet") !== "1") {
    // `acces` : le cockpit voit ses deux réglages (aucune valeur exposée).
    return NextResponse.json({ ok: true, service: "bos-ia", acces: getAuthConfig().configured });
  }
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }
  const health = await runHealthChecks();
  // `connexions` : dernière tentative et dernier retour sur le cockpit (ce processus), sans secret.
  return NextResponse.json({ service: "bos-ia", ...health, connexions: loginTrace() }, { status: health.ok ? 200 : 503 });
}
