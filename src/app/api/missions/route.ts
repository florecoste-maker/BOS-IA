import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { type MissionInput, checkMission } from "@/lib/business";
import { getRepository } from "@/lib/data";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Nouvelle mission pour un client (code MIS-AAAA-NNNN attribué automatiquement). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkMission(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const result = await (await getRepository()).createMission(checked.value as MissionInput);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await audit(await getActor(), "mission_creee", `${result.value.code} — ${result.value.titre}`, {
    details: { montantHT: result.value.montantHT, statut: result.value.statut },
    request,
  });
  return NextResponse.json({ mission: result.value });
}

/** Modification d'une mission : `{ id, ...champs modifiés }` (le client ne change pas). */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.id !== "string") return NextResponse.json({ error: "Mission manquante" }, { status: 400 });
  const checked = checkMission(body, { partial: true });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const result = await (await getRepository()).updateMission(body.id, checked.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await audit(await getActor(), "mission_modifiee", result.value.code, {
    details: checked.value as Record<string, unknown>,
    request,
  });
  return NextResponse.json({ mission: result.value });
}
