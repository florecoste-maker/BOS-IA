import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { MANUAL_INVOICE_STATUSES, checkInvoice, checkPayment } from "@/lib/business";
import { getRepository } from "@/lib/data";
import { getActor } from "@/lib/session";
import type { InvoiceStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Factures et paiements. */
export async function GET() {
  const repo = await getRepository();
  const [invoices, payments] = await Promise.all([repo.getInvoices(), repo.getPayments()]);
  return NextResponse.json({ invoices, payments });
}

/**
 * `{ action: "facture", ... }` : nouvelle facture ;
 * `{ action: "paiement", factureId, montant, date, mode }` : paiement reçu.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const repo = await getRepository();
  const actor = await getActor();

  if (body.action === "facture") {
    const checked = checkInvoice(body);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const result = await repo.createInvoice(checked.value);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const invoice = result.value;
    await audit(actor, "facture_creee", `${invoice.numero} (${invoice.client})`, {
      details: { montantHT: invoice.montantHT, tva: invoice.tauxTva, statut: invoice.status },
      request,
    });
    return NextResponse.json({ invoice });
  }

  if (body.action === "paiement") {
    const checked = checkPayment(body);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const result = await repo.recordPayment(checked.value);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const { payment, invoice } = result.value;
    await audit(actor, "paiement", `${payment.numero} → ${invoice.numero}`, {
      details: { montant: payment.montant, date: payment.date, mode: payment.mode, statut: invoice.status },
      request,
    });
    return NextResponse.json(result.value);
  }

  return NextResponse.json({ error: "Action invalide" }, { status: 400 });
}

/** Statut choisi à la main : `{ invoiceId, status }` (émise, relance, impayée, annulée, brouillon). */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { invoiceId?: unknown; status?: unknown };
  if (typeof body.invoiceId !== "string") return NextResponse.json({ error: "Facture manquante" }, { status: 400 });
  if (!(MANUAL_INVOICE_STATUSES as readonly unknown[]).includes(body.status)) {
    return NextResponse.json({ error: "Statut non modifiable à la main" }, { status: 400 });
  }
  const result = await (await getRepository()).updateInvoiceStatus(body.invoiceId, body.status as InvoiceStatus);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await audit(await getActor(), "facture_statut", result.value.numero, { details: { statut: body.status }, request });
  return NextResponse.json({ invoice: result.value });
}
