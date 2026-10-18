import { NextResponse } from "next/server";
import { getIntegrationsOverview } from "@/lib/integrations/config";
import { probeTidyCalConnection } from "@/lib/integrations/tidycal";

export const dynamic = "force-dynamic";

export async function GET() {
  const overview = getIntegrationsOverview();
  const tidycalProbe = await probeTidyCalConnection();

  return NextResponse.json({
    ...overview,
    tidycal: {
      ...overview.tidycal,
      live: tidycalProbe,
    },
  });
}
