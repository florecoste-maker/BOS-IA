import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getRepository } from "@/lib/data";
import { getActor } from "@/lib/session";
import type { LearnerStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const repo = await getRepository();
  const [learners, sessions] = await Promise.all([repo.getLearners(), repo.getSessions()]);
  return NextResponse.json({ learners, sessions });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    id: string;
    action: "status" | "validate" | "proof_to_cash";
    status?: LearnerStatus;
    score?: number;
  };
  const repo = await getRepository();
  const actor = await getActor();

  if (body.action === "status" && body.status) {
    const learner = await repo.updateLearnerStatus(body.id, body.status);
    if (!learner) {
      return NextResponse.json({ error: "Apprenant introuvable" }, { status: 404 });
    }
    await audit(actor, "apprenant_statut", `${learner.prenom} ${learner.nom}`, {
      details: { statut: body.status },
      request,
    });
    return NextResponse.json({ learner });
  }

  if (body.action === "validate") {
    const learner = await repo.validateComprehension(body.id, body.score ?? 0);
    if (!learner) {
      return NextResponse.json({ error: "Apprenant introuvable" }, { status: 404 });
    }
    await audit(actor, "apprenant_validation", `${learner.prenom} ${learner.nom}`, {
      details: { score: body.score ?? 0 },
      request,
    });
    return NextResponse.json({ learner });
  }

  if (body.action === "proof_to_cash") {
    const result = await repo.emitProofToCash(body.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    await audit(actor, "proof_to_cash", result.invoice.numero, { details: { apprenant: body.id }, request });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Action invalide" }, { status: 400 });
}
