import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { type ClientInput, checkClient } from "@/lib/business";
import { getRepository } from "@/lib/data";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Clients et missions (fiche client du cockpit). */
export async function GET() {
  const repo = await getRepository();
  const [clients, missions] = await Promise.all([repo.getClients(), repo.getMissions()]);
  return NextResponse.json({ clients, missions });
}

/** Nouveau client (ou prospect). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkClient(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const result = await (await getRepository()).createClient(checked.value as ClientInput);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await audit(await getActor(), "client_cree", result.value.nom, { details: { statut: result.value.statut }, request });
  return NextResponse.json({ client: result.value });
}

/** Modification d'une fiche client : `{ id, ...champs modifiés }`. */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.id !== "string") return NextResponse.json({ error: "Client manquant" }, { status: 400 });
  const checked = checkClient(body, { partial: true });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const result = await (await getRepository()).updateClient(body.id, checked.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await audit(await getActor(), "client_modifie", result.value.nom, {
    details: { champs: Object.keys(checked.value).join(", ") },
    request,
  });
  return NextResponse.json({ client: result.value });
}
