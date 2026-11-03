import Link from "next/link";
import { Metric, SectionTitle, StatusPill } from "@/components/ui";
import { formatDate, formatMoney, statusLabel } from "@/lib/format";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repo = await getRepository();
  const [metrics, clients, missions, invoices, actions] = await Promise.all([
    repo.getMetrics(),
    repo.getClients(),
    repo.getMissions(),
    repo.getInvoices(),
    repo.getAgentActions(),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.nom]));
  const active = missions.filter((m) => m.statut === "en_cours" || m.statut === "signee");
  const late = invoices.filter((i) => i.joursRetard > 0).sort((a, b) => b.joursRetard - a.joursRetard);
  const hitl = actions.filter((a) => a.requiresHitl && a.hitlStatus === "pending");
  const empty = clients.length === 0;

  return (
    <>
      <SectionTitle
        eyebrow="Cockpit Jamaliance"
        title="Pilotage BOS-IA"
        description="Moteur opérationnel de l'agence (app.jamaliance.com) : clients, missions, factures, paiements et agents IA. La vitrine reste sur jamaliance.com. Vous validez les actions à risque."
      />

      {empty ? (
        <p className="mb-8 max-w-2xl border-l-2 border-brand bg-surface px-3 py-2 text-sm">
          Pour commencer : ajoutez votre premier client ou prospect dans{" "}
          <Link href="/app/clients" className="font-semibold text-brand hover:text-brand-deep">
            Clients
          </Link>
          , puis ses missions et ses factures. Les indicateurs et les agents IA s&apos;appuient sur ces données.
        </p>
      ) : null}

      <section className="grid gap-6 border-y border-line bg-surface/60 py-6 md:grid-cols-4 md:gap-0">
        <Metric
          label="Clients actifs"
          value={String(metrics.clientsActifs)}
          hint={`${metrics.prospects} prospect${metrics.prospects > 1 ? "s" : ""}`}
        />
        <Metric
          label="Missions en cours"
          value={String(metrics.missionsEnCours)}
          hint={`Carnet de commandes ${formatMoney(metrics.carnetCommandes)} HT`}
        />
        <Metric
          label="À encaisser"
          value={formatMoney(metrics.aEncaisser)}
          hint={
            metrics.facturesEnRetard
              ? `${metrics.facturesEnRetard} facture${metrics.facturesEnRetard > 1 ? "s" : ""} en retard`
              : metrics.delaiPaiementMoyen === null
                ? "Aucun retard"
                : `Aucun retard · paiement moyen ${metrics.delaiPaiementMoyen} j`
          }
        />
        <Metric
          label="MRR"
          value={metrics.mrr === null ? "—" : formatMoney(metrics.mrr)}
          hint={
            metrics.mrr === null
              ? "Aucune facture d'abonnement"
              : `${metrics.abonnementsActifs} abonnement${metrics.abonnementsActifs > 1 ? "s" : ""} en cours`
          }
        />
      </section>

      <section className="mt-12 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-xl font-semibold">Missions signées et en cours</h2>
          <ul className="mt-5 space-y-4">
            {active.length === 0 ? (
              <li className="text-sm text-ink-muted">Aucune mission en cours.</li>
            ) : (
              active.map((mission) => (
                <li key={mission.id} className="border-b border-line pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-ink">{mission.titre}</p>
                    <StatusPill label={statusLabel(mission.statut)} tone={mission.statut === "en_cours" ? "nexus" : "brand"} />
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    {clientName.get(mission.clientId) ?? "—"} · {formatMoney(mission.montantHT)} HT
                    {mission.fin ? ` · Fin prévue ${formatDate(mission.fin)}` : ""}
                  </p>
                </li>
              ))
            )}
          </ul>
          {late.length ? (
            <>
              <h2 className="mt-10 font-display text-xl font-semibold">Factures en retard</h2>
              <ul className="mt-5 space-y-3">
                {late.slice(0, 5).map((invoice) => (
                  <li key={invoice.id} className="border-b border-line pb-3 text-sm">
                    <span className="font-medium text-ink">{invoice.numero}</span> · {invoice.client} ·{" "}
                    {formatMoney(invoice.resteDu)} TTC · <span className="text-danger">{invoice.joursRetard} j</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <Link href="/app/clients" className="mt-5 inline-flex text-sm font-semibold text-brand hover:text-brand-deep">
            Ouvrir les clients →
          </Link>
        </div>

        <div>
          <h2 className="font-display text-xl font-semibold">Validations humaines (HITL)</h2>
          <ul className="mt-5 space-y-4">
            {hitl.length === 0 ? (
              <li className="text-sm text-ink-muted">Aucune action en attente.</li>
            ) : (
              hitl.map((action) => (
                <li key={action.id} className="border-b border-line pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill label="HITL" tone="warn" />
                    <span className="text-sm font-medium">{action.type}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{action.description}</p>
                </li>
              ))
            )}
          </ul>
          <Link href="/app/agents" className="mt-5 inline-flex text-sm font-semibold text-nexus hover:opacity-80">
            Superviser les agents →
          </Link>
        </div>
      </section>

      <section className="mt-14 grid gap-6 border-t border-line pt-10 md:grid-cols-2 lg:grid-cols-4">
        <ModuleLink href="/app/clients" title="Clients" text="Prospects, clients, contacts et missions vendues." />
        <ModuleLink href="/app/finance" title="Factures" text="Factures, acomptes, paiements reçus et relances." />
        <ModuleLink href="/app/agents" title="Agents IA" text="Propositions des agents, validées par vous avant toute action." />
        <ModuleLink href="/app/integrations" title="Connexions" text="Base de données, e-mails, rendez-vous TidyCal, alertes." />
      </section>
    </>
  );
}

function ModuleLink({
  href,
  title,
  text,
}: {
  href: string;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="group block border-l-2 border-brand/40 pl-4 transition hover:border-brand"
    >
      <h3 className="font-display text-lg font-semibold text-ink group-hover:text-brand-deep">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{text}</p>
    </Link>
  );
}
