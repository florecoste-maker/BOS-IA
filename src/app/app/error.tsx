"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Erreur côté serveur dans le cockpit (le plus souvent : base de données injoignable). */
export default function CockpitError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="max-w-xl">
      <h1 className="font-display text-2xl font-semibold">Données indisponibles</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        Le cockpit n&apos;a pas pu lire ses données. Si une base MySQL est configurée,
        vérifiez qu&apos;elle répond et que ses identifiants sont corrects.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-deep"
        >
          Réessayer
        </button>
        <Link
          href="/app/integrations"
          className="border border-line px-3 py-1.5 text-sm font-semibold hover:border-brand/40"
        >
          Voir l&apos;état des connexions
        </Link>
      </div>
    </section>
  );
}
