import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const repo = await getRepository();
  const [dossiers, invoices] = await Promise.all([repo.getOpcoDossiers(), repo.getInvoices()]);
  return NextResponse.json({ dossiers, invoices });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    dossierId: string;
    action: "complete";
  };

  if (body.action === "complete") {
    const dossier = await (await getRepository()).completeOpcoDossier(body.dossierId);
    if (!dossier) {
      return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    }
    return NextResponse.json({ dossier });
  }

  return NextResponse.json({ error: "Action invalide" }, { status: 400 });
}
