import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json({
    agents: store.getAgents(),
    actions: store.getAgentActions(),
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    actionId: string;
    decision: "approved" | "rejected";
  };

  const action = store.resolveHitl(body.actionId, body.decision);
  if (!action) {
    return NextResponse.json({ error: "Action introuvable" }, { status: 404 });
  }
  return NextResponse.json({
    action,
    agents: store.getAgents(),
    actions: store.getAgentActions(),
  });
}
