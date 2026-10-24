import { NextResponse } from "next/server";
import { AgentRunError, runAgent } from "@/lib/agents/claude";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { agentId?: string };
  if (!body.agentId) {
    return NextResponse.json({ error: "agentId requis" }, { status: 400 });
  }

  try {
    const run = await runAgent(body.agentId);
    return NextResponse.json({
      run,
      agents: store.getAgents(),
      actions: store.getAgentActions(),
    });
  } catch (error) {
    if (error instanceof AgentRunError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Exécution agent échouée", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
