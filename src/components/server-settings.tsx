"use client";

import { useState, useTransition } from "react";

type Resultat = { ok: boolean; text: string } | null;

// 16 px : en dessous, Safari sur iPhone zoome à chaque champ.
const champ = "mt-1 block w-full border border-line bg-surface px-2 py-1.5 text-base";
/** Ni majuscule automatique ni correction (iPhone) : `u123…` resterait sinon `U123…`. */
const brut = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } as const;
const bouton =
  "border border-line px-3 py-1.5 text-xs font-semibold hover:border-brand/40 disabled:opacity-50";

function useEnvoi(section: string, onDone?: () => void) {
  const [result, setResult] = useState<Resultat>(null);
  const [pending, startTransition] = useTransition();

  function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setResult(null);
    startTransition(async () => {
      const res = await fetch("/api/reglages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, section }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        // Les mots de passe ne restent pas affichés dans la page.
        form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((i) => (i.value = ""));
        setResult({ ok: true, text: json.message });
        onDone?.();
      } else {
        setResult({ ok: false, text: json.error ?? "Échec de l'enregistrement" });
      }
    });
  }

  return { result, pending, envoyer };
}

function Message({ result }: { result: Resultat }) {
  if (!result) return null;
  return (
    <p className={`mt-3 border-l-2 bg-surface px-3 py-2 text-sm ${result.ok ? "border-nexus" : "border-danger"}`}>
      {result.text}
    </p>
  );
}

function Base({ onDone }: { onDone: () => void }) {
  const { result, pending, envoyer } = useEnvoi("base", onDone);
  return (
    <form onSubmit={envoyer} className="text-sm">
      <h4 className="font-display text-base font-semibold text-ink">1. Base de données</h4>
      <p className="mt-1 text-ink-muted">
        Dans hPanel : <strong>Bases de données → Gestion</strong>, créez une base (nom au choix, par ex.{" "}
        <code>bosia</code>) avec un utilisateur et un mot de passe. Recopiez ici les trois valeurs affichées par
        Hostinger (elles commencent par <code>u…_</code>).
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label>
          Nom de la base
          <input {...brut} name="baseNom" required autoComplete="off" placeholder="u123456789_bosia" className={champ} />
        </label>
        <label>
          Utilisateur
          <input {...brut} name="baseUtilisateur" required autoComplete="off" placeholder="u123456789_bosia" className={champ} />
        </label>
        <label>
          Mot de passe
          <input {...brut} name="baseMotDePasse" required type="password" autoComplete="new-password" className={champ} />
        </label>
      </div>
      <details className="mt-2 text-xs text-ink-muted">
        <summary className="cursor-pointer">Option avancée</summary>
        <label className="mt-2 block max-w-xs">
          Serveur de la base (laisser vide : localhost)
          <input {...brut} name="baseHote" autoComplete="off" placeholder="localhost" className={champ} />
        </label>
      </details>
      <button type="submit" disabled={pending} className={`${bouton} mt-3`}>
        {pending ? "Test de la connexion…" : "Tester et enregistrer"}
      </button>
      <Message result={result} />
    </form>
  );
}

function Emails({ onDone }: { onDone: () => void }) {
  const { result, pending, envoyer } = useEnvoi("emails", onDone);
  const [fournisseur, setFournisseur] = useState("auto");
  return (
    <form onSubmit={envoyer} className="text-sm">
      <h4 className="font-display text-base font-semibold text-ink">2. Envoi des e-mails</h4>
      <p className="mt-1 text-ink-muted">
        La boîte qui enverra les e-mails approuvés (ex. contact@jamaliance.com). Google : utilisez un{" "}
        <em>mot de passe d&apos;application</em> (Compte Google → Sécurité → Validation en deux étapes).
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label>
          Messagerie
          <select
            name="fournisseur"
            value={fournisseur}
            onChange={(e) => setFournisseur(e.target.value)}
            className={champ}
          >
            <option value="auto">Automatique (recommandé)</option>
            <option value="hostinger">Hostinger</option>
            <option value="google">Google Workspace / Gmail</option>
            <option value="microsoft">Microsoft 365 / Outlook</option>
            <option value="autre">Autre serveur</option>
          </select>
        </label>
        <label>
          Adresse d&apos;envoi
          <input {...brut} name="adresse" required type="email" placeholder="contact@jamaliance.com" className={champ} />
        </label>
        <label>
          Mot de passe de la boîte
          <input {...brut} name="motDePasse" required type="password" autoComplete="new-password" className={champ} />
        </label>
        {fournisseur === "autre" ? (
          <>
            <label>
              Serveur SMTP
              <input {...brut} name="serveur" required placeholder="smtp.exemple.com" className={champ} />
            </label>
            <label>
              Port
              <input {...brut} name="port" placeholder="587" inputMode="numeric" className={champ} />
            </label>
          </>
        ) : null}
        <label>
          Nom affiché
          <input {...brut} name="nomExpediteur" defaultValue="Jamaliance" className={champ} />
        </label>
        <label className="sm:col-span-2">
          Mode test (conseillé au début) : tout envoyer à
          <input {...brut} name="redirection" type="email" placeholder="votre adresse — vide = envois réels" className={champ} />
        </label>
      </div>
      <button type="submit" disabled={pending} className={`${bouton} mt-3`}>
        {pending ? "Test de la connexion…" : "Tester et enregistrer"}
      </button>
      <Message result={result} />
    </form>
  );
}

function Alertes({ defaut, onDone }: { defaut: string; onDone: () => void }) {
  const { result, pending, envoyer } = useEnvoi("alertes", onDone);
  return (
    <form onSubmit={envoyer} className="text-sm">
      <h4 className="font-display text-base font-semibold text-ink">3. Alertes et sauvegardes</h4>
      <p className="mt-1 text-ink-muted">
        Adresse qui reçoit les rapports des agents, les alertes et la sauvegarde hebdomadaire (nécessite l&apos;envoi
        des e-mails ci-dessus).
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1">
          Adresse
          <input {...brut} name="alertes" required type="email" defaultValue={defaut} placeholder="vous@jamaliance.com" className={champ} />
        </label>
        <button type="submit" disabled={pending} className={bouton}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      <Message result={result} />
    </form>
  );
}

/**
 * Réglages du serveur pour les administrateurs : remplace la saisie de secrets
 * GitHub ou de fichiers sur Hostinger. Chaque connexion est testée avant
 * l'enregistrement ; les mots de passe ne sont jamais réaffichés.
 */
export function ServerSettings({ alertes = "", onSaved }: { alertes?: string; onSaved: () => void }) {
  const recharger = onSaved;
  return (
    <div className="space-y-8">
      <Base onDone={recharger} />
      <Emails onDone={recharger} />
      <Alertes defaut={alertes} onDone={recharger} />
    </div>
  );
}
