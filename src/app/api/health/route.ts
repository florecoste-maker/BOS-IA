import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Sonde publique pour vérifier le déploiement Hostinger (aucune donnée métier). */
export function GET() {
  return NextResponse.json({ ok: true, service: "bos-ia" });
}
