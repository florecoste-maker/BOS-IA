import Link from "next/link";
import { TidyCalEmbed } from "@/components/tidycal-embed";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default function RendezVousPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line/80 bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link
            href="/"
            className="font-display text-lg font-semibold tracking-tight text-brand-deep"
          >
            {brand.agency}
          </Link>
          <nav className="flex items-center gap-3 text-sm font-medium text-ink-muted">
            <Link href="/app" className="hover:text-ink">
              Cockpit BOS-IA
            </Link>
            <a href={`mailto:${brand.email}`} className="hover:text-ink">
              Contact
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
        <TidyCalEmbed />
      </main>
    </div>
  );
}
