"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusPill } from "@/components/ui";
import { DEFAULT_TVA, MANUAL_QUOTE_STATUSES, MAX_QUOTE_LINES } from "@/lib/business";
import { formatDate, formatDateTime, formatMoneyCents, statusLabel } from "@/lib/format";
import type { Client, Mission, Quote } from "@/lib/types";

/** 16 px : Safari sur iPhone ne zoome pas à la saisie. */
const input = "mt-1 block w-full border border-line bg-surface px-2 py-1.5 text-base";
const button = "bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50";

function quoteTone(status: Quote["status"]) {
  if (status === "accepte" || status === "facture") return "ok" as const;
  if (status === "refuse" || status === "expire") return "danger" as const;
  if (status === "envoye") return "nexus" as const;
  return "brand" as const;
}

function localDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("sv-SE");
}

const num = (v: string) => Number(v.replace(",", ".").replace(/\s/g, ""));

interface LineForm {
  designation: string;
  quantite: string;
  prixUnitaireHT: string;
}

const emptyLine = (): LineForm => ({ designation: "", quantite: "1", prixUnitaireHT: "" });

const emptyQuote = () => ({
  clientId: "",
  missionId: "",
  objet: "",
  tauxTva: String(DEFAULT_TVA),
  emisLe: localDay(),
  valableJusquau: localDay(30),
  status: "brouillon",
});

export function DevisClient({
  initialQuotes,
  clients,
  missions,
}: {
  initialQuotes: Quote[];
  clients: Client[];
  missions: Mission[];
}) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyQuote);
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);

  function send(method: "POST" | "PATCH", body: object, success: (data: Record<string, unknown>) => string, after?: () => void) {
    startTransition(async () => {
      try {
        const res = await fetch("/api/devis", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage({ ok: false, text: data.error ?? "Erreur" });
          return;
        }
        setMessage({ ok: true, text: success(data) });
        after?.();
        setQuotes((await fetch("/api/devis").then((r) => r.json())).quotes);
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "Connexion au serveur impossible." });
      }
    });
  }

  const totalHT = Math.round(lines.reduce((s, l) => s + (num(l.quantite) || 0) * (num(l.prixUnitaireHT) || 0), 0) * 100) / 100;
  const totalTTC = Math.round(totalHT * (1 + (num(form.tauxTva) || 0) / 100) * 100) / 100;
  const clientMissions = missions.filter((m) => m.clientId === form.clientId && m.statut !== "annulee");
  const setLine = (i: number, key: keyof LineForm, value: string) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, [key]: value } : l)));

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
        <button
          type="button"
          className={button}
          disabled={clients.length === 0}
          onClick={() => setCreating(!creating)}
          aria-expanded={creating}
        >
          {creating ? "Fermer" : "+ Nouveau devis"}
        </button>
        {clients.length === 0 ? <span className="text-ink-muted">Créez d&apos;abord un client (menu Clients).</span> : null}
      </div>

      {creating ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(
              "POST",
              {
                ...form,
                lignes: lines.map((l) => ({
                  designation: l.designation,
                  quantite: l.quantite,
                  prixUnitaireHT: l.prixUnitaireHT,
                })),
              },
              (data) => `Devis ${(data.quote as Quote).numero} créé`,
              () => {
                setForm(emptyQuote());
                setLines([emptyLine()]);
                setCreating(false);
              },
            );
          }}
          className="mb-10 grid max-w-3xl gap-4 border border-line bg-surface p-4 text-sm md:grid-cols-2"
        >
          <h2 className="font-display text-xl font-semibold md:col-span-2">Nouveau devis</h2>
          <label className="block">
            <span className="font-medium">
              Client<span className="text-danger"> *</span>
            </span>
            <select
              required
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value, missionId: "" })}
              className={input}
            >
              <option value="">— Choisir —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-medium">Mission</span>
            <select
              value={form.missionId}
              disabled={!form.clientId}
              onChange={(e) => setForm({ ...form, missionId: e.target.value })}
              className={input}
            >
              <option value="">— Aucune —</option>
              {clientMissions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.titre}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="font-medium">
              Objet<span className="text-danger"> *</span>
            </span>
            <input
              required
              maxLength={255}
              value={form.objet}
              onChange={(e) => setForm({ ...form, objet: e.target.value })}
              placeholder="ex. Secrétaire IA et standard téléphonique"
              className={input}
            />
          </label>

          <fieldset className="md:col-span-2">
            <legend className="font-medium">Lignes</legend>
            <ul className="mt-2 space-y-3">
              {lines.map((line, i) => (
                <li key={i} className="grid gap-2 border-b border-line pb-3 md:grid-cols-[1fr_6rem_8rem_auto] md:items-end">
                  <label className="block">
                    <span className="text-xs text-ink-muted">Désignation</span>
                    <input
                      required
                      maxLength={255}
                      value={line.designation}
                      onChange={(e) => setLine(i, "designation", e.target.value)}
                      className={input}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-ink-muted">Quantité</span>
                    <input
                      required
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      value={line.quantite}
                      onChange={(e) => setLine(i, "quantite", e.target.value)}
                      className={input}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-ink-muted">Prix unitaire HT (€)</span>
                    <input
                      required
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={line.prixUnitaireHT}
                      onChange={(e) => setLine(i, "prixUnitaireHT", e.target.value)}
                      className={input}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={lines.length === 1}
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    className="border border-line px-3 py-1.5 text-xs font-semibold hover:border-danger/40 disabled:opacity-40"
                    aria-label={`Retirer la ligne ${i + 1}`}
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={lines.length >= MAX_QUOTE_LINES}
              onClick={() => setLines([...lines, emptyLine()])}
              className="mt-3 border border-line px-3 py-1 text-xs font-semibold hover:border-brand/40"
            >
              + Ligne
            </button>
          </fieldset>

          <label className="block">
            <span className="font-medium">TVA (%)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="100"
              value={form.tauxTva}
              onChange={(e) => setForm({ ...form, tauxTva: e.target.value })}
              className={input}
            />
          </label>
          <p className="self-end text-ink-muted">
            Total {formatMoneyCents(totalHT)} HT · <span className="font-medium text-ink">{formatMoneyCents(totalTTC)} TTC</span>
          </p>
          <label className="block">
            <span className="font-medium">Date du devis</span>
            <input type="date" value={form.emisLe} onChange={(e) => setForm({ ...form, emisLe: e.target.value })} className={input} />
          </label>
          <label className="block">
            <span className="font-medium">Valable jusqu&apos;au</span>
            <input
              type="date"
              min={form.emisLe}
              value={form.valableJusquau}
              onChange={(e) => setForm({ ...form, valableJusquau: e.target.value })}
              className={input}
            />
          </label>
          <label className="block">
            <span className="font-medium">Statut</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={input}>
              <option value="brouillon">Brouillon (invisible pour le client)</option>
              <option value="envoye">Envoyé au client</option>
            </select>
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={pending} className={button}>
              Enregistrer le devis
            </button>
          </div>
        </form>
      ) : null}

      {quotes.length === 0 ? (
        <p className="border-y border-line py-6 text-sm text-ink-muted">Aucun devis pour l&apos;instant.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {quotes.map((quote) => (
            <li key={quote.id} className="py-5 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">
                    {quote.numero} · {quote.client}
                  </p>
                  <p className="text-ink-muted">{quote.objet}</p>
                </div>
                <StatusPill label={statusLabel(quote.status)} tone={quoteTone(quote.status)} />
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
                {quote.lignes.map((l, i) => (
                  <li key={i}>
                    {l.designation} — {String(l.quantite).replace(".", ",")} × {formatMoneyCents(l.prixUnitaireHT)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-ink-muted">
                {formatMoneyCents(quote.montantHT)} HT · TVA {String(quote.tauxTva).replace(".", ",")} % ·{" "}
                <span className="font-medium text-ink">{formatMoneyCents(quote.montantTTC)} TTC</span> · Du{" "}
                {formatDate(quote.emisLe)}, valable jusqu&apos;au {formatDate(quote.valableJusquau)}
              </p>
              {quote.reponduLe ? (
                <p className="mt-1 text-xs font-semibold text-nexus">
                  {quote.status === "refuse" ? "Refusé" : "Accepté"} par le client ({quote.reponduPar}) le{" "}
                  {formatDateTime(quote.reponduLe)}, depuis son espace
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {quote.status === "accepte" ? (
                  <button
                    type="button"
                    className={button}
                    disabled={pending}
                    onClick={() =>
                      send("POST", { action: "facturer", id: quote.id }, (data) => {
                        const inv = data.invoice as { numero: string };
                        return `Facture ${inv.numero} créée à partir du devis ${quote.numero}`;
                      })
                    }
                  >
                    Créer la facture
                  </button>
                ) : null}
                {quote.status !== "facture" ? (
                  <select
                    aria-label={`Statut de ${quote.numero}`}
                    value={(MANUAL_QUOTE_STATUSES as readonly string[]).includes(quote.status) ? quote.status : ""}
                    disabled={pending}
                    onChange={(e) => {
                      // Valeur lue tout de suite : la liste revient à l'ancien statut avant la réponse.
                      const status = e.target.value;
                      if (status) send("PATCH", { id: quote.id, status }, () => `${quote.numero} : ${statusLabel(status)}`);
                    }}
                    className="border border-line bg-surface px-2 py-1 text-base"
                  >
                    {(MANUAL_QUOTE_STATUSES as readonly string[]).includes(quote.status) ? null : (
                      <option value="">{statusLabel(quote.status)}</option>
                    )}
                    {MANUAL_QUOTE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-ink-muted">Facture créée : voir Factures.</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
