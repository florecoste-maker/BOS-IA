import { NextResponse } from "next/server";
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
