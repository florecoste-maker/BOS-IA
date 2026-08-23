import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json({
    learners: store.getLearners(),
    sessions: store.getSessions(),
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    id: string;
    action: "status" | "validate" | "proof_to_cash";
    status?: Parameters<typeof store.updateLearnerStatus>[1];
    score?: number;
  };

  if (body.action === "status" && body.status) {
    const learner = store.updateLearnerStatus(body.id, body.status);
    if (!learner) {
      return NextResponse.json({ error: "Apprenant introuvable" }, { status: 404 });
    }
    return NextResponse.json({ learner });
  }

  if (body.action === "validate") {
    const learner = store.validateComprehension(body.id, body.score ?? 0);
    if (!learner) {
      return NextResponse.json({ error: "Apprenant introuvable" }, { status: 404 });
    }
    return NextResponse.json({ learner });
  }

  if (body.action === "proof_to_cash") {
    const result = store.emitProofToCash(body.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Action invalide" }, { status: 400 });
}
