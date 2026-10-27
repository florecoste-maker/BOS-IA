import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getRepository } from "@/lib/data";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const repo = await getRepository();
  const [dossiers, invoices] = await Promise.all([repo.getOpcoDossiers(), repo.getInvoices()]);
  return NextResponse.json({ dossiers, invoices });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    dossierId?: string;
    invoiceId?: string;
    action?: "complete" | "payee";
    payeeLe?: string;
  };

  if (body.action === "payee" && body.invoiceId) {
    const today = new Date().toISOString().slice(0, 10);
    // Un jour de marge : « aujourd'hui » à Paris peut être demain en UTC.
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const date = body.payeeLe ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || date > tomorrow) {
      return NextResponse.json({ error: "Date de paiement invalide (pas de date future)" }, { status: 400 });
    }
    const invoice = await (await getRepository()).markInvoicePaid(body.invoiceId, date);
    if (!invoice) {
      return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
    }
    await audit(await getActor(), "facture_payee", invoice.numero, { details: { payeeLe: date }, request });
    return NextResponse.json({ invoice });
  }

  if (body.action === "complete" && body.dossierId) {
    const dossier = await (await getRepository()).completeOpcoDossier(body.dossierId);
    if (!dossier) {
      return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    }
    await audit(await getActor(), "dossier_transmis", dossier.reference, { request });
    return NextResponse.json({ dossier });
  }

  return NextResponse.json({ error: "Action invalide" }, { status: 400 });
}
