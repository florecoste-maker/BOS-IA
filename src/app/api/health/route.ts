import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/agents/schedule";
import { getAuthConfig } from "@/lib/auth";
import { getEnvDiagnostic } from "@/lib/env-diagnostic";
import { retryPersistentEnv } from "@/lib/env-files";
import { runHealthChecks } from "@/lib/health";
import { AgentRunError, runAgent } from "@/lib/agents/claude";
import { getRepository } from "@/lib/data";
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
  // Test réel d'une analyse IA (crédit, modèle, réponse structurée) : `&test_ia=1`, sur demande seulement
  // (une analyse consomme du crédit Anthropic). Résultat inclus dans le bilan, sans donnée client.
  if (params.get("test_ia") === "1") {
    return NextResponse.json({ service: "bos-ia", test_ia: await testAnalyseIa() }, { headers: { "Cache-Control": "no-store" } });
  }
  const health = await runHealthChecks();
  // `connexions` : dernière tentative et dernier retour sur le cockpit (ce processus), sans secret.
  return NextResponse.json({ service: "bos-ia", ...health, connexions: loginTrace() }, { status: health.ok ? 200 : 503 });
}

/** Lance une vraie analyse du premier agent (55 s au plus pour répondre ; elle continue au-delà). */
async function testAnalyseIa() {
  const agent = (await (await getRepository()).getAgents())[0];
  if (!agent) return { ok: false, message: "Aucun agent enregistré" };
  const debut = Date.now();
  const analyse = runAgent(agent.id)
    .then((run) => ({
      ok: true,
      agent: agent.nom,
      modele: run?.model ?? null,
      actions: run?.actions.length ?? 0,
      resume: run?.resume ?? "",
    }))
    .catch((error: unknown) => ({
      ok: false,
      agent: agent.nom,
      message: error instanceof AgentRunError ? error.message : "Erreur interne",
    }));
  const delai = new Promise<{ ok: null; agent: string; message: string }>((resolve) =>
    setTimeout(
      () => resolve({ ok: null, agent: agent.nom, message: "Analyse toujours en cours après 55 s : résultat dans « Analyses IA récentes » au prochain bilan" }),
      55_000,
    ),
  );
  const resultat = await Promise.race([analyse, delai]);
  return { ...resultat, duree_s: Math.round((Date.now() - debut) / 1000) };
}
