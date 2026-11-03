import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { getAuthConfig, isVercel, safeNextPath } from "@/lib/auth";
import { getRepository } from "@/lib/data";
import { isDatabaseConfigured } from "@/lib/db/config";

export const metadata: Metadata = {
  title: `Connexion — ${brand.product}`,
  robots: { index: false, follow: false },
};

const messages: Record<string, string> = {
  mdp: "Mot de passe de secours incorrect. Oublié ? GitHub → dépôt BOS-IA-Hostinger → Actions → « Installation du cockpit » → Run workflow en cochant « Mot de passe administrateur oublié » : un lien (24 h) permet d'en choisir un nouveau.",
  identifiants: "E-mail ou mot de passe incorrect, ou compte désactivé. Administrateur sans compte nominatif : utilisez le mot de passe de secours.",
  bloque: "Trop de tentatives. Réessayez dans 15 minutes.",
  cookie:
    "Mot de passe accepté, mais Safari n'a pas gardé la session. Sur iPhone : Réglages → Apps → Safari → désactivez « Bloquer tous les cookies », quittez la navigation privée, puis reconnectez-vous.",
  session:
    "Mot de passe accepté, mais la session n'a pas été reconnue par le serveur. Réessayez une fois ; si le message revient, le diagnostic du serveur l'a enregistré.",
  config:
    "Cockpit pas encore installé : dans GitHub, lancez le workflow « Installation du cockpit » du dépôt BOS-IA-Hostinger, puis ouvrez le lien qu'il affiche.",
  config_vercel:
    "Cockpit pas encore configuré : dans Vercel → projet bos-ia → Settings → Environment Variables, ajoutez BOS_ADMIN_PASSWORD (12 caractères minimum), puis redéployez.",
};

const notices: Record<string, string> = {
  deja: "Le cockpit est déjà installé : connectez-vous.",
};

/**
 * Formulaire proposé par défaut : « e-mail » seulement s'il existe au moins un
 * compte nominatif actif (base MySQL reliée). Sinon, ou si la base ne répond
 * pas, « mot de passe de secours » : le trousseau de l'iPhone ne peut plus
 * envoyer une adresse e-mail sans compte derrière.
 */
async function hasActiveAccounts() {
  if (!isDatabaseConfigured()) return false;
  try {
    return (await (await getRepository()).listUsers()).some((u) => u.actif);
  } catch {
    return false;
  }
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const erreur = typeof params.erreur === "string" ? params.erreur : null;
  const installe = typeof params.installe === "string" ? notices[params.installe] : undefined;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  // Noms des réglages en cause (jamais leurs valeurs) : manquant ou trop court.
  const problems = erreur === "config" ? getAuthConfig().problems : [];
  const mode =
    params.mode === "secours" || params.mode === "compte"
      ? params.mode
      : erreur === "mdp" || !(await hasActiveAccounts())
        ? "secours"
        : "compte";
  const switchTo = (m: "secours" | "compte") => `/login?${new URLSearchParams({ mode: m, next })}`;

  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-sm flex-col justify-center px-4 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
        {brand.agency} · {brand.product}
      </p>
      <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink">
        Accès au cockpit
      </h1>

      {installe ? <p className="mt-6 border-l-2 border-brand bg-surface px-3 py-2 text-sm">{installe}</p> : null}

      {erreur && messages[erreur] ? (
        <p className="mt-6 border-l-2 border-danger bg-surface px-3 py-2 text-sm">
          {erreur === "config" && isVercel() ? messages.config_vercel : messages[erreur]}
          {problems.length ? (
            <span className="mt-1 block text-xs text-ink-muted">
              Vu par le serveur : {problems.join(" ; ")}.
            </span>
          ) : null}
          {erreur === "config" && !isVercel() ? (
            <a href="/installation" className="mt-2 block text-xs font-semibold text-brand">
              J&apos;ai un code d&apos;installation →
            </a>
          ) : null}
        </p>
      ) : null}

      {mode === "secours" ? (
        <form method="post" action="/api/auth/login" className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="mode" value="secours" />
          {/*
            Identifiant fixe pour le trousseau iCloud / gestionnaire de mots de passe :
            le mot de passe de secours est enregistré sous « secours », jamais sous
            une adresse e-mail (sinon Safari remplit l'e-mail et la connexion échoue).
          */}
          <input
            type="text"
            name="username"
            value="secours"
            autoComplete="username"
            readOnly
            hidden
          />
          <label className="block text-sm font-medium text-ink">
            Mot de passe de secours
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 block w-full border border-line bg-surface px-3 py-2 text-base text-ink"
            />
            <span className="mt-1 block text-xs font-normal text-ink-muted">
              Celui choisi avec le lien d&apos;installation (12 caractères minimum).
            </span>
          </label>
          <button
            type="submit"
            className="w-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-deep"
          >
            Se connecter
          </button>
          <a href={switchTo("compte")} className="block text-sm font-semibold text-brand">
            Se connecter avec mon e-mail →
          </a>
        </form>
      ) : (
        <form method="post" action="/api/auth/login" className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="mode" value="compte" />
          <label className="block text-sm font-medium text-ink">
            E-mail
            <input
              type="email"
              name="email"
              required
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 block w-full border border-line bg-surface px-3 py-2 text-base text-ink"
            />
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
          <a href={switchTo("secours")} className="block text-sm font-semibold text-brand">
            Utiliser le mot de passe de secours (administrateur) →
          </a>
        </form>
      )}

      <a
        href={brand.siteUrl}
        className="mt-8 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Retour à {brand.siteUrl.replace("https://", "")}
      </a>
    </main>
  );
}
