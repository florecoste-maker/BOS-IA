"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusPill } from "@/components/ui";
import { DEFAULT_TVA, MANUAL_INVOICE_STATUSES, PAYMENT_MODES, RECURRENCES } from "@/lib/business";
import { formatDate, formatMoneyCents, paymentModeLabel, statusLabel } from "@/lib/format";
import type { Client, Invoice, Mission, Payment } from "@/lib/types";

/** 16 px : Safari sur iPhone ne zoome pas à la saisie. */
const input = "mt-1 block w-full border border-line bg-surface px-2 py-1.5 text-base";
const button = "bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50";

function invoiceTone(status: Invoice["status"]) {
  if (status === "payee") return "ok" as const;
  if (status === "relance" || status === "impayee" || status === "annulee") return "danger" as const;
  if (status === "partiellement_payee") return "warn" as const;
  return "brand" as const;
}

/** Date locale du navigateur (AAAA-MM-JJ), pas UTC. */
function localDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("sv-SE");
}

type Form = Record<string, string>;

const emptyInvoice = (): Form => ({
  clientId: "",
  missionId: "",
  objet: "",
  montantHT: "",
  tauxTva: String(DEFAULT_TVA),
  emiseLe: localDay(),
  echeance: localDay(30),
  status: "emise",
  recurrence: "",
  numero: "",
});

function htToTtc(ht: string, tva: string) {
  const h = Number(ht.replace(",", "."));
  const t = Number(tva.replace(",", "."));
  return Number.isFinite(h) && Number.isFinite(t) ? Math.round(h * (1 + t / 100) * 100) / 100 : null;
}

export function FinanceClient({
  initialInvoices,
  initialPayments,
  clients,
  missions,
}: {
  initialInvoices: Invoice[];
  initialPayments: Payment[];
  clients: Client[];
  missions: Mission[];
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [payments, setPayments] = useState(initialPayments);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // Indicateurs calculés côté serveur : rechargés après chaque saisie.
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Form>(emptyInvoice);
  const [paying, setPaying] = useState<{ id: string; form: Form } | null>(null);
  const [filter, setFilter] = useState<"ouvertes" | "toutes">("ouvertes");

  async function refresh() {
    const data = await fetch("/api/finance").then((r) => r.json());
    setInvoices(data.invoices);
    setPayments(data.payments);
  }

  function send(method: "POST" | "PATCH", body: object, success: (data: Record<string, unknown>) => string, after?: () => void) {
    startTransition(async () => {
      try {
        const res = await fetch("/api/finance", {
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
        await refresh();
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "Connexion au serveur impossible." });
      }
    });
  }

  const on = (key: string) => (e: { target: { value: string } }) => {
    const next = { ...form, [key]: e.target.value };
    // Changer de client vide la mission choisie (elle appartient à l'ancien client).
    if (key === "clientId") next.missionId = "";
    setForm(next);
  };
  const clientMissions = missions.filter((m) => m.clientId === form.clientId && m.statut !== "annulee");
  const preview = htToTtc(form.montantHT, form.tauxTva);
  const open = invoices.filter((i) => i.status !== "payee" && i.status !== "annulee");
  const shown = filter === "ouvertes" ? open : invoices;
  const paymentsByInvoice = (id: string) => payments.filter((p) => p.factureId === id);

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
          {creating ? "Fermer" : "+ Nouvelle facture"}
        </button>
        {clients.length === 0 ? (
          <span className="text-ink-muted">Créez d&apos;abord un client (menu Clients).</span>
        ) : null}
        <label className="flex items-center gap-2 text-ink-muted">
          Afficher
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="border border-line bg-surface px-2 py-1 text-base"
          >
            <option value="ouvertes">À encaisser ({open.length})</option>
            <option value="toutes">Toutes ({invoices.length})</option>
          </select>
        </label>
      </div>

      {creating ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(
              "POST",
              { action: "facture", ...form },
              (data) => `Facture ${(data.invoice as Invoice).numero} créée`,
              () => {
                setForm(emptyInvoice());
                setCreating(false);
              },
            );
          }}
          className="mb-10 grid max-w-3xl gap-4 border border-line bg-surface p-4 text-sm md:grid-cols-2"
        >
          <h2 className="font-display text-xl font-semibold md:col-span-2">Nouvelle facture</h2>
          <label className="block">
            <span className="font-medium">
              Client<span className="text-danger"> *</span>
            </span>
            <select required value={form.clientId} onChange={on("clientId")} className={input}>
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
            <select value={form.missionId} onChange={on("missionId")} disabled={!form.clientId} className={input}>
              <option value="">— Aucune —</option>
              {clientMissions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.titre}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="font-medium">Objet</span>
            <input value={form.objet} onChange={on("objet")} maxLength={255} placeholder="ex. Agent IA — acompte 30 %" className={input} />
          </label>
          <label className="block">
            <span className="font-medium">
              Montant HT (€)<span className="text-danger"> *</span>
            </span>
            <input required type="number" inputMode="decimal" step="0.01" min="0.01" value={form.montantHT} onChange={on("montantHT")} className={input} />
          </label>
          <label className="block">
            <span className="font-medium">TVA (%)</span>
            <input type="number" inputMode="decimal" step="0.1" min="0" max="100" value={form.tauxTva} onChange={on("tauxTva")} className={input} />
            <span className="mt-1 block text-xs text-ink-muted">
              {preview !== null && form.montantHT ? `Soit ${formatMoneyCents(preview)} TTC` : "20 par défaut, 0 en franchise de TVA"}
            </span>
          </label>
          <label className="block">
            <span className="font-medium">Émise le</span>
            <input type="date" value={form.emiseLe} onChange={on("emiseLe")} className={input} />
          </label>
          <label className="block">
            <span className="font-medium">
              Échéance<span className="text-danger"> *</span>
            </span>
            <input required type="date" min={form.emiseLe} value={form.echeance} onChange={on("echeance")} className={input} />
          </label>
          <label className="block">
            <span className="font-medium">Statut</span>
            <select value={form.status} onChange={on("status")} className={input}>
              <option value="emise">Émise (envoyée au client)</option>
              <option value="brouillon">Brouillon</option>
            </select>
          </label>
          <label className="block">
            <span className="font-medium">Abonnement</span>
            <select value={form.recurrence} onChange={on("recurrence")} className={input}>
              <option value="">Non (facture ponctuelle)</option>
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="font-medium">Numéro</span>
            <input value={form.numero} onChange={on("numero")} maxLength={64} placeholder="Vide : FA-AAAA-NNNN attribué automatiquement" className={input} />
            <span className="mt-1 block text-xs text-ink-muted">
              Si vous éditez vos factures dans un autre logiciel, reprenez son numéro.
            </span>
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={pending} className={button}>
              Enregistrer la facture
            </button>
          </div>
        </form>
      ) : null}

      {shown.length === 0 ? (
        <p className="border-y border-line py-6 text-sm text-ink-muted">
          {invoices.length === 0 ? "Aucune facture pour l'instant." : "Aucune facture à encaisser."}
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {shown.map((invoice) => {
            const received = paymentsByInvoice(invoice.id);
            const canPay = !["brouillon", "annulee", "payee"].includes(invoice.status) && invoice.resteDu > 0;
            const isPaying = paying?.id === invoice.id;
            return (
              <li key={invoice.id} className="py-5 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">
                      {invoice.numero} · {invoice.client}
                    </p>
                    {invoice.objet ? <p className="text-ink-muted">{invoice.objet}</p> : null}
                  </div>
                  <StatusPill label={statusLabel(invoice.status)} tone={invoiceTone(invoice.status)} />
                </div>
                <p className="mt-2 text-ink-muted">
                  {formatMoneyCents(invoice.montantHT)} HT · TVA {String(invoice.tauxTva).replace(".", ",")} % ·{" "}
                  <span className="font-medium text-ink">{formatMoneyCents(invoice.montantTTC)} TTC</span>
                  {invoice.recurrence ? ` · Abonnement ${invoice.recurrence}` : ""}
                </p>
                <p className="text-ink-muted">
                  Émise {formatDate(invoice.emiseLe)} · Échéance {formatDate(invoice.echeance)}
                  {invoice.joursRetard > 0 ? <span className="text-danger"> · Retard {invoice.joursRetard} j</span> : ""}
                  {invoice.payeeLe ? ` · Soldée le ${formatDate(invoice.payeeLe)}` : ""}
                </p>
                <p className="text-ink-muted">
                  Reçu {formatMoneyCents(invoice.montantPaye)}
                  {invoice.status !== "annulee" ? (
                    <>
                      {" "}
                      · Reste dû <span className="font-medium text-ink">{formatMoneyCents(invoice.resteDu)}</span>
                    </>
                  ) : null}
                  {invoice.emailClient ? "" : " · Pas d'e-mail client : relance par e-mail impossible"}
                </p>

                {received.length ? (
                  <ul className="mt-2 space-y-0.5 border-l-2 border-ok/40 pl-3 text-xs text-ink-muted">
                    {received.map((p) => (
                      <li key={p.id}>
                        {formatDate(p.date)} · {formatMoneyCents(p.montant)} · {paymentModeLabel(p.mode)}
                        {p.reference ? ` · ${p.reference}` : ""} <span className="opacity-70">({p.numero})</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canPay ? (
                    <button
                      type="button"
                      className={button}
                      disabled={pending}
                      onClick={() =>
                        setPaying(
                          isPaying
                            ? null
                            : {
                                id: invoice.id,
                                form: { montant: String(invoice.resteDu), date: localDay(), mode: "virement", reference: "" },
                              },
                        )
                      }
                    >
                      {isPaying ? "Annuler" : "Enregistrer un paiement"}
                    </button>
                  ) : null}
                  {invoice.status !== "payee" ? (
                    <select
                      aria-label={`Statut de ${invoice.numero}`}
                      value={(MANUAL_INVOICE_STATUSES as readonly string[]).includes(invoice.status) ? invoice.status : ""}
                      disabled={pending}
                      onChange={(e) =>
                        e.target.value &&
                        send(
                          "PATCH",
                          { invoiceId: invoice.id, status: e.target.value },
                          () => `${invoice.numero} : ${statusLabel(e.target.value)}`,
                        )
                      }
                      className="border border-line bg-surface px-2 py-1 text-base"
                    >
                      {(MANUAL_INVOICE_STATUSES as readonly string[]).includes(invoice.status) ? null : (
                        <option value="">{statusLabel(invoice.status)}</option>
                      )}
                      {MANUAL_INVOICE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>

                {isPaying ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send(
                        "POST",
                        { action: "paiement", factureId: invoice.id, ...paying.form },
                        (data) => {
                          const updated = data.invoice as Invoice;
                          return updated.status === "payee"
                            ? `${invoice.numero} soldée`
                            : `Paiement enregistré : reste ${formatMoneyCents(updated.resteDu)} sur ${invoice.numero}`;
                        },
                        () => setPaying(null),
                      );
                    }}
                    className="mt-3 grid max-w-3xl gap-4 border border-line bg-surface p-4 md:grid-cols-2"
                  >
                    <label className="block">
                      <span className="font-medium">Montant reçu TTC (€)</span>
                      <input
                        required
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0.01"
                        max={invoice.resteDu}
                        value={paying.form.montant}
                        onChange={(e) => setPaying({ id: invoice.id, form: { ...paying.form, montant: e.target.value } })}
                        className={input}
                      />
                    </label>
                    <label className="block">
                      <span className="font-medium">Reçu le</span>
                      <input
                        type="date"
                        max={localDay()}
                        value={paying.form.date}
                        onChange={(e) => setPaying({ id: invoice.id, form: { ...paying.form, date: e.target.value } })}
                        className={input}
                      />
                    </label>
                    <label className="block">
                      <span className="font-medium">Mode</span>
                      <select
                        value={paying.form.mode}
                        onChange={(e) => setPaying({ id: invoice.id, form: { ...paying.form, mode: e.target.value } })}
                        className={input}
                      >
                        {PAYMENT_MODES.map((m) => (
                          <option key={m} value={m}>
                            {paymentModeLabel(m)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="font-medium">Référence (facultatif)</span>
                      <input
                        value={paying.form.reference}
                        maxLength={255}
                        onChange={(e) => setPaying({ id: invoice.id, form: { ...paying.form, reference: e.target.value } })}
                        className={input}
                      />
                    </label>
                    <div className="md:col-span-2">
                      <button type="submit" disabled={pending} className={button}>
                        Enregistrer le paiement
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
