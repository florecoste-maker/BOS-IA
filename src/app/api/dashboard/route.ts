import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const repo = await getRepository();
  const [metrics, sessions, learners, dossiers, invoices, agents] = await Promise.all([
    repo.getMetrics(),
    repo.getSessions(),
    repo.getLearners(),
    repo.getOpcoDossiers(),
    repo.getInvoices(),
    repo.getAgents(),
  ]);
  return NextResponse.json({
    mode: repo.mode,
    metrics,
    pillars: {
      lms: { sessions: sessions.length, learners: learners.length },
      erp: { dossiers: dossiers.length, invoices: invoices.length },
      nexus: { agents: agents.length, hitl: metrics.actionsHitl },
    },
  });
}
