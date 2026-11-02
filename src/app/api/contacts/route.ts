import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { type ContactInput, checkContact } from "@/lib/business";
import { getRepository } from "@/lib/data";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

const label = (c: { prenom?: string; nom: string }) => [c.prenom, c.nom].filter(Boolean).join(" ");

/** Nouveau contact dans l'espace d'une entreprise cliente. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkContact(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const result = await (await getRepository()).createContact(checked.value as ContactInput);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await audit(await getActor(), "contact_cree", label(result.value), {
    details: { espace: result.value.clientId, categorie: result.value.categorie },
    request,
  });
  return NextResponse.json({ contact: result.value });
}

/** Modification d'un contact : `{ id, ...champs modifiés }` (l'espace ne change pas). */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.id !== "string") return NextResponse.json({ error: "Contact manquant" }, { status: 400 });
  const checked = checkContact(body, { partial: true });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const result = await (await getRepository()).updateContact(body.id, checked.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await audit(await getActor(), "contact_modifie", label(result.value), {
    details: { champs: Object.keys(checked.value).join(", ") },
    request,
  });
  return NextResponse.json({ contact: result.value });
}
