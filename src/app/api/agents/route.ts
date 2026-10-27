import { NextResponse } from "next/server";
import { ActionError, decideAction, retryAction, withRecipients } from "@/lib/actions/execute";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const repo = await getRepository();
  const [agents, actions] = await Promise.all([repo.getAgents(), repo.getAgentActions()]);
  return NextResponse.json({ agents, actions: await withRecipients(repo, actions) });
}

/**
 * Décision HITL : `approved` (avec objet / corps éventuellement modifiés) envoie
 * l'e-mail aussitôt ; `rejected` l'écarte ; `renvoyer` retente après un échec.
 */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    actionId?: string;
    decision?: "approved" | "rejected" | "renvoyer";
    objet?: string;
    corps?: string;
  };
  if (!body.actionId || !["approved", "rejected", "renvoyer"].includes(body.decision ?? "")) {
    return NextResponse.json({ error: "actionId et décision requis" }, { status: 400 });
  }

  const repo = await getRepository();
  try {
    if (body.decision === "renvoyer") {
      await retryAction(repo, body.actionId);
    } else {
      await decideAction(repo, body.actionId, body.decision!, {
        objet: typeof body.objet === "string" ? body.objet : undefined,
        corps: typeof body.corps === "string" ? body.corps : undefined,
      });
    }
  } catch (error) {
    if (error instanceof ActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const [agents, actions] = await Promise.all([repo.getAgents(), repo.getAgentActions()]);
  const enriched = await withRecipients(repo, actions);
  return NextResponse.json({
    action: enriched.find((a) => a.id === body.actionId),
    agents,
    actions: enriched,
  });
}
