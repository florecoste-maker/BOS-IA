import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const repo = await getRepository();
  const [agents, actions] = await Promise.all([repo.getAgents(), repo.getAgentActions()]);
  return NextResponse.json({ agents, actions });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    actionId: string;
    decision: "approved" | "rejected";
  };

  const repo = await getRepository();
  const action = await repo.resolveHitl(body.actionId, body.decision);
  if (!action) {
    return NextResponse.json({ error: "Action introuvable" }, { status: 404 });
  }
  return NextResponse.json({
    action,
    agents: await repo.getAgents(),
    actions: await repo.getAgentActions(),
  });
}
