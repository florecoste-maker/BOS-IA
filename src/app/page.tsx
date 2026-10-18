import Link from "next/link";
import { brand, jamalianceServices } from "@/lib/brand";
import { getTidyCalPublicConfig } from "@/lib/integrations/config";

export default function HomePage() {
  const { bookingUrl } = getTidyCalPublicConfig();

  return (
    <div className="min-h-screen">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-6">
          <span className="font-display text-xl font-semibold tracking-tight text-white">
            {brand.agency}
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/rendez-vous"
              className="hidden text-sm font-semibold text-white/90 transition hover:text-white sm:inline"
            >
              Prendre rendez-vous
            </Link>
            <Link
              href="/app"
              className="text-sm font-semibold text-white/90 transition hover:text-white"
            >
              Ouvrir BOS-IA
            </Link>
          </div>
        </div>
      </header>

      <section className="relative min-h-[100svh] overflow-hidden bg-[#062821] text-white">
        <div className="mesh-grid absolute inset-0 opacity-30" />
        <div className="absolute -left-24 top-24 h-72 w-72 animate-pulse-soft rounded-full bg-[#0d6b5c]/40 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-80 w-80 animate-pulse-soft rounded-full bg-[#c45c26]/25 blur-3xl" />

        <div className="relative z-10 mx-auto grid min-h-[100svh] max-w-6xl items-end gap-10 px-4 pb-16 pt-28 md:grid-cols-[1.05fr_0.95fr] md:items-center md:px-6 md:pb-20">
          <div className="animate-rise">
            <p className="font-display text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
              {brand.agency}
            </p>
            <h1 className="mt-5 max-w-xl text-2xl font-medium leading-snug text-white/90 md:text-3xl">
              {brand.tagline}
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-white/70 md:text-lg">
              BOS-IA est l&apos;assistant opérationnel de l&apos;agence : site,
              téléphone, rendez-vous et e-mails — avec validation humaine là où
              vous devez rester aux commandes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/rendez-vous"
                className="inline-flex items-center justify-center bg-white px-5 py-3 text-sm font-semibold text-[#062821] transition hover:bg-[#e8f4f0]"
              >
                Réserver un échange
              </Link>
              <Link
                href="/app"
                className="inline-flex items-center justify-center border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/60"
              >
                Accéder au cockpit
              </Link>
            </div>
          </div>

          <div className="animate-rise-delay relative hidden min-h-[420px] md:block" aria-hidden>
            <HeroVisual />
          </div>
        </div>
      </section>

      <section id="services" className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <div className="animate-rise-late max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
            Quatre agents IA
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Alléger le quotidien, sans perdre le contrôle
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            Chaque service s&apos;intègre à votre façon de travailler et soulage
            votre équipe des tâches répétitives.
          </p>
        </div>

        <div className="mt-12 grid gap-10 md:grid-cols-2">
          {jamalianceServices.map((service) => (
            <article key={service.id}>
              <h3 className="font-display text-xl font-semibold text-ink">
                {service.title}
              </h3>
              <p className="mt-3 leading-relaxed text-ink-muted">{service.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface/70">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:grid-cols-2 md:px-6 md:py-24">
          <article>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
              Assistant BOS-IA
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">
              Un cockpit pour piloter l&apos;agence
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Formation, finance et supervision multi-agents restent dans BOS-IA.
              Les rendez-vous clients passent par TidyCal ; le site public vit sur
              Hostinger.
            </p>
          </article>
          <article>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              Connexions
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">
              Hostinger + TidyCal
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Le code est prêt pour un déploiement Node.js Hostinger et un
              calendrier TidyCal embarqué. Il reste à brancher vos clés et votre
              domaine.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/app/integrations"
                className="inline-flex text-sm font-semibold text-brand hover:text-brand-deep"
              >
                Voir l&apos;état des connexions →
              </Link>
              {bookingUrl ? (
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-sm font-semibold text-accent hover:opacity-80"
                >
                  Ouvrir TidyCal →
                </a>
              ) : null}
            </div>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-nexus">
          Vous restez aux commandes
        </p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Simple, chaleureux, et toujours à votre écoute
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-ink-muted">
          Pas de jargon ni de promesses miraculeuses. Nous avançons étape par
          étape, au rythme de votre entreprise.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/rendez-vous"
            className="inline-flex bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-deep"
          >
            Réserver un échange
          </Link>
          <a
            href={`mailto:${brand.email}`}
            className="inline-flex border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink transition hover:border-brand/40"
          >
            {brand.email}
          </a>
        </div>
      </section>

      <footer className="border-t border-line px-4 py-8 text-sm text-ink-muted md:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <span className="font-display font-semibold text-ink">
            {brand.agency} · {brand.product}
          </span>
          <span>
            <a href={brand.siteUrl} className="hover:text-ink">
              jamaliance.com
            </a>
            {" · "}Hostinger · TidyCal
          </span>
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
      <rect x="64" y="72" width="220" height="18" rx="4" fill="#e8f4f0" opacity="0.9" />
      <rect x="64" y="104" width="140" height="10" rx="3" fill="#9ecfc3" opacity="0.7" />
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
        Site
      </text>
      <text x="264" y="178" fill="#d7ebe4" fontSize="12" fontFamily="Sora,sans-serif">
        RDV
      </text>
      <text x="78" y="292" fill="#d7ebe4" fontSize="13" fontFamily="Sora,sans-serif">
        BOS-IA · Jamaliance
      </text>
      <text x="78" y="318" fill="#9ecfc3" fontSize="11" fontFamily="DM Sans,sans-serif">
        Téléphone → E-mails → TidyCal → Validation
      </text>
    </svg>
  );
}
