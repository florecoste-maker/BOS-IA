import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json({
    metrics: store.getMetrics(),
    pillars: {
      lms: {
        sessions: store.getSessions().length,
        learners: store.getLearners().length,
      },
      erp: {
        dossiers: store.getOpcoDossiers().length,
        invoices: store.getInvoices().length,
      },
      nexus: {
        agents: store.getAgents().length,
        hitl: store.getMetrics().actionsHitl,
      },
    },
  });
}
