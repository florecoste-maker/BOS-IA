import Link from "next/link";
import { Metric, SectionTitle, StatusPill } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repo = await getRepository();
  const [metrics, allSessions, actions] = await Promise.all([
    repo.getMetrics(),
    repo.getSessions(),
    repo.getAgentActions(),
  ]);
  const sessions = allSessions.filter((s) => s.statut === "en_cours");
  const hitl = actions.filter((a) => a.requiresHitl && a.hitlStatus === "pending");

  return (
    <>
      <SectionTitle
        eyebrow="Cockpit Jamaliance"
        title="Pilotage BOS-IA"
        description="Moteur opérationnel de l'agence (app.jamaliance.com) : formation, finance, agents IA et connexions. La vitrine reste sur jamaliance.com. Vous validez les actions à risque."
      />

      <section className="grid gap-6 border-y border-line bg-surface/60 py-6 md:grid-cols-4 md:gap-0">
        <Metric
          label="Apprenants actifs"
          value={String(metrics.apprenantsActifs)}
          hint={`${metrics.ghostLearners} ghost learner${metrics.ghostLearners > 1 ? "s" : ""}`}
        />
        <Metric
          label="Dossiers OPCO"
          value={String(metrics.dossiersOpcoOuverts)}
          hint="En cours de traitement"
        />
        <Metric
          label="Délai paiement"
          value={metrics.delaiPaiementMoyen === null ? "—" : `${metrics.delaiPaiementMoyen} j`}
          hint={
            metrics.delaiPaiementMoyen === null
              ? "Aucune facture payée datée (12 mois)"
              : `Cible < 30 j · ${metrics.delaiPaiementBase} facture${metrics.delaiPaiementBase > 1 ? "s" : ""} payée${metrics.delaiPaiementBase > 1 ? "s" : ""}`
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
          <h2 className="font-display text-xl font-semibold">Sessions en cours</h2>
          <ul className="mt-5 space-y-4">
            {sessions.map((session) => (
              <li key={session.id} className="border-b border-line pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{session.titre}</p>
                  <StatusPill label={session.statut.replace("_", " ")} tone="brand" />
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {session.code} · {session.inscrits}/{session.places} places · Qualiopi{" "}
                  {session.qualiopiIndicateurs.join(", ")}
                </p>
              </li>
            ))}
          </ul>
          <Link
            href="/app/formation"
            className="mt-5 inline-flex text-sm font-semibold text-brand hover:text-brand-deep"
          >
            Ouvrir le LMS →
          </Link>
        </div>

        <div>
          <h2 className="font-display text-xl font-semibold">
            Validations humaines (HITL)
          </h2>
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
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {action.description}
                  </p>
                </li>
              ))
            )}
          </ul>
          <Link
            href="/app/agents"
            className="mt-5 inline-flex text-sm font-semibold text-nexus hover:opacity-80"
          >
            Superviser le Nexus →
          </Link>
        </div>
      </section>

      <section className="mt-14 grid gap-6 border-t border-line pt-10 md:grid-cols-2 lg:grid-cols-4">
        <ModuleLink
          href="/app/formation"
          title="Pilier 1 — LMS"
          text="Pipeline cognitif, anti ghost learner, preuves de compréhension."
        />
        <ModuleLink
          href="/app/finance"
          title="Pilier 2 — ERP"
          text="Dossiers OPCO, acomptes 30/70, recouvrement sous contrôle."
        />
        <ModuleLink
          href="/app/agents"
          title="Digital Nexus"
          text="Agents QAA, IPOA et MDGA avec niveaux d'autonomie."
        />
        <ModuleLink
          href="/app/integrations"
          title="Hostinger · TidyCal"
          text="État des connexions site et prise de rendez-vous."
        />
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
