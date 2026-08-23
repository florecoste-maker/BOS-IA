import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-6">
          <span className="font-display text-xl font-semibold tracking-tight text-white">
            BOS-IA
          </span>
          <Link
            href="/app"
            className="text-sm font-semibold text-white/90 transition hover:text-white"
          >
            Ouvrir la plateforme
          </Link>
        </div>
      </header>

      <section className="relative min-h-[100svh] overflow-hidden bg-[#062821] text-white">
        <div className="mesh-grid absolute inset-0 opacity-30" />
        <div className="absolute -left-24 top-24 h-72 w-72 animate-pulse-soft rounded-full bg-[#0d6b5c]/40 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-80 w-80 animate-pulse-soft rounded-full bg-[#c45c26]/25 blur-3xl" />

        <div className="relative z-10 mx-auto grid min-h-[100svh] max-w-6xl items-end gap-10 px-4 pb-16 pt-28 md:grid-cols-[1.05fr_0.95fr] md:items-center md:px-6 md:pb-20">
          <div className="animate-rise">
            <p className="font-display text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
              BOS-IA
            </p>
            <h1 className="mt-5 max-w-xl text-2xl font-medium leading-snug text-white/90 md:text-3xl">
              Le système d&apos;exploitation cognitif pour PME.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-white/70 md:text-lg">
              Une plateforme unifiée qui orchestre formation Qualiopi, dossiers
              OPCO et facturation via un écosystème multi-agents souverain.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/app"
                className="inline-flex items-center justify-center bg-white px-5 py-3 text-sm font-semibold text-[#062821] transition hover:bg-[#e8f4f0]"
              >
                Accéder au cockpit
              </Link>
              <a
                href="#architecture"
                className="inline-flex items-center justify-center border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/60"
              >
                Voir l&apos;architecture
              </a>
            </div>
          </div>

          <div className="animate-rise-delay relative hidden min-h-[420px] md:block" aria-hidden>
            <HeroVisual />
          </div>
        </div>
      </section>

      <section id="architecture" className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <div className="animate-rise-late max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
            Architecture découplée
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            System of Record + System of Engagement
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            Le cœur métier isole vos données en Europe. L&apos;interface
            intelligente expose formation, finance et agents avec supervision
            humaine là où l&apos;AI Act l&apos;exige.
          </p>
        </div>

        <div className="mt-12 grid gap-10 md:grid-cols-2">
          <article>
            <h3 className="font-display text-xl font-semibold text-ink">
              System of Record
            </h3>
            <p className="mt-3 text-ink-muted leading-relaxed">
              Facturation, clients, formations et preuves Qualiopi dans un
              espace tenant isolé, chiffré, hébergé à Paris.
            </p>
          </article>
          <article>
            <h3 className="font-display text-xl font-semibold text-ink">
              System of Engagement
            </h3>
            <p className="mt-3 text-ink-muted leading-relaxed">
              Cockpit adaptatif, assistants Gemini et workflows Proof-to-Cash
              du completion_record jusqu&apos;au recouvrement.
            </p>
          </article>
        </div>
      </section>

      <section className="border-y border-line bg-surface/70">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:grid-cols-2 md:px-6 md:py-24">
          <article>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
              Pilier 1
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">
              LMS Audit-Ready
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Pipeline cognitif du lead à la certification, compréhension
              validée par quiz, détection anti ghost learner et preuves
              Qualiopi traçables.
            </p>
          </article>
          <article>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              Pilier 2
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">
              ERP OPCO-Ready
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Dossiers de financement industrialisés, acomptes 30/70,
              abonnements MRR et recouvrement assisté sous contrôle HITL.
            </p>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-nexus">
          Digital Nexus
        </p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Système multi-agents hiérarchisé sur Vertex AI
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-ink-muted">
          QAA pour la vérité des données, IPOA pour l&apos;optimisation
          proactive, FCA/MDGA pour les actions déléguées avec validation
          humaine obligatoire sur les processus à haut risque.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/app/agents"
            className="inline-flex bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-deep"
          >
            Superviser les agents
          </Link>
          <Link
            href="/app/formation"
            className="inline-flex border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink transition hover:border-brand/40"
          >
            Pipeline formation
          </Link>
        </div>
      </section>

      <footer className="border-t border-line px-4 py-8 text-sm text-ink-muted md:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <span className="font-display font-semibold text-ink">BOS-IA</span>
          <span>RGPD · Qualiopi · AI Act · Hébergement Europe</span>
        </div>
      </footer>
    </div>
  );
}

function HeroVisual() {
  return (
    <svg viewBox="0 0 520 460" className="h-full w-full" role="img">
      <defs>
        <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0d6b5c" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#084c41" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <rect x="40" y="40" width="440" height="380" rx="8" fill="url(#panel)" />
      <rect x="64" y="72" width="180" height="18" rx="4" fill="#e8f4f0" opacity="0.9" />
      <rect x="64" y="104" width="120" height="10" rx="3" fill="#9ecfc3" opacity="0.7" />
      <rect x="64" y="150" width="170" height="90" rx="6" fill="#05241f" opacity="0.45" />
      <rect x="250" y="150" width="200" height="90" rx="6" fill="#05241f" opacity="0.45" />
      <rect x="64" y="260" width="386" height="120" rx="6" fill="#05241f" opacity="0.35" />
      <circle cx="96" cy="195" r="10" fill="#c45c26" className="animate-pulse-soft" />
      <circle cx="282" cy="195" r="10" fill="#7dd3c0" />
      <path
        d="M106 195 H270"
        stroke="#9ecfc3"
        strokeWidth="2"
        fill="none"
        className="flow-line"
      />
      <text x="78" y="178" fill="#d7ebe4" fontSize="12" fontFamily="Sora,sans-serif">
        SoR
      </text>
      <text x="264" y="178" fill="#d7ebe4" fontSize="12" fontFamily="Sora,sans-serif">
        SoE
      </text>
      <text x="78" y="292" fill="#d7ebe4" fontSize="13" fontFamily="Sora,sans-serif">
        Proof-to-Cash · Digital Nexus
      </text>
      <text x="78" y="318" fill="#9ecfc3" fontSize="11" fontFamily="DM Sans,sans-serif">
        Formation validée → OPCO → Facture → Paiement
      </text>
    </svg>
  );
}
