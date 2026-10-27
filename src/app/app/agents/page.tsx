import { AgentsClient } from "@/components/agents-client";
import { SectionTitle, StatusPill } from "@/components/ui";
import { withRecipients } from "@/lib/actions/execute";
import { getScheduleConfig } from "@/lib/agents/schedule";
import { getRepository } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const RUN_LABEL = { succes: "Succès", echec: "Échec", ignore: "Ignoré" } as const;
const RUN_TONE = { succes: "ok", echec: "danger", ignore: "warn" } as const;

export default async function AgentsPage() {
  const repo = await getRepository();
  const [agents, actions, runs] = await Promise.all([
    repo.getAgents(),
    repo.getAgentActions(),
    repo.getAgentRuns(20),
  ]);
  const schedule = getScheduleConfig();
  const names = new Map(agents.map((a) => [a.id, a.nom]));
  const lastScheduled = runs.find((r) => r.declencheur === "planifie");

  return (
    <>
      <SectionTitle
        eyebrow="Digital Nexus"
        title="Écosystème multi-agents"
        description="SMA hiérarchisé : QAA (vérité & conformité), IPOA (optimisation), FCA/MDGA (délégation surveillée). Les processus à haut risque restent sous HITL."
      />
      <AgentsClient initialAgents={agents} initialActions={await withRecipients(repo, actions)} />

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold">Exécutions</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          {schedule.configured
            ? `Planification active : chaque agent est analysé au plus une fois toutes les ${schedule.intervalHours} h, sauf s'il a des propositions en attente de validation. ${
                lastScheduled
                  ? `Dernier passage planifié : ${formatDateTime(lastScheduled.debut)}.`
                  : "Aucun passage planifié pour l'instant."
              }`
            : "Planification inactive : ajoutez BOS_CRON_SECRET dans hPanel et configurez le planificateur (voir README)."}
        </p>
        <ul className="mt-5 divide-y divide-line border-y border-line">
          {runs.length === 0 ? (
            <li className="py-4 text-sm text-ink-muted">Aucune exécution enregistrée.</li>
          ) : (
            runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm">
                <StatusPill label={RUN_LABEL[run.statut]} tone={RUN_TONE[run.statut]} />
                <span className="font-medium">{names.get(run.agentId) ?? run.agentId}</span>
                <span className="text-xs text-ink-muted">
                  {run.declencheur === "planifie" ? "Planifié" : "Manuel"} · {formatDateTime(run.debut)}
                  {run.statut === "succes" ? ` · ${run.actions} action(s)` : ""}
                </span>
                {run.message ? (
                  <span className="basis-full text-ink-muted">{run.message}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </>
  );
}
