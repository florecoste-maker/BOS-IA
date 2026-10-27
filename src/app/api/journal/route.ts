import { NextResponse } from "next/server";
import { AUDIT_LABELS, csvCell } from "@/lib/audit";
import { getRepository } from "@/lib/data";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Journal des actions (administrateurs). `?format=csv` pour l'archiver (Qualiopi, RGPD). */
export async function GET(request: Request) {
  const actor = await getActor();
  if (actor?.role !== "admin") {
    return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const entries = await (await getRepository()).getAudit({
    utilisateurId: params.get("utilisateur") || undefined,
    action: params.get("action") || undefined,
    limit: params.get("format") === "csv" ? 5000 : Number(params.get("limit")) || 200,
  });

  if (params.get("format") !== "csv") return NextResponse.json({ entries });

  const lines = ["date;utilisateur;action;objet;details;ip"];
  for (const e of entries) {
    lines.push(
      [e.le, e.utilisateur, AUDIT_LABELS[e.action] ?? e.action, e.objet, e.details ?? "", e.ip ?? ""]
        .map(csvCell)
        .join(";"),
    );
  }
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bos-ia-journal-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
