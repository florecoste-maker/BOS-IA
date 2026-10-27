import { NextResponse } from "next/server";
import { backupFileName, buildBackup } from "@/lib/backup";
import { getRepository } from "@/lib/data";
import { exportCsv } from "@/lib/import/export";
import { IMPORT_KINDS, type ImportKind } from "@/lib/import/schema";

export const dynamic = "force-dynamic";

/**
 * Téléchargements depuis le cockpit (session requise) :
 * `?format=json` sauvegarde complète ; `?format=csv&type=apprenants` export
 * au format de l'import, réimportable tel quel.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const repo = await getRepository();
  const date = new Date().toISOString().slice(0, 10);

  if (params.get("format") === "csv") {
    const kind = params.get("type") as ImportKind;
    if (!IMPORT_KINDS.some((k) => k.kind === kind)) {
      return NextResponse.json({ error: "Type inconnu" }, { status: 400 });
    }
    const [sessions, learners, dossiers, invoices] = await Promise.all([
      repo.getSessions(),
      repo.getLearners(),
      repo.getOpcoDossiers(),
      repo.getInvoices(),
    ]);
    return new Response(exportCsv(kind, { sessions, learners, dossiers, invoices }), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bos-ia-${kind}-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const backup = await buildBackup(repo);
  return new Response(JSON.stringify(backup, null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${backupFileName()}"`,
      "Cache-Control": "no-store",
    },
  });
}
