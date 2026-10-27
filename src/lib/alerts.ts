/**
 * Alertes et rapports envoyés à l'équipe (BOS_ALERTES_EMAIL), par le même SMTP
 * que les e-mails approuvés. Sans adresse ou sans SMTP : rien n'est envoyé,
 * l'information reste visible dans le cockpit.
 */
import { brand } from "@/lib/brand";
import type { Repository } from "@/lib/data";
import { getMailConfig, isEmail, sendMail, type MailAttachment } from "@/lib/mail";

export function getAlertAddress() {
  const value = process.env.BOS_ALERTES_EMAIL?.trim();
  return isEmail(value) ? value : null;
}

export type AlertResult = { sent: true } | { sent: false; reason: string };

export async function sendAlert(
  subject: string,
  text: string,
  attachments?: MailAttachment[],
): Promise<AlertResult> {
  const to = getAlertAddress();
  if (!to) return { sent: false, reason: "BOS_ALERTES_EMAIL non configuré" };
  const config = getMailConfig();
  if (!config) return { sent: false, reason: "SMTP non configuré" };
  try {
    await sendMail(
      config,
      { to, subject: `[${brand.product}] ${subject}`, text },
      { interne: true, attachments },
    );
    return { sent: true };
  } catch (error) {
    console.error("Alerte non envoyée", error);
    return { sent: false, reason: "Échec de l'envoi SMTP" };
  }
}

function cockpitUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || brand.appUrl;
  return `${base.replace(/\/$/, "")}${path}`;
}

export interface RunOutcome {
  agentId: string;
  statut: "succes" | "echec" | "ignore";
  message: string;
}

/**
 * Rapport après un passage planifié, envoyé seulement s'il y a quelque chose à
 * faire : un échec, ou des propositions qui attendent une décision humaine.
 */
export async function sendRunReport(repo: Repository, results: RunOutcome[]): Promise<AlertResult> {
  const [agents, actions, metrics] = await Promise.all([
    repo.getAgents(),
    repo.getAgentActions(),
    repo.getMetrics(),
  ]);
  const names = new Map(agents.map((a) => [a.id, a.nom]));
  const failures = results.filter((r) => r.statut === "echec");
  const pending = actions.filter((a) => a.requiresHitl && a.hitlStatus === "pending");
  const succeeded = results.filter((r) => r.statut === "succes").length;
  if (!failures.length && !pending.length) {
    return { sent: false, reason: "Rien à signaler" };
  }

  const lines = [
    `Passage planifié : ${succeeded} analyse(s) réussie(s), ${failures.length} échec(s).`,
    "",
  ];
  if (failures.length) {
    lines.push("Échecs :");
    for (const f of failures) lines.push(`- ${names.get(f.agentId) ?? f.agentId} : ${f.message}`);
    lines.push("");
  }
  if (pending.length) {
    lines.push(`${pending.length} proposition(s) attendent votre validation :`);
    for (const a of pending.slice(0, 10)) {
      lines.push(`- ${names.get(a.agentId) ?? a.agentId} : ${a.email ? `e-mail « ${a.email.objet} »` : a.description}`);
    }
    if (pending.length > 10) lines.push(`- … et ${pending.length - 10} autre(s)`);
    lines.push("");
  }
  if (metrics.facturesEnRetard) lines.push(`Factures en retard : ${metrics.facturesEnRetard}.`, "");
  lines.push(`Ouvrir la file de validation : ${cockpitUrl("/app/agents")}`);

  const subject = failures.length
    ? `${failures.length} échec(s) d'agent, ${pending.length} validation(s) en attente`
    : `${pending.length} proposition(s) à valider`;
  return sendAlert(subject, lines.join("\n"));
}

/** Alerte immédiate quand un e-mail approuvé n'a pas pu partir. */
export async function alertSendFailure(objet: string, message: string) {
  return sendAlert(
    "Échec d'envoi d'un e-mail approuvé",
    [
      `L'e-mail « ${objet} » n'a pas été envoyé.`,
      `Motif : ${message}`,
      "",
      `Après correction, utilisez « Renvoyer » : ${cockpitUrl("/app/agents")}`,
    ].join("\n"),
  );
}
