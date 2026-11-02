import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { MANUAL_QUOTE_STATUSES, checkQuote } from "@/lib/business";
import { getRepository } from "@/lib/data";
import { getActor } from "@/lib/session";
import type { QuoteStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ quotes: await (await getRepository()).getQuotes() });
}

/**
 * `{ ...devis }` : nouveau devis (numéro DEV-AAAA-NNNN) ;
 * `{ action: "facturer", id }` : devis accepté → facture émise.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const repo = await getRepository();
  const actor = await getActor();

  if (body.action === "facturer") {
    if (typeof body.id !== "string") return NextResponse.json({ error: "Devis manquant" }, { status: 400 });
    const result = await repo.invoiceQuote(body.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const { quote, invoice } = result.value;
    await audit(actor, "devis_facture", `${quote.numero} → ${invoice.numero}`, {
      details: { client: quote.client, montantHT: invoice.montantHT },
      request,
    });
    return NextResponse.json(result.value);
  }

  const checked = checkQuote(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const result = await repo.createQuote(checked.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await audit(actor, "devis_cree", `${result.value.numero} (${result.value.client})`, {
    details: { montantHT: result.value.montantHT, statut: result.value.status },
    request,
  });
  return NextResponse.json({ quote: result.value });
}

/** Statut choisi à la main : `{ id, status }` (brouillon, envoyé, accepté, refusé). */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; status?: unknown };
  if (typeof body.id !== "string") return NextResponse.json({ error: "Devis manquant" }, { status: 400 });
  if (!(MANUAL_QUOTE_STATUSES as readonly unknown[]).includes(body.status)) {
    return NextResponse.json({ error: "Statut non modifiable à la main" }, { status: 400 });
  }
  const result = await (await getRepository()).updateQuoteStatus(body.id, body.status as QuoteStatus);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await audit(await getActor(), "devis_statut", result.value.numero, { details: { statut: body.status }, request });
  return NextResponse.json({ quote: result.value });
}
