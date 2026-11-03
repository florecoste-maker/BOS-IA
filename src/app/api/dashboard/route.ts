import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const repo = await getRepository();
  const [metrics, clients, missions, invoices, payments, agents] = await Promise.all([
    repo.getMetrics(),
    repo.getClients(),
    repo.getMissions(),
    repo.getInvoices(),
    repo.getPayments(),
    repo.getAgents(),
  ]);
  return NextResponse.json({
    mode: repo.mode,
    metrics,
    totaux: {
      clients: clients.length,
      missions: missions.length,
      factures: invoices.length,
      paiements: payments.length,
      agents: agents.length,
      hitl: metrics.actionsHitl,
    },
  });
}
