"use client";

import { useState, useTransition } from "react";
import { StatusPill } from "@/components/ui";
import { formatDate, statusLabel } from "@/lib/format";
import type { Learner, TrainingSession } from "@/lib/types";

function toneForLearner(status: Learner["status"]) {
  if (status === "certifie") return "ok" as const;
  if (status === "inactif") return "danger" as const;
  if (status === "en_formation") return "brand" as const;
  return "warn" as const;
}

const pipelineOrder = [
  "lead",
  "inscription",
  "parcours",
  "evaluation",
  "certification",
  "completion",
] as const;

export function FormationClient({
  initialLearners,
  initialSessions,
}: {
  initialLearners: Learner[];
  initialSessions: TrainingSession[];
}) {
  const [learners, setLearners] = useState(initialLearners);
  const [sessions, setSessions] = useState(initialSessions);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    const res = await fetch("/api/formation");
    const data = await res.json();
    setLearners(data.learners);
    setSessions(data.sessions);
  }

  function runAction(body: Record<string, unknown>, successMessage: string) {
    startTransition(async () => {
      const res = await fetch("/api/formation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Erreur");
        return;
      }
      setMessage(successMessage);
      await refresh();
    });
  }

  return (
    <>
      {message ? (
        <p className="mb-6 border-l-2 border-brand bg-surface/70 px-3 py-2 text-sm text-ink">
          {message}
        </p>
      ) : null}

      <section className="mb-12 overflow-x-auto">
        <div className="flex min-w-[640px] gap-2">
          {pipelineOrder.map((stage) => {
            const count = learners.filter((l) => l.pipelineStage === stage).length;
            return (
              <div
                key={stage}
                className="flex-1 border border-line bg-surface/60 px-3 py-4 text-center"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  {stage}
                </p>
                <p className="mt-2 font-display text-2xl font-semibold">{count}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h2 className="font-display text-xl font-semibold">Apprenants</h2>
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {learners.map((learner) => (
              <li key={learner.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {learner.prenom} {learner.nom}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {learner.entreprise ?? "Indépendant"} ·{" "}
                      {formatDate(learner.derniereActivite)}
                    </p>
                  </div>
                  <StatusPill
                    label={statusLabel(learner.status)}
                    tone={toneForLearner(learner.status)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!learner.comprehensionValidee ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        runAction(
                          { id: learner.id, action: "validate", score: 88 },
                          `Compréhension validée pour ${learner.prenom}`,
                        )
                      }
                      className="border border-line bg-surface px-3 py-1.5 text-xs font-semibold hover:border-brand/50 disabled:opacity-50"
                    >
                      Valider quiz (88%)
                    </button>
                  ) : null}
                  {learner.comprehensionValidee &&
                  learner.pipelineStage !== "completion" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        runAction(
                          { id: learner.id, action: "proof_to_cash" },
                          `Proof-to-Cash déclenché pour ${learner.prenom}`,
                        )
                      }
                      className="bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
                    >
                      Proof-to-Cash
                    </button>
                  ) : null}
                  {learner.status === "inactif" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        runAction(
                          {
                            id: learner.id,
                            action: "status",
                            status: "en_formation",
                          },
                          `Relance enregistrée — ${learner.prenom} réactivé`,
                        )
                      }
                      className="border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent hover:opacity-90 disabled:opacity-50"
                    >
                      Relancer ghost learner
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="font-display text-xl font-semibold">Sessions</h2>
          <ul className="mt-5 space-y-5">
            {sessions.map((session) => (
              <li key={session.id} className="border-b border-line pb-4">
                <p className="font-medium">{session.titre}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {session.code} · {statusLabel(session.statut)} ·{" "}
                  {session.formateur}
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.1em] text-brand">
                  Indicateurs {session.qualiopiIndicateurs.join(" · ")}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-8 border-t border-line pt-6">
            <h3 className="font-display text-lg font-semibold">Intégrations</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Google Classroom, Vids, Forms et NotebookLM alimentent le SoR pour
              des preuves d&apos;audit Qualiopi sans ressaisie.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
