import { IMPORT_KINDS, templateCsv, type ImportKind } from "@/lib/import/schema";

/** Modèle CSV prêt à remplir dans Excel : `/api/import/modele?type=apprenants`. */
export function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("type") as ImportKind;
  if (!IMPORT_KINDS.some((k) => k.kind === kind)) {
    return new Response("Type d'import inconnu", { status: 400 });
  }
  return new Response(templateCsv(kind), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bos-ia-modele-${kind}.csv"`,
    },
  });
}
