import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/lib/brand";
import { getRepository } from "@/lib/data";
import { getActor } from "@/lib/session";

export const metadata: Metadata = {
  title: `Espace client · ${brand.agency}`,
  robots: { index: false, follow: false },
};

/** Espace d'une entreprise cliente : réservé aux comptes clients, limité à leur entreprise. */
export default async function EspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/espace");
  if (actor.role !== "client" || !actor.clientId) redirect("/app");
  const client = (await (await getRepository()).getClients()).find((c) => c.id === actor.clientId);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link href="/espace" className="font-display text-lg font-semibold tracking-tight text-brand-deep">
            {brand.agency}
            <span className="ml-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Espace {client?.nom ?? "client"}
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium text-ink-muted">
            <Link href="/espace/compte" className="rounded-md px-3 py-1.5 hover:bg-bg-deep hover:text-ink">
              {actor.nom}
            </Link>
            <form method="post" action="/api/auth/logout">
              <button type="submit" className="rounded-md px-3 py-1.5 hover:bg-bg-deep hover:text-ink">
                Déconnexion
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">{children}</main>
    </div>
  );
}
