import { NextResponse, after } from "next/server";
import { getAgentsConfig, runAgent } from "@/lib/agents/claude";
import {
  MIN_CRON_SECRET_LENGTH,
  buildPlan,
  executeScheduledRun,
  getScheduleConfig,
  isCronAuthorized,
} from "@/lib/agents/schedule";
import { getRepository } from "@/lib/data";
import { isDatabaseConfigured } from "@/lib/db/config";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * Déclencheur des agents planifiés, appelé par un planificateur externe :
 *   curl -X POST -H "Authorization: Bearer $BOS_CRON_SECRET" https://app.jamaliance.com/api/agents/planifie
 * Répond tout de suite (202) et analyse en arrière-plan ; `?attendre=1` attend la fin.
 * Route publique côté proxy : seul le secret l'autorise.
 */
export async function POST(request: Request) {
  const config = getScheduleConfig();
  if (!config.configured) {
    return NextResponse.json(
      {
        error: config.secretTooShort
          ? `BOS_CRON_SECRET trop court (${MIN_CRON_SECRET_LENGTH} caractères minimum)`
          : "Agents planifiés non configurés : ajoutez BOS_CRON_SECRET dans hPanel",
      },
      { status: 503 },
    );
  }
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Agents planifiés indisponibles en mode démonstration : connectez la base MySQL" },
      { status: 409 },
    );
  }
  if (!getAgentsConfig().configured) {
    return NextResponse.json(
      { error: "Agents IA non connectés : ajoutez ANTHROPIC_API_KEY dans hPanel" },
      { status: 503 },
    );
  }

  const repo = await getRepository();
  const execute = () => executeScheduledRun(repo, (agentId) => runAgent(agentId, "planifie"));

  if (new URL(request.url).searchParams.get("attendre") === "1") {
    const results = await execute();
    if (!results) {
      return NextResponse.json({ error: "Exécution planifiée déjà en cours" }, { status: 409 });
    }
    return NextResponse.json({ results });
  }

  const plan = await buildPlan(repo);
  after(async () => {
    try {
      const results = await execute();
      if (!results) console.warn("Agents planifiés : exécution déjà en cours, appel ignoré");
    } catch (error) {
      console.error("Agents planifiés : échec de l'exécution", error);
    }
  });
  return NextResponse.json({ status: "lancé", plan }, { status: 202 });
}
