import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/agents/schedule";
import { getAlertAddress, sendAlert } from "@/lib/alerts";
import { SYSTEM_ACTOR, audit } from "@/lib/audit";
import { backupFileName, buildBackup, gzipBackup } from "@/lib/backup";
import { getRepository } from "@/lib/data";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getMailConfig } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Sauvegarde hebdomadaire envoyée par e-mail à BOS_ALERTES_EMAIL (pièce jointe
 * .json.gz), déclenchée par le planificateur avec BOS_CRON_SECRET.
 * Route publique côté proxy : seul le secret l'autorise.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Rien à sauvegarder en mode démonstration" }, { status: 409 });
  }
  if (!getAlertAddress() || !getMailConfig()) {
    return NextResponse.json(
      { error: "Sauvegarde par e-mail impossible : configurez BOS_ALERTES_EMAIL et SMTP" },
      { status: 503 },
    );
  }

  const backup = await buildBackup(await getRepository());
  const t = backup.totaux;
  const result = await sendAlert(
    `Sauvegarde du ${backup.exporteLe.slice(0, 10)}`,
    [
      "Sauvegarde hebdomadaire des données BOS-IA en pièce jointe (JSON compressé).",
      "",
      `Sessions : ${t.sessions} · Apprenants : ${t.apprenants} · Dossiers OPCO : ${t.dossiersOpco} · Factures : ${t.factures}`,
      "",
      "Contient des données personnelles : conservez ce message dans un espace protégé.",
      "Restauration : cockpit → Import, à partir des exports CSV (même format).",
    ].join("\n"),
    [{ filename: `${backupFileName()}.gz`, content: gzipBackup(backup), contentType: "application/gzip" }],
  );
  if (!result.sent) return NextResponse.json({ error: result.reason }, { status: 502 });
  await audit(SYSTEM_ACTOR, "export", "sauvegarde hebdomadaire par e-mail", { details: t, request });
  return NextResponse.json({ ok: true, totaux: t });
}
