"use client";

import { useState, useTransition } from "react";
import { StatusPill } from "@/components/ui";
import { formatDate, formatMoney, statusLabel } from "@/lib/format";
import type { Invoice, OpcoDossier } from "@/lib/types";

function dossierTone(status: OpcoDossier["status"]) {
  if (status === "paye" || status === "accepte") return "ok" as const;
  if (status === "refuse") return "danger" as const;
  if (status === "completude") return "warn" as const;
  return "brand" as const;
}

function invoiceTone(status: Invoice["status"]) {
  if (status === "payee") return "ok" as const;
  if (status === "relance" || status === "impayee") return "danger" as const;
  if (status === "acompte_paye") return "warn" as const;
  return "brand" as const;
}

export function FinanceClient({
  initialDossiers,
  initialInvoices,
}: {
  initialDossiers: OpcoDossier[];
  initialInvoices: Invoice[];
}) {
  const [dossiers, setDossiers] = useState(initialDossiers);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Date locale du navigateur (AAAA-MM-JJ), pas UTC.
  const today = new Date().toLocaleDateString("sv-SE");
  const [paidDates, setPaidDates] = useState<Record<string, string>>({});

  function markPaid(invoice: Invoice) {
    const payeeLe = paidDates[invoice.id] ?? today;
    startTransition(async () => {
      const res = await fetch("/api/finance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, action: "payee", payeeLe }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Erreur");
        return;
      }
      setMessage(`Facture ${invoice.numero} payée le ${formatDate(payeeLe)}`);
      const refreshed = await fetch("/api/finance").then((r) => r.json());
      setDossiers(refreshed.dossiers);
      setInvoices(refreshed.invoices);
    });
  }

  function completeDossier(id: string) {
    startTransition(async () => {
      const res = await fetch("/api/finance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId: id, action: "complete" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Erreur");
        return;
      }
      setMessage(`Dossier ${data.dossier.reference} transmis à l'OPCO`);
      const refreshed = await fetch("/api/finance").then((r) => r.json());
      setDossiers(refreshed.dossiers);
      setInvoices(refreshed.invoices);
    });
  }

  return (
    <>
      {message ? (
        <p className="mb-6 border-l-2 border-accent bg-accent-soft/60 px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}

      <section className="grid gap-12 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-xl font-semibold">Dossiers OPCO</h2>
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {dossiers.map((dossier) => (
              <li key={dossier.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{dossier.reference}</p>
                    <p className="text-sm text-ink-muted">
                      {dossier.organisme} · {formatMoney(dossier.montant)}
                    </p>
                  </div>
                  <StatusPill
                    label={statusLabel(dossier.status)}
                    tone={dossierTone(dossier.status)}
                  />
                </div>
                <div className="mt-3">
                  <div className="h-1.5 w-full bg-bg-deep">
                    <div
                      className="h-1.5 bg-brand transition-all"
                      style={{ width: `${dossier.completude}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    Complétude {dossier.completude}%
                    {dossier.piecesManquantes.length
                      ? ` · Manque : ${dossier.piecesManquantes.join(", ")}`
                      : ""}
                  </p>
                </div>
                {dossier.completude < 100 ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => completeDossier(dossier.id)}
                    className="mt-3 bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
                  >
                    Compléter & transmettre
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="font-display text-xl font-semibold">Facturation</h2>
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{invoice.numero}</p>
                    <p className="text-sm text-ink-muted">
                      {invoice.client} · Acompte {invoice.acomptePct}% / solde{" "}
                      {100 - invoice.acomptePct}%
                    </p>
                  </div>
                  <StatusPill
                    label={statusLabel(invoice.status)}
                    tone={invoiceTone(invoice.status)}
                  />
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  {formatMoney(invoice.montantHT)} HT · Émise{" "}
                  {formatDate(invoice.emiseLe)} · Échéance{" "}
                  {formatDate(invoice.echeance)}
                  {invoice.joursRetard > 0
                    ? ` · Retard ${invoice.joursRetard} j`
                    : ""}
                  {invoice.payeeLe ? ` · Payée le ${formatDate(invoice.payeeLe)}` : ""}
                  {invoice.recurrence ? ` · Abonnement ${invoice.recurrence}` : ""}
                </p>
                {invoice.payeeLe || invoice.status === "brouillon" ? null : (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <label className="flex items-center gap-1 text-ink-muted">
                      Payée le
                      <input
                        type="date"
                        value={paidDates[invoice.id] ?? today}
                        max={today}
                        min={invoice.emiseLe}
                        disabled={pending}
                        onChange={(e) => setPaidDates({ ...paidDates, [invoice.id]: e.target.value })}
                        className="border border-line bg-surface px-1 py-0.5"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => markPaid(invoice)}
                      className="bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
                    >
                      Marquer payée
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
