import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json({
    dossiers: store.getOpcoDossiers(),
    invoices: store.getInvoices(),
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    dossierId: string;
    action: "complete";
  };

  if (body.action === "complete") {
    const dossier = store.completeOpcoDossier(body.dossierId);
    if (!dossier) {
      return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    }
    return NextResponse.json({ dossier });
  }

  return NextResponse.json({ error: "Action invalide" }, { status: 400 });
}
