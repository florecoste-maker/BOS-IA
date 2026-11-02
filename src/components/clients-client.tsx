"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusPill } from "@/components/ui";
import { CLIENT_STATUSES, MISSION_STATUSES, MISSION_TYPES } from "@/lib/business";
import { formatDate, formatMoney, missionTypeLabel, statusLabel } from "@/lib/format";
import type { Client, Mission } from "@/lib/types";

/** 16 px : Safari sur iPhone ne zoome pas à la saisie. */
const input = "mt-1 block w-full border border-line bg-surface px-2 py-1.5 text-base";
const button = "bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50";
const small = "border border-line px-3 py-1 text-xs font-semibold hover:border-brand/40 disabled:opacity-50";

function clientTone(statut: Client["statut"]) {
  if (statut === "actif") return "ok" as const;
  if (statut === "perdu") return "danger" as const;
  if (statut === "inactif") return "warn" as const;
  return "brand" as const;
}

function missionTone(statut: Mission["statut"]) {
  if (statut === "terminee" || statut === "livree") return "ok" as const;
  if (statut === "annulee") return "danger" as const;
  if (statut === "en_cours") return "nexus" as const;
  return "brand" as const;
}

type Form = Record<string, string>;

const emptyClient: Form = { nom: "", contact: "", email: "", telephone: "", secteur: "", statut: "prospect", source: "", notes: "" };
const emptyMission: Form = { titre: "", type: "agent_ia", statut: "proposition", montantHT: "", debut: "", fin: "", notes: "" };

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="font-medium">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoCapitalize={type === "email" ? "none" : undefined}
        autoCorrect={type === "email" ? "off" : undefined}
        inputMode={type === "number" ? "decimal" : undefined}
        step={type === "number" ? "0.01" : undefined}
        min={type === "number" ? "0" : undefined}
        className={input}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={input}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

const clientStatusOptions = CLIENT_STATUSES.map((s) => [s, statusLabel(s)] as [string, string]);
const missionStatusOptions = MISSION_STATUSES.map((s) => [s, statusLabel(s)] as [string, string]);
const missionTypeOptions = MISSION_TYPES.map((t) => [t, missionTypeLabel(t)] as [string, string]);

function ClientFields({ form, set }: { form: Form; set: (f: Form) => void }) {
  const on = (key: string) => (v: string) => set({ ...form, [key]: v });
  return (
    <>
      <Field label="Entreprise" required value={form.nom} onChange={on("nom")} />
      <Field label="Contact" value={form.contact} onChange={on("contact")} />
      <Field label="E-mail" type="email" value={form.email} onChange={on("email")} />
      <Field label="Téléphone" type="tel" value={form.telephone} onChange={on("telephone")} />
      <Field label="Secteur" value={form.secteur} onChange={on("secteur")} />
      <Field label="Source (site, recommandation…)" value={form.source} onChange={on("source")} />
      <Select label="Statut" value={form.statut} onChange={on("statut")} options={clientStatusOptions} />
      <label className="block md:col-span-2">
        <span className="font-medium">Notes</span>
        <textarea value={form.notes} onChange={(e) => on("notes")(e.target.value)} rows={3} className={input} />
      </label>
    </>
  );
}

function MissionFields({ form, set }: { form: Form; set: (f: Form) => void }) {
  const on = (key: string) => (v: string) => set({ ...form, [key]: v });
  return (
    <>
      <Field label="Intitulé" required value={form.titre} onChange={on("titre")} className="md:col-span-2" />
      <Select label="Type" value={form.type} onChange={on("type")} options={missionTypeOptions} />
      <Select label="Statut" value={form.statut} onChange={on("statut")} options={missionStatusOptions} />
      <Field label="Montant HT (€)" type="number" value={form.montantHT} onChange={on("montantHT")} />
      <span className="hidden md:block" />
      <Field label="Début" type="date" value={form.debut} onChange={on("debut")} />
      <Field label="Livraison / fin prévue" type="date" value={form.fin} onChange={on("fin")} />
      <label className="block md:col-span-2">
        <span className="font-medium">Notes</span>
        <textarea value={form.notes} onChange={(e) => on("notes")(e.target.value)} rows={2} className={input} />
      </label>
    </>
  );
}

const toForm = (c: Client): Form => ({
  nom: c.nom,
  contact: c.contact ?? "",
  email: c.email ?? "",
  telephone: c.telephone ?? "",
  secteur: c.secteur ?? "",
  statut: c.statut,
  source: c.source ?? "",
  notes: c.notes ?? "",
});

const missionToForm = (m: Mission): Form => ({
  titre: m.titre,
  type: m.type,
  statut: m.statut,
  montantHT: String(m.montantHT),
  debut: m.debut ?? "",
  fin: m.fin ?? "",
  notes: m.notes ?? "",
});

export function ClientsClient({
  initialClients,
  initialMissions,
}: {
  initialClients: Client[];
  initialMissions: Mission[];
}) {
  const [clients, setClients] = useState(initialClients);
  const [missions, setMissions] = useState(initialMissions);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // Indicateurs calculés côté serveur : rechargés après chaque saisie.
  const router = useRouter();
  const [newClient, setNewClient] = useState<Form>(emptyClient);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{ id: string; form: Form } | null>(null);
  const [missionFor, setMissionFor] = useState<{ clientId: string; form: Form } | null>(null);
  const [missionEdit, setMissionEdit] = useState<{ id: string; form: Form } | null>(null);
  const [filter, setFilter] = useState<"tous" | Client["statut"]>("tous");

  async function refresh() {
    const data = await fetch("/api/clients").then((r) => r.json());
    setClients(data.clients);
    setMissions(data.missions);
  }

  function send(url: string, method: "POST" | "PATCH", body: object, success: string, after?: () => void) {
    startTransition(async () => {
      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage({ ok: false, text: data.error ?? "Erreur" });
          return;
        }
        setMessage({ ok: true, text: success });
        after?.();
        await refresh();
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "Connexion au serveur impossible." });
      }
    });
  }

  const shown = filter === "tous" ? clients : clients.filter((c) => c.statut === filter);

  return (
    <>
      {message ? (
        <p
          role="status"
          className={`mb-6 border-l-2 bg-surface px-3 py-2 text-sm ${message.ok ? "border-nexus" : "border-danger"}`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className={button} onClick={() => setCreating(!creating)} aria-expanded={creating}>
          {creating ? "Fermer" : "+ Nouveau client"}
        </button>
        <label className="flex items-center gap-2 text-ink-muted">
          Afficher
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="border border-line bg-surface px-2 py-1 text-base"
          >
            <option value="tous">Tous ({clients.length})</option>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)} ({clients.filter((c) => c.statut === s).length})
              </option>
            ))}
          </select>
        </label>
      </div>

      {creating ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send("/api/clients", "POST", newClient, `Client « ${newClient.nom.trim()} » créé`, () => {
              setNewClient(emptyClient);
              setCreating(false);
            });
          }}
          className="mb-10 grid max-w-3xl gap-4 border border-line bg-surface p-4 text-sm md:grid-cols-2"
        >
          <h2 className="font-display text-xl font-semibold md:col-span-2">Nouveau client</h2>
          <ClientFields form={newClient} set={setNewClient} />
          <div className="md:col-span-2">
            <button type="submit" disabled={pending} className={button}>
              Enregistrer le client
            </button>
          </div>
        </form>
      ) : null}

      {shown.length === 0 ? (
        <p className="border-y border-line py-6 text-sm text-ink-muted">
          {clients.length === 0
            ? "Aucun client pour l'instant. Ajoutez votre premier client ou prospect avec « + Nouveau client »."
            : "Aucun client avec ce statut."}
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {shown.map((client) => {
            const own = missions.filter((m) => m.clientId === client.id);
            const isEditing = editing?.id === client.id;
            return (
              <li key={client.id} className="py-5 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-semibold text-ink">{client.nom}</p>
                    <p className="text-ink-muted">
                      {[client.contact, client.secteur].filter(Boolean).join(" · ") || "Contact non renseigné"}
                    </p>
                    <p className="text-ink-muted">
                      {client.email ? (
                        <a href={`mailto:${client.email}`} className="text-brand hover:text-brand-deep">
                          {client.email}
                        </a>
                      ) : (
                        <span className="text-warn">Pas d&apos;e-mail : relances impossibles</span>
                      )}
                      {client.telephone ? ` · ${client.telephone}` : ""}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {client.source ? `Source : ${client.source} · ` : ""}Dernière activité{" "}
                      {formatDate(client.derniereActivite)}
                    </p>
                  </div>
                  <StatusPill label={statusLabel(client.statut)} tone={clientTone(client.statut)} />
                </div>
                {client.notes && !isEditing ? (
                  <p className="mt-2 whitespace-pre-line text-ink-muted">{client.notes}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Statut de ${client.nom}`}
                    value={client.statut}
                    disabled={pending}
                    onChange={(e) =>
                      send(
                        "/api/clients",
                        "PATCH",
                        { id: client.id, statut: e.target.value },
                        `${client.nom} : ${statusLabel(e.target.value)}`,
                      )
                    }
                    className="border border-line bg-surface px-2 py-1 text-base"
                  >
                    {CLIENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={small}
                    onClick={() => setEditing(isEditing ? null : { id: client.id, form: toForm(client) })}
                  >
                    {isEditing ? "Annuler" : "Modifier la fiche"}
                  </button>
                  <button
                    type="button"
                    className={small}
                    onClick={() =>
                      setMissionFor(missionFor?.clientId === client.id ? null : { clientId: client.id, form: emptyMission })
                    }
                  >
                    {missionFor?.clientId === client.id ? "Annuler la mission" : "+ Mission"}
                  </button>
                </div>

                {isEditing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send("/api/clients", "PATCH", { id: client.id, ...editing.form }, "Fiche enregistrée", () =>
                        setEditing(null),
                      );
                    }}
                    className="mt-4 grid max-w-3xl gap-4 border border-line bg-surface p-4 md:grid-cols-2"
                  >
                    <ClientFields form={editing.form} set={(form) => setEditing({ id: client.id, form })} />
                    <div className="md:col-span-2">
                      <button type="submit" disabled={pending} className={button}>
                        Enregistrer
                      </button>
                    </div>
                  </form>
                ) : null}

                {missionFor?.clientId === client.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send(
                        "/api/missions",
                        "POST",
                        { clientId: client.id, ...missionFor.form },
                        `Mission « ${missionFor.form.titre.trim()} » créée`,
                        () => setMissionFor(null),
                      );
                    }}
                    className="mt-4 grid max-w-3xl gap-4 border border-line bg-surface p-4 md:grid-cols-2"
                  >
                    <h3 className="font-display text-lg font-semibold md:col-span-2">Nouvelle mission — {client.nom}</h3>
                    <MissionFields form={missionFor.form} set={(form) => setMissionFor({ clientId: client.id, form })} />
                    <div className="md:col-span-2">
                      <button type="submit" disabled={pending} className={button}>
                        Créer la mission
                      </button>
                    </div>
                  </form>
                ) : null}

                {own.length ? (
                  <ul className="mt-4 space-y-3 border-l-2 border-brand/30 pl-4">
                    {own.map((mission) => (
                      <li key={mission.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-ink">
                            {mission.titre} <span className="text-xs text-ink-muted">{mission.code}</span>
                          </p>
                          <StatusPill label={statusLabel(mission.statut)} tone={missionTone(mission.statut)} />
                        </div>
                        <p className="text-ink-muted">
                          {missionTypeLabel(mission.type)} · {formatMoney(mission.montantHT)} HT
                          {mission.debut ? ` · Début ${formatDate(mission.debut)}` : ""}
                          {mission.fin ? ` · Fin prévue ${formatDate(mission.fin)}` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select
                            aria-label={`Statut de la mission ${mission.code}`}
                            value={mission.statut}
                            disabled={pending}
                            onChange={(e) =>
                              send(
                                "/api/missions",
                                "PATCH",
                                { id: mission.id, statut: e.target.value },
                                `${mission.code} : ${statusLabel(e.target.value)}`,
                              )
                            }
                            className="border border-line bg-surface px-2 py-1 text-base"
                          >
                            {MISSION_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {statusLabel(s)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={small}
                            onClick={() =>
                              setMissionEdit(
                                missionEdit?.id === mission.id ? null : { id: mission.id, form: missionToForm(mission) },
                              )
                            }
                          >
                            {missionEdit?.id === mission.id ? "Annuler" : "Modifier"}
                          </button>
                        </div>
                        {missionEdit?.id === mission.id ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              send(
                                "/api/missions",
                                "PATCH",
                                { id: mission.id, ...missionEdit.form },
                                "Mission enregistrée",
                                () => setMissionEdit(null),
                              );
                            }}
                            className="mt-3 grid max-w-3xl gap-4 border border-line bg-surface p-4 md:grid-cols-2"
                          >
                            <MissionFields
                              form={missionEdit.form}
                              set={(form) => setMissionEdit({ id: mission.id, form })}
                            />
                            <div className="md:col-span-2">
                              <button type="submit" disabled={pending} className={button}>
                                Enregistrer
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
