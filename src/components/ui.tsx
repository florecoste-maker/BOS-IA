"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/app", label: "Pilotage", exact: true },
  { href: "/app/formation", label: "Formation" },
  { href: "/app/finance", label: "Finance" },
  { href: "/app/agents", label: "Digital Nexus" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link
          href="/"
          className="font-display text-lg font-semibold tracking-tight text-brand-deep"
        >
          BOS-IA
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm font-medium text-ink-muted">
          {links.map((link) => {
            const active = link.exact
              ? pathname === link.href
              : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  active
                    ? "bg-brand/10 text-brand-deep"
                    : "hover:bg-bg-deep hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export function StatusPill({
  label,
  tone = "brand",
}: {
  label: string;
  tone?: "ok" | "warn" | "danger" | "brand" | "nexus";
}) {
  return (
    <span className="status-pill" data-tone={tone}>
      {label}
    </span>
  );
}

export function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border-b border-line pb-3 last:border-b-0 last:pb-0 md:border-b-0 md:border-r md:pb-0 md:pr-5 md:last:border-r-0 md:last:pr-0">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
        {value}
      </p>
      {hint ? <p className="mt-1 text-sm text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6 max-w-2xl">
      {eyebrow ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-ink-muted">{description}</p>
      ) : null}
    </div>
  );
}
