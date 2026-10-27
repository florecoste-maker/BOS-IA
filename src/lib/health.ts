/**
 * Bilan de santé du moteur : appelé chaque jour par le planificateur
 * (GET /api/health?complet=1 avec BOS_CRON_SECRET). Une « erreur » rend le
 * workflow GitHub rouge, et GitHub prévient le propriétaire du dépôt par e-mail :
 * l'alerte part même si le site ne peut plus envoyer d'e-mails lui-même.
 */
import { getAgentsConfig } from "@/lib/agents/claude";
import { getScheduleConfig } from "@/lib/agents/schedule";
import { getAlertAddress } from "@/lib/alerts";
import { getRepository } from "@/lib/data";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getMailConfig, verifyMail } from "@/lib/mail";

export type CheckStatus = "ok" | "attention" | "erreur";

export interface HealthCheck {
  nom: string;
  statut: CheckStatus;
  message: string;
}

/** Délai au-delà duquel l'absence de passage planifié est anormale. */
const SCHEDULE_STALE_DAYS = 4;

export async function runHealthChecks(now = Date.now()): Promise<{ ok: boolean; checks: HealthCheck[] }> {
  const checks: HealthCheck[] = [];

  let dbOk = false;
  if (!isDatabaseConfigured()) {
    checks.push({ nom: "Base de données", statut: "erreur", message: "Non configurée : mode démonstration" });
  } else {
    const probe = await (await import("@/lib/db/mysql")).probeDatabase();
    dbOk = probe.ok;
    checks.push({
      nom: "Base de données",
      statut: probe.ok ? "ok" : "erreur",
      message: probe.ok ? "Connectée" : probe.message,
    });
  }

  checks.push(
    getAgentsConfig().configured
      ? { nom: "Agents IA", statut: "ok", message: "Clé API Claude présente" }
      : { nom: "Agents IA", statut: "attention", message: "ANTHROPIC_API_KEY absente" },
  );

  const mail = getMailConfig();
  if (!mail) {
    checks.push({ nom: "E-mails (SMTP)", statut: "attention", message: "Non configuré : envois manuels" });
  } else {
    const probe = await verifyMail(mail);
    checks.push({
      nom: "E-mails (SMTP)",
      statut: probe.ok ? "ok" : "erreur",
      message: probe.ok ? (mail.redirection ? "Connecté (mode test)" : "Connecté") : probe.message,
    });
  }

  const schedule = getScheduleConfig();
  if (!schedule.configured) {
    checks.push({ nom: "Agents planifiés", statut: "attention", message: "BOS_CRON_SECRET absent" });
  } else if (dbOk) {
    const runs = await (await getRepository()).getAgentRuns(200);
    const last = runs.find((r) => r.declencheur === "planifie");
    const ageDays = last ? (now - Date.parse(last.debut)) / 86_400_000 : null;
    checks.push(
      ageDays !== null && ageDays <= SCHEDULE_STALE_DAYS
        ? { nom: "Agents planifiés", statut: "ok", message: `Dernier passage il y a ${Math.floor(ageDays * 24)} h` }
        : {
            nom: "Agents planifiés",
            statut: "attention",
            message: last
              ? `Aucun passage depuis ${Math.floor(ageDays!)} jours : vérifier le workflow GitHub`
              : "Aucun passage planifié enregistré",
          },
    );
  }

  checks.push(
    getAlertAddress()
      ? { nom: "Alertes", statut: mail ? "ok" : "attention", message: mail ? "Adresse d'alerte configurée" : "Adresse configurée mais SMTP absent" }
      : { nom: "Alertes", statut: "attention", message: "BOS_ALERTES_EMAIL absent : pas d'alerte ni de sauvegarde par e-mail" },
  );

  return { ok: checks.every((c) => c.statut !== "erreur"), checks };
}
