import { NextResponse, type NextRequest } from "next/server";
import { getAgentsConfig } from "@/lib/agents/claude";
import { getIntegrationsOverview } from "@/lib/integrations/config";
import { probeTidyCalConnection } from "@/lib/integrations/tidycal";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const servedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const overview = getIntegrationsOverview(servedHost);
  const tidycalProbe = await probeTidyCalConnection();
  const agents = getAgentsConfig();

  return NextResponse.json({
    ...overview,
    tidycal: {
      ...overview.tidycal,
      live: tidycalProbe,
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
