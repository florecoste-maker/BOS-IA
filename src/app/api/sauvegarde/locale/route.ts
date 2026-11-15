import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/agents/schedule";
import { SYSTEM_ACTOR, audit } from "@/lib/audit";
import { runDailyBackup } from "@/lib/db/sauvegardes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Copie quotidienne de la base SQLite sur l'hébergement (`~/bos-data/sauvegardes/`),
 * vérifiée puis soumise à la conservation (30 jours + 1 par mois sur 12 mois).
 * Déclenchée chaque jour par le workflow « Surveillance » avec BOS_CRON_SECRET.
 * `?forcer=1` refait la copie du jour. Réponse : emplacements, taille, contrôle
 * d'intégrité et nombre de fiches par table (jamais le contenu).
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }
  const force = new URL(request.url).searchParams.get("forcer") === "1";
  try {
    const result = await runDailyBackup({ force });
    if (result.statut === "ignoree") return NextResponse.json(result, { status: 409 });
    if (result.statut === "creee") {
      await audit(SYSTEM_ACTOR, "export", "sauvegarde quotidienne de la base", {
        details: { fichier: result.fichier, totaux: result.verification?.totaux },
        request,
      }).catch(() => {});
    }
    return NextResponse.json(result, { status: result.verification?.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ error: `Sauvegarde impossible : ${(error as Error).message}` }, { status: 500 });
  }
}
