import { NextResponse } from "next/server";
import { ActionError, decideAction, retryAction, withRecipients } from "@/lib/actions/execute";
import { audit } from "@/lib/audit";
import { getRepository } from "@/lib/data";
import { getActor } from "@/lib/session";

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
    valeur?: string;
  };
  if (!body.actionId || !["approved", "rejected", "renvoyer"].includes(body.decision ?? "")) {
    return NextResponse.json({ error: "actionId et décision requis" }, { status: 400 });
  }

  const repo = await getRepository();
  const actor = await getActor();
  try {
    if (body.decision === "renvoyer") {
      const execution = await retryAction(repo, body.actionId);
      await audit(actor, "email_renvoye", body.actionId, {
        details: { envoi: execution.statut, message: execution.message },
        request,
      });
    } else {
      const action = await decideAction(
        repo,
        body.actionId,
        body.decision!,
        {
          objet: typeof body.objet === "string" ? body.objet : undefined,
          corps: typeof body.corps === "string" ? body.corps : undefined,
          valeur: typeof body.valeur === "string" ? body.valeur : undefined,
        },
        actor?.nom,
      );
      await audit(
        actor,
        body.decision === "approved" ? "hitl_approuve" : "hitl_refuse",
        action.email
          ? `E-mail « ${action.email.objet} »`
          : action.operation
            ? `${action.operation.type} ${action.operation.refId} → ${action.operation.valeur}`
            : action.type,
        {
          details: {
            action: action.id,
            agent: action.agentId,
            ...(action.operation ? { operation: action.operation } : {}),
            ...(action.execution ? { envoi: action.execution.statut, message: action.execution.message } : {}),
          },
          request,
        },
      );
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
