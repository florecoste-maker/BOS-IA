"use client";

import { useState, useTransition } from "react";
import { StatusPill } from "@/components/ui";
import { formatDate, statusLabel } from "@/lib/format";
import { OPERATIONS } from "@/lib/actions/operations";
import { isRetryable } from "@/lib/actions/rules";
import type { ActionExecution, Agent, AgentAction } from "@/lib/types";

const EXEC_LABEL: Record<ActionExecution["statut"], string> = {
  en_cours: "En cours",
  envoye: "Envoyé",
  fait: "Appliqué",
  echec: "Échec",
  simule: "Simulé (démo)",
  a_faire: "À envoyer",
};
const EXEC_TONE = {
  en_cours: "brand",
  envoye: "ok",
  fait: "ok",
  echec: "danger",
  simule: "nexus",
  a_faire: "warn",
} as const;

function agentTone(agent: Agent) {
  if (agent.status === "en_attente_hitl") return "warn" as const;
  if (agent.status === "erreur") return "danger" as const;
  if (agent.tier === "QAA") return "ok" as const;
  if (agent.tier === "IPOA") return "brand" as const;
  return "nexus" as const;
}

export function AgentsClient({
  initialAgents,
  initialActions,
}: {
  initialAgents: Agent[];
  initialActions: AgentAction[];
}) {
  const [agents, setAgents] = useState(initialAgents);
  const [actions, setActions] = useState(initialActions);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Brouillons modifiés par l'humain avant approbation, par action.
  const [edits, setEdits] = useState<Record<string, { objet: string; corps: string }>>({});

  function draftOf(action: AgentAction) {
    return edits[action.id] ?? { objet: action.email?.objet ?? "", corps: action.email?.corps ?? "" };
  }

  // Nouveau statut choisi par l'humain, par action (revérifié côté serveur).
  const [values, setValues] = useState<Record<string, string>>({});
  const valueOf = (action: AgentAction) => values[action.id] ?? action.operation?.valeur ?? "";

  function resolve(actionId: string, decision: "approved" | "rejected" | "renvoyer") {
    const action = actions.find((a) => a.id === actionId);
    startTransition(async () => {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId,
          decision,
          ...(decision === "approved" && action?.email ? draftOf(action) : {}),
          ...(decision === "approved" && action?.operation ? { valeur: valueOf(action) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Erreur");
        return;
      }
      setAgents(data.agents);
      setActions(data.actions);
      const execution = (data.action as AgentAction | undefined)?.execution;
      setMessage(
        execution
          ? `${EXEC_LABEL[execution.statut]} — ${execution.message}`
          : decision === "approved"
            ? "Action approuvée : à réaliser par l'équipe"
            : "Action refusée",
      );
    });
  }

  const [runningId, setRunningId] = useState<string | null>(null);

  async function runAgent(agentId: string) {
    setRunningId(agentId);
    setMessage(null);
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Erreur");
        return;
      }
      setAgents(data.agents);
      setActions(data.actions);
      setMessage(
        `Analyse terminée (${data.run.model}) — ${data.run.actions.length} action(s) proposée(s).`,
      );
    } catch {
      setMessage("Connexion au serveur impossible.");
    } finally {
      setRunningId(null);
    }
  }

  const pendingHitl = actions.filter(
    (a) => a.requiresHitl && a.hitlStatus === "pending",
  );
  const decided = actions.filter((a) => a.hitlStatus === "approved").slice(0, 10);

  return (
    <>
      {message ? (
        <p className="mb-6 border-l-2 border-nexus bg-surface px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}

      <section className="mb-12">
        <h2 className="font-display text-xl font-semibold">
          File HITL ({pendingHitl.length})
        </h2>
        <ul className="mt-5 divide-y divide-line border-y border-line">
          {pendingHitl.length === 0 ? (
            <li className="py-4 text-sm text-ink-muted">
              Aucune décision humaine en attente.
            </li>
          ) : (
            pendingHitl.map((action) => (
              <li key={action.id} className="py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label="À valider" tone="warn" />
                  <span className="text-sm font-medium">{action.type}</span>
                  <span className="text-xs text-ink-muted">
                    {formatDate(action.timestamp)}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
                  {action.description}
                </p>
                {action.operation ? (
                  <div className="mt-3 max-w-2xl border-l-2 border-nexus/40 pl-3 text-sm">
                    <p className="text-ink-muted">{OPERATIONS[action.operation.type].libelle}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-medium">{action.operation.cible?.libelle ?? action.operation.refId}</span>
                      <span className="text-ink-muted">{action.operation.cible?.actuel ?? "—"} →</span>
                      <select
                        value={valueOf(action)}
                        disabled={pending}
                        onChange={(e) => setValues({ ...values, [action.id]: e.target.value })}
                        className="border border-line bg-surface px-2 py-1"
                        aria-label="Nouveau statut"
                      >
                        {OPERATIONS[action.operation.type].valeurs.map((v) => (
                          <option key={v} value={v}>
                            {statusLabel(v)}
                          </option>
                        ))}
                      </select>
                    </p>
                  </div>
                ) : null}
                {action.email ? (
                  <div className="mt-3 max-w-2xl border-l-2 border-brand/40 pl-3 text-sm">
                    <p>
                      <span className="text-ink-muted">À : </span>
                      {action.email.destinataire
                        ? `${action.email.destinataire.nom} <${action.email.destinataire.email ?? "adresse manquante"}>`
                        : action.email.refId}
                    </p>
                    <label className="mt-2 block">
                      <span className="text-ink-muted">Objet</span>
                      <input
                        value={draftOf(action).objet}
                        maxLength={200}
                        disabled={pending}
                        onChange={(e) =>
                          setEdits({ ...edits, [action.id]: { ...draftOf(action), objet: e.target.value } })
                        }
                        className="mt-1 block w-full border border-line bg-surface px-2 py-1"
                      />
                    </label>
                    <label className="mt-2 block">
                      <span className="text-ink-muted">Message</span>
                      <textarea
                        value={draftOf(action).corps}
                        maxLength={5000}
                        rows={8}
                        disabled={pending}
                        onChange={(e) =>
                          setEdits({ ...edits, [action.id]: { ...draftOf(action), corps: e.target.value } })
                        }
                        className="mt-1 block w-full border border-line bg-surface px-2 py-1 font-sans"
                      />
                    </label>
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => resolve(action.id, "approved")}
                    className="bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
                  >
                    {action.email && action.operation
                      ? "Approuver, appliquer et envoyer"
                      : action.email
                        ? "Approuver et envoyer"
                        : action.operation
                          ? "Approuver et appliquer"
                          : "Approuver"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => resolve(action.id, "rejected")}
                    className="border border-line px-3 py-1.5 text-xs font-semibold hover:border-danger/40 disabled:opacity-50"
                  >
                    Refuser
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      {decided.length ? (
        <section className="mb-12">
          <h2 className="font-display text-xl font-semibold">Décisions récentes</h2>
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {decided.map((action) => (
              <li key={action.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm">
                {action.execution ? (
                  <StatusPill
                    label={EXEC_LABEL[action.execution.statut]}
                    tone={EXEC_TONE[action.execution.statut]}
                  />
                ) : (
                  <StatusPill label="À réaliser par l'équipe" tone="brand" />
                )}
                <span className="font-medium">
                  {action.email
                    ? action.email.objet
                    : action.operation
                      ? `${OPERATIONS[action.operation.type].libelle} → ${statusLabel(action.operation.valeur)}`
                      : action.type}
                </span>
                <span className="text-xs text-ink-muted">
                  {formatDate(action.timestamp)}
                  {action.decidePar ? ` · approuvé par ${action.decidePar}` : ""}
                </span>
                {action.execution?.message ? (
                  <span className="basis-full text-ink-muted">{action.execution.message}</span>
                ) : (
                  <span className="basis-full text-ink-muted">{action.description}</span>
                )}
                {(action.email || action.operation) && action.execution && isRetryable(action.execution) ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => resolve(action.id, "renvoyer")}
                    className="border border-line px-3 py-1 text-xs font-semibold hover:border-brand/40 disabled:opacity-50"
                  >
                    Réessayer
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-display text-xl font-semibold">Agents déployés</h2>
        <ul className="mt-5 grid gap-6 md:grid-cols-2">
          {agents.map((agent) => (
            <li key={agent.id} className="border-t border-line pt-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-display text-lg font-semibold">{agent.nom}</p>
                  <p className="text-sm text-ink-muted">{agent.role}</p>
                </div>
                <StatusPill label={agent.tier} tone={agentTone(agent)} />
              </div>
              <p className="mt-3 text-sm text-ink-muted">{agent.derniereAction}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <StatusPill label={statusLabel(agent.status)} tone={agentTone(agent)} />
                <StatusPill
                  label={`Risque ${agent.risque}`}
                  tone={
                    agent.risque === "eleve"
                      ? "danger"
                      : agent.risque === "moyen"
                        ? "warn"
                        : "ok"
                  }
                />
                {agent.hitlObligatoire ? (
                  <StatusPill label="HITL obligatoire" tone="warn" />
                ) : null}
              </div>
              <button
                type="button"
                disabled={runningId !== null}
                onClick={() => runAgent(agent.id)}
                className="mt-4 border border-line px-3 py-1.5 text-xs font-semibold hover:border-brand/40 disabled:opacity-50"
              >
                {runningId === agent.id ? "Analyse en cours…" : "Lancer l'analyse IA"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
