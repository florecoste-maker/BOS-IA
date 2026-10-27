import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { describeMailError, getMailConfig, isEmail, sendMail } from "@/lib/mail";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Envoie un e-mail de test à l'adresse indiquée (administrateurs) : confirme
 * l'expéditeur et la remise réelle, au-delà de la simple connexion SMTP.
 */
export async function POST(request: Request) {
  const config = getMailConfig();
  if (!config) {
    return NextResponse.json({ error: "SMTP non configuré (SMTP_HOST et SMTP_FROM dans hPanel)" }, { status: 409 });
  }
  const body = (await request.json().catch(() => null)) as { adresse?: unknown } | null;
  const adresse = typeof body?.adresse === "string" ? body.adresse.trim() : "";
  if (!isEmail(adresse)) return NextResponse.json({ error: "Adresse e-mail invalide" }, { status: 400 });

  const actor = await getActor();
  try {
    const sent = await sendMail(
      config,
      {
        to: adresse,
        subject: "BOS-IA : e-mail de test",
        text: [
          "Bonjour,",
          "",
          `Cet e-mail de test a été envoyé depuis BOS-IA par ${actor?.nom ?? "un administrateur"}.`,
          `Expéditeur : ${config.from}`,
          `Serveur : ${config.host}:${config.port}`,
          "",
          "S'il est arrivé dans les spams, ajoutez l'expéditeur à vos contacts et vérifiez",
          "les enregistrements SPF et DKIM du domaine (hPanel → Domaines → DNS).",
        ].join("\n"),
      },
      { interne: true },
    );
    await audit(actor, "email_test", adresse, { details: { serveur: config.host }, request });
    return NextResponse.json({
      ok: true,
      message: `E-mail de test envoyé à ${sent.to} : vérifiez la boîte de réception (et les spams).`,
    });
  } catch (error) {
    await audit(actor, "email_test_echec", adresse, { details: { serveur: config.host }, request });
    return NextResponse.json({ ok: false, error: describeMailError(error, config) }, { status: 502 });
  }
}
