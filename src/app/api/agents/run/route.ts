import { NextResponse } from "next/server";
import { withRecipients } from "@/lib/actions/execute";
import { AgentRunError, runAgent } from "@/lib/agents/claude";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { agentId?: string };
  if (!body.agentId) {
    return NextResponse.json({ error: "agentId requis" }, { status: 400 });
  }

  try {
    const run = await runAgent(body.agentId);
    const repo = await getRepository();
    return NextResponse.json({
      run,
      agents: await repo.getAgents(),
      actions: await withRecipients(repo, await repo.getAgentActions()),
    });
  } catch (error) {
    if (error instanceof AgentRunError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Exécution agent échouée", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
