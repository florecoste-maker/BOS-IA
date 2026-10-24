"use client";

import { useState, useTransition } from "react";
import { StatusPill } from "@/components/ui";
import { formatDate, statusLabel } from "@/lib/format";
import type { Agent, AgentAction } from "@/lib/types";

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

  function resolve(actionId: string, decision: "approved" | "rejected") {
    startTransition(async () => {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Erreur");
        return;
      }
      setAgents(data.agents);
      setActions(data.actions);
      setMessage(
        decision === "approved"
          ? "Action agent approuvée (HITL)"
          : "Action agent refusée (HITL)",
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
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => resolve(action.id, "approved")}
                    className="bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
                  >
                    Approuver
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
