import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { getAuthConfig, safeNextPath } from "@/lib/auth";

export const metadata: Metadata = {
  title: `Connexion — ${brand.product}`,
  robots: { index: false, follow: false },
};

const messages: Record<string, string> = {
  mdp: "Mot de passe de secours incorrect.",
  identifiants: "E-mail ou mot de passe incorrect, ou compte désactivé.",
  bloque: "Trop de tentatives. Réessayez dans 15 minutes.",
  config:
    "Accès non configuré : renseignez BOS_ADMIN_PASSWORD et BOS_SESSION_SECRET dans hPanel, puis redéployez.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const erreur = typeof params.erreur === "string" ? params.erreur : null;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  // Noms des réglages en cause (jamais leurs valeurs) : manquant ou trop court.
  const problems = erreur === "config" ? getAuthConfig().problems : [];

  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-sm flex-col justify-center px-4 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
        {brand.agency} · {brand.product}
      </p>
      <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink">
        Accès au cockpit
      </h1>

      {erreur && messages[erreur] ? (
        <p className="mt-6 border-l-2 border-danger bg-surface px-3 py-2 text-sm">
          {messages[erreur]}
          {problems.length ? (
            <span className="mt-1 block text-xs text-ink-muted">
              Vu par le serveur : {problems.join(" ; ")}.
            </span>
          ) : null}
        </p>
      ) : null}

      <form method="post" action="/api/auth/login" className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm font-medium text-ink">
          E-mail
          <input
            type="email"
            name="email"
            autoComplete="username"
            className="mt-1 block w-full border border-line bg-surface px-3 py-2 text-base text-ink"
          />
          <span className="mt-1 block text-xs font-normal text-ink-muted">
            Laisser vide pour utiliser le mot de passe de secours.
          </span>
        </label>
        <label className="block text-sm font-medium text-ink">
          Mot de passe
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full border border-line bg-surface px-3 py-2 text-base text-ink"
          />
        </label>
        <button
          type="submit"
          className="w-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-deep"
        >
          Se connecter
        </button>
      </form>

      <a
        href={brand.siteUrl}
        className="mt-8 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Retour à {brand.siteUrl.replace("https://", "")}
      </a>
    </main>
  );
}
