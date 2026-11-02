import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { isVercel } from "@/lib/auth";
import { checkDatabase } from "@/lib/db/connection-test";
import { writeEnvVariables } from "@/lib/env-files";
import { getMailConfig, mailWarnings, verifyMail } from "@/lib/mail";
import { getActor } from "@/lib/session";
import { detecterFournisseur, prepareReglages, type FormulaireReglages } from "@/lib/settings/reglages";

export const dynamic = "force-dynamic";

/**
 * Réglages du serveur saisis dans le cockpit (administrateurs) : base de
 * données, e-mails, adresse des alertes. Chaque réglage est testé avant d'être
 * écrit dans `bos-ia.env` ; un échec ne change rien au cockpit. Les valeurs ne
 * sont jamais renvoyées ni journalisées (noms seulement).
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (actor?.role !== "admin") return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
  if (isVercel()) {
    return NextResponse.json(
      { error: "Sur Vercel, les réglages se font dans Vercel → Settings → Environment Variables" },
      { status: 409 },
    );
  }

  const form = (await request.json().catch(() => ({}))) as FormulaireReglages;
  if (form.section === "emails" && (!form.fournisseur || form.fournisseur === "auto") && typeof form.adresse === "string") {
    form.fournisseur = (await detecterFournisseur(form.adresse.trim())) ?? "inconnu";
  }
  const prep = prepareReglages(form);
  if (!prep.ok) return NextResponse.json({ error: prep.erreur }, { status: 400 });
  const variables = { ...prep.variables };

  if (prep.section === "base") {
    const report = await checkDatabase(variables);
    if (report.statut !== "connectee") {
      await audit(actor, "reglages_refuses", "Base de données", { request });
      const raison = report.statut === "non_configuree" ? "réglages incomplets" : report.erreur;
      return NextResponse.json(
        { error: `Connexion à la base impossible, rien n'a été changé. Raison : ${raison}` },
        { status: 422 },
      );
    }
  }

  if (prep.section === "emails") {
    const config = getMailConfig({ ...process.env, ...variables, SMTP_SECURE: "" });
    if (!config) return NextResponse.json({ error: "Réglages SMTP incomplets" }, { status: 400 });
    const avertissements = mailWarnings(config);
    if (avertissements.length) return NextResponse.json({ error: avertissements.join(" ; ") }, { status: 400 });
    const probe = await verifyMail(config);
    if (!probe.ok) {
      await audit(actor, "reglages_refuses", "E-mails (SMTP)", { request });
      return NextResponse.json({ error: `${probe.message}. Rien n'a été changé.` }, { status: 422 });
    }
    // Le port choisi fixe le chiffrement : une ancienne valeur SMTP_SECURE ne doit pas le contredire.
    variables.SMTP_SECURE = "";
  }

  try {
    writeEnvVariables(variables);
  } catch (error) {
    return NextResponse.json(
      { error: `Écriture impossible sur le serveur : ${error instanceof Error ? error.message : error}` },
      { status: 500 },
    );
  }

  const objet = { base: "Base de données", emails: "E-mails (SMTP)", alertes: "Alertes" }[prep.section];
  await audit(actor, "reglages_modifies", objet, { details: { variables: Object.keys(variables).sort() }, request });

  const messages = {
    base: "Base de données connectée et enregistrée. Les tables sont créées automatiquement : le mode démonstration est terminé. Créez maintenant votre compte nominatif dans « Comptes » (ceux créés en démonstration n'étaient pas conservés).",
    emails: variables.BOS_EMAIL_REDIRECTION
      ? `Connexion e-mail vérifiée et enregistrée. Mode test : tous les envois partent vers ${variables.BOS_EMAIL_REDIRECTION}.`
      : "Connexion e-mail vérifiée et enregistrée : les e-mails approuvés partent aux vrais destinataires.",
    alertes: `Adresse des alertes enregistrée : ${variables.BOS_ALERTES_EMAIL}.`,
  };
  return NextResponse.json({ ok: true, message: messages[prep.section] });
}
