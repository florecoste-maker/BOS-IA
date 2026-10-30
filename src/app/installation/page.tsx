import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { getAuthConfig, isVercel } from "@/lib/auth";
import { loadPersistentEnv } from "@/lib/env-files";
import { ensureInstallationCode } from "@/lib/installation/code";

export const metadata: Metadata = {
  title: `Installation — ${brand.product}`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  code: "Code d'installation invalide ou déjà utilisé. Relancez le workflow « Installation du cockpit » dans GitHub.",
  bloque: "Trop de tentatives. Réessayez dans 15 minutes.",
  court: "Le mot de passe doit faire au moins 12 caractères.",
  different: "Les deux mots de passe ne sont pas identiques.",
  caracteres: "Mot de passe refusé : retirez les espaces au début ou à la fin, ou l'un des caractères ' \` \".",
  ecriture: "Le serveur n'a pas pu enregistrer le réglage. Réessayez dans un instant.",
};

const inputClass = "mt-1 block w-full border border-line bg-surface px-3 py-2 text-base text-ink";

/** Première installation : choix du mot de passe administrateur, protégé par un code à usage unique. */
export default async function InstallationPage({ searchParams }: PageProps<"/installation">) {
  const params = await searchParams;
  const erreur = typeof params.erreur === "string" ? params.erreur : null;
  const code = typeof params.code === "string" ? params.code : "";

  loadPersistentEnv();
  const installed = Boolean(getAuthConfig().password);
  const vercel = isVercel();
  // Code de secours lisible dans le gestionnaire de fichiers si GitHub est indisponible.
  if (!installed && !vercel) ensureInstallationCode();

  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-sm flex-col justify-center px-4 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
        {brand.agency} · {brand.product}
      </p>
      <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink">
        Installation du cockpit
      </h1>

      {vercel && !installed ? (
        <p className="mt-6 text-sm text-ink-muted">
          Sur Vercel, le mot de passe administrateur se règle dans le projet : Vercel → bos-ia → Settings →
          Environment Variables → BOS_ADMIN_PASSWORD (12 caractères minimum), puis Redeploy.
        </p>
      ) : installed ? (
        <>
          <p className="mt-6 text-sm text-ink-muted">Le cockpit est déjà installé.</p>
          <a href="/login" className="mt-6 block w-full bg-brand px-5 py-3 text-center text-sm font-semibold text-white">
            Se connecter
          </a>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm text-ink-muted">
            Choisissez le mot de passe administrateur. Il est enregistré uniquement sur le serveur
            Hostinger ; notez-le dans votre gestionnaire de mots de passe.
          </p>
          {erreur && messages[erreur] ? (
            <p className="mt-6 border-l-2 border-danger bg-surface px-3 py-2 text-sm">{messages[erreur]}</p>
          ) : null}
          <form method="post" action="/api/installation/terminer" className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-ink">
              Code d&apos;installation
              <input name="code" defaultValue={code} required autoComplete="off" className={inputClass} />
            </label>
            <input type="text" name="username" value="administrateur" autoComplete="username" readOnly hidden />
            <label className="block text-sm font-medium text-ink">
              Mot de passe administrateur (12 caractères minimum)
              <input type="password" name="password" required minLength={12} autoComplete="new-password" className={inputClass} />
            </label>
            <label className="block text-sm font-medium text-ink">
              Confirmer le mot de passe
              <input type="password" name="confirmation" required minLength={12} autoComplete="new-password" className={inputClass} />
            </label>
            <button
              type="submit"
              className="w-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-deep"
            >
              Enregistrer et ouvrir le cockpit
            </button>
          </form>
        </>
      )}
    </main>
  );
}
