import { NextResponse, type NextRequest } from "next/server";
import { getAgentsConfig, probeClaude } from "@/lib/agents/claude";
import { MIN_CRON_SECRET_LENGTH, getScheduleConfig } from "@/lib/agents/schedule";
import { getRepository } from "@/lib/data";
import { getMailConfig, mailWarnings, verifyMail } from "@/lib/mail";
import { getAlertAddress } from "@/lib/alerts";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getIntegrationsOverview } from "@/lib/integrations/config";
import { probeTidyCalConnection } from "@/lib/integrations/tidycal";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const servedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const overview = getIntegrationsOverview(servedHost);
  const tidycalProbe = await probeTidyCalConnection();
  const agents = getAgentsConfig();
  const claudeProbe = await probeClaude();
  const dbProbe = isDatabaseConfigured()
    ? await (await import("@/lib/db/mysql")).probeDatabase()
    : null;
  const mail = getMailConfig();
  const mailProbe = mail ? await verifyMail(mail) : null;
  const schedule = getScheduleConfig();
  const lastScheduled =
    dbProbe?.ok
      ? (await (await getRepository()).getAgentRuns(200)).find((r) => r.declencheur === "planifie")
      : undefined;

  return NextResponse.json({
    ...overview,
    tidycal: {
      ...overview.tidycal,
      live: tidycalProbe,
    },
    database: {
      status: !dbProbe ? "missing" : dbProbe.ok ? "configured" : "partial",
      mode: dbProbe ? "mysql" : "demo",
      message: !dbProbe
        ? "Mode démonstration : données fictives en mémoire"
        : dbProbe.ok
          ? "MySQL connecté : données persistantes"
          : dbProbe.message,
      needsFromUser: !dbProbe
        ? [
            "Créer la base dans hPanel → Bases de données, puis la renseigner dans « Réglages du serveur » ci-dessus",
          ]
        : dbProbe.ok
          ? []
          : ["Vérifier le nom de la base, l'utilisateur et le mot de passe (« Réglages du serveur » ci-dessus)"],
    },
    emails: {
      status: !mail ? "missing" : mailProbe?.ok && !mailWarnings(mail).length ? "configured" : "partial",
      from: mail?.from ?? null,
      serveur: mail ? `${mail.host}:${mail.port}` : null,
      redirection: mail?.redirection ?? null,
      avertissements: mail ? mailWarnings(mail) : [],
      message: !mail
        ? "Non configuré : les e-mails approuvés restent à envoyer à la main"
        : mailProbe?.ok
          ? mail.redirection
            ? `Mode test : tous les envois partent vers ${mail.redirection}`
            : "Connexion SMTP vérifiée : envois réels"
          : mailProbe && !mailProbe.ok
            ? mailProbe.message
            : "",
      needsFromUser: !mail
        ? ["Renseigner la boîte d'envoi dans « Réglages du serveur » ci-dessus"]
        : mailProbe?.ok
          ? []
          : ["Vérifier l'hôte, le port, l'utilisateur et le mot de passe SMTP"],
    },
    alertes: {
      status: getAlertAddress() && mailProbe?.ok ? "configured" : getAlertAddress() ? "partial" : "missing",
      adresse: getAlertAddress(),
      needsFromUser: [
        !getAlertAddress()
          ? "Adresse qui reçoit rapports, alertes et sauvegardes (« Réglages du serveur » ci-dessus)"
          : null,
        getAlertAddress() && !mailProbe?.ok ? "SMTP connecté (les alertes partent par e-mail)" : null,
        !schedule.configured ? "BOS_CRON_SECRET (rapport quotidien, bilan de santé, sauvegarde hebdomadaire)" : null,
      ].filter(Boolean),
    },
    agentsPlanifies: {
      status:
        schedule.configured && dbProbe?.ok && agents.configured
          ? "configured"
          : schedule.configured
            ? "partial"
            : "missing",
      intervalHours: schedule.intervalHours,
      dernierPassage: lastScheduled?.debut ?? null,
      needsFromUser: [
        !schedule.configured
          ? schedule.secretTooShort
            ? `BOS_CRON_SECRET trop court (${MIN_CRON_SECRET_LENGTH} caractères minimum)`
            : "Secret BOS_CRON_SECRET (openssl rand -hex 32) dans hPanel et dans le planificateur"
          : null,
        !dbProbe?.ok ? "Base MySQL connectée (requise pour l'historique)" : null,
        !agents.configured ? "Clé API Claude (ANTHROPIC_API_KEY)" : null,
      ].filter(Boolean),
    },
    agentsIa: {
      status: !agents.configured ? "missing" : claudeProbe?.ok ? "configured" : "partial",
      model: agents.model,
      verification: !claudeProbe
        ? null
        : claudeProbe.ok
          ? "Clé vérifiée auprès d'Anthropic (sans frais). Le solde se consulte dans console.anthropic.com → Billing."
          : claudeProbe.message,
      needsFromUser: !agents.configured
        ? ["Clé API Claude (ANTHROPIC_API_KEY) — console.anthropic.com → API Keys"]
        : claudeProbe?.ok
          ? []
          : ["Vérifier la clé API Claude (console.anthropic.com → API Keys)"],
    },
  });
}
