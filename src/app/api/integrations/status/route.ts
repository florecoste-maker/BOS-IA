import { NextResponse, type NextRequest } from "next/server";
import { getAgentsConfig } from "@/lib/agents/claude";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getIntegrationsOverview } from "@/lib/integrations/config";
import { probeTidyCalConnection } from "@/lib/integrations/tidycal";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const servedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const overview = getIntegrationsOverview(servedHost);
  const tidycalProbe = await probeTidyCalConnection();
  const agents = getAgentsConfig();
  const dbProbe = isDatabaseConfigured()
    ? await (await import("@/lib/db/mysql")).probeDatabase()
    : null;

  return NextResponse.json({
    ...overview,
    tidycal: {
      ...overview.tidycal,
      live: tidycalProbe,
    },
    database: {
      status: !dbProbe ? "missing" : dbProbe.ok ? "configured" : "partial",
      mode: dbProbe ? "mysql" : "demo",
      message: !dbProbe
        ? "Mode démonstration : données fictives en mémoire"
        : dbProbe.ok
          ? "MySQL connecté : données persistantes"
          : dbProbe.message,
      needsFromUser: !dbProbe
        ? [
            "Base MySQL (hPanel → Bases de données) puis DB_HOST, DB_NAME, DB_USER, DB_PASSWORD (ou DATABASE_URL)",
          ]
        : dbProbe.ok
          ? []
          : ["Vérifier l'hôte, le nom de la base, l'utilisateur et le mot de passe dans hPanel"],
    },
    agentsIa: {
      status: agents.configured ? "configured" : "missing",
      model: agents.model,
      needsFromUser: agents.configured
        ? []
        : ["Clé API Claude (ANTHROPIC_API_KEY) — console.anthropic.com → API Keys"],
    },
  });
}
