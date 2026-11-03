import { FinanceClient } from "@/components/finance-client";
import { Metric, SectionTitle } from "@/components/ui";
import { getRepository } from "@/lib/data";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const repo = await getRepository();
  const [invoices, payments, clients, missions, metrics] = await Promise.all([
    repo.getInvoices(),
    repo.getPayments(),
    repo.getClients(),
    repo.getMissions(),
    repo.getMetrics(),
  ]);
  return (
    <>
      <SectionTitle
        eyebrow="Finance"
        title="Factures et paiements"
        description="Suivi des factures émises et des règlements reçus (acomptes, soldes, abonnements). Une facture passe en « payée » quand ses paiements atteignent le montant TTC."
      />
      <section className="mb-10 grid gap-6 border-y border-line bg-surface/60 py-6 md:grid-cols-3 md:gap-0">
        <Metric label="À encaisser" value={formatMoney(metrics.aEncaisser)} hint="Reste dû TTC, factures émises" />
        <Metric
          label="En retard"
          value={String(metrics.facturesEnRetard)}
          hint={metrics.facturesEnRetard > 1 ? "Factures échues non soldées" : "Facture échue non soldée"}
        />
        <Metric label="Encaissé ce mois-ci" value={formatMoney(metrics.encaisseMois)} hint="Paiements reçus (TTC)" />
      </section>
      <FinanceClient initialInvoices={invoices} initialPayments={payments} clients={clients} missions={missions} />
      <p className="mt-8 max-w-2xl text-xs text-ink-muted">
        BOS-IA suit vos factures et vos encaissements ; il ne produit pas la facture légale (PDF) envoyée au client.
        Si vous utilisez un logiciel de facturation, reprenez ici le même numéro.
      </p>
    </>
  );
}
