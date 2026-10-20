import Link from "next/link";
import { brand } from "@/lib/brand";

/**
 * Entrée du moteur BOS-IA — pas une vitrine marketing.
 * La vitrine publique reste exclusivement sur jamaliance.com (Hostinger Horizons).
 */
export default function HomePage() {
  return (
    <div className="flex min-h-[100svh] flex-col">
      <header className="border-b border-line/80 bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="font-display text-lg font-semibold tracking-tight text-brand-deep">
            {brand.agency}
            <span className="ml-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {brand.product}
            </span>
          </div>
          <a
            href={brand.siteUrl}
            className="text-sm font-semibold text-ink-muted transition hover:text-ink"
          >
            Site public →
          </a>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
          Moteur · {brand.appUrl.replace("https://", "")}
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          {brand.product}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted">
          {brand.tagline} La vitrine client reste sur{" "}
          <a href={brand.siteUrl} className="font-semibold text-brand hover:text-brand-deep">
            jamaliance.com
          </a>
          . Ici : cockpit formation, finance, agents et connexions.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/app"
            className="inline-flex items-center justify-center bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-deep"
          >
            Ouvrir le cockpit
          </Link>
          <a
            href={brand.reservationUrl}
            className="inline-flex items-center justify-center border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink transition hover:border-brand/40"
          >
            Rendez-vous (site public)
          </a>
        </div>

        <ul className="mt-12 space-y-2 text-sm text-ink-muted">
          <li>
            <Link href="/app" className="font-medium text-ink hover:text-brand">
              /app
            </Link>{" "}
            — pilotage
          </li>
          <li>
            <Link
              href="/app/integrations"
              className="font-medium text-ink hover:text-brand"
            >
              /app/integrations
            </Link>{" "}
            — Hostinger & TidyCal
          </li>
          <li>
            <span className="font-medium text-ink">/rendez-vous</span> —
            redirige vers {brand.reservationUrl.replace("https://", "")}
          </li>
        </ul>
      </main>

      <footer className="border-t border-line px-4 py-6 text-sm text-ink-muted md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-1 md:flex-row md:justify-between">
          <span>
            {brand.agency} · {brand.product}
          </span>
          <span>Ne remplace pas le site Hostinger Horizons</span>
        </div>
      </footer>
    </div>
  );
}
