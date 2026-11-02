import { NextResponse } from "next/server";
import { sendAlert } from "@/lib/alerts";
import { audit } from "@/lib/audit";
import { cockpitBaseUrl } from "@/lib/brand";
import { getRepository } from "@/lib/data";
import { clientView } from "@/lib/espace";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Espace d'un compte client. L'entreprise vient du compte connecté (relu en
 * base), jamais d'un paramètre de la requête : impossible de lire un autre espace.
 */
export async function GET() {
  const actor = await getActor();
  if (actor?.role !== "client" || !actor.clientId) {
    return NextResponse.json({ error: "Réservé aux comptes clients" }, { status: 403 });
  }
  const space = await (await getRepository()).getSpace(actor.clientId);
  if (!space) return NextResponse.json({ error: "Espace introuvable" }, { status: 404 });
  return NextResponse.json(clientView(space));
}

/**
 * Réponse du client à un devis envoyé : `{ action: "accepter" | "refuser", devisId }`.
 * Le devis doit appartenir à l'entreprise du compte (vérifié par la base).
 * L'équipe est prévenue par e-mail (BOS_ALERTES_EMAIL) ; la facture reste créée par Jamaliance.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (actor?.role !== "client" || !actor.clientId) {
    return NextResponse.json({ error: "Réservé aux comptes clients" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; devisId?: unknown };
  const decision = body.action === "accepter" ? "accepte" : body.action === "refuser" ? "refuse" : null;
  if (!decision || typeof body.devisId !== "string") {
    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  }
  const result = await (await getRepository()).respondToQuote(actor.clientId, body.devisId, decision, actor.nom);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const quote = result.value;
  await audit(actor, decision === "accepte" ? "devis_accepte_client" : "devis_refuse_client", `${quote.numero} (${quote.client})`, {
    details: { montantTTC: quote.montantTTC },
    request,
  });
  void sendAlert(
    `Devis ${quote.numero} ${decision === "accepte" ? "accepté" : "refusé"} par ${quote.client}`,
    [
      `${actor.nom} (${quote.client}) a ${decision === "accepte" ? "accepté" : "refusé"} le devis ${quote.numero} depuis son espace client.`,
      "",
      `Objet : ${quote.objet}`,
      `Montant : ${quote.montantTTC.toFixed(2).replace(".", ",")} € TTC`,
      "",
      decision === "accepte"
        ? `Prochaine étape : cockpit → Devis → « Créer la facture » (${cockpitBaseUrl()}/app/devis).`
        : `Le devis reste visible dans le cockpit (${cockpitBaseUrl()}/app/devis).`,
    ].join("\n"),
  ).catch(() => {});
  return NextResponse.json({ quote });
}
