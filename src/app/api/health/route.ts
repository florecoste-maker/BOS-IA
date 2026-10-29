import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/agents/schedule";
import { getAuthConfig } from "@/lib/auth";
import { runHealthChecks } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * Sonde publique de déploiement (aucune donnée métier ni secret).
 * `?complet=1` avec `Authorization: Bearer $BOS_CRON_SECRET` : bilan de chaque
 * service, 503 si l'un est en erreur (le planificateur GitHub passe au rouge).
 */
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("complet") !== "1") {
    // `acces` : le cockpit voit ses deux réglages (aucune valeur exposée).
    return NextResponse.json({ ok: true, service: "bos-ia", acces: getAuthConfig().configured });
  }
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }
  const health = await runHealthChecks();
  return NextResponse.json({ service: "bos-ia", ...health }, { status: health.ok ? 200 : 503 });
}
