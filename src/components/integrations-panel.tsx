"use client";

import { useEffect, useState, useTransition } from "react";
import { StatusPill } from "@/components/ui";

type Overview = {
  tidycal: {
    status: "configured" | "partial" | "missing";
    bookingUrl: string | null;
    embedReady: boolean;
    apiReady: boolean;
    bookingTypeReady: boolean;
    needsFromUser: string[];
    optional: string[];
    live?: {
      connected: boolean;
      message?: string;
      bookingTypes?: number;
      reason?: string;
    };
  };
  hostinger: {
    status: "configured" | "partial" | "missing";
    siteUrl: string | null;
    appUrl: string | null;
    servedHost: string | null;
    targetSubdomain?: string;
    needsFromUser: string[];
  };
  database: {
    status: "configured" | "partial" | "missing";
    mode: "mysql" | "demo";
    message: string;
    needsFromUser: string[];
  };
  agentsIa: {
    status: "configured" | "partial" | "missing";
    model: string;
    needsFromUser: string[];
  };
  emails: {
    status: "configured" | "partial" | "missing";
    from: string | null;
    serveur: string | null;
    redirection: string | null;
    avertissements: string[];
    message: string;
    needsFromUser: string[];
  };
  alertes: {
    status: "configured" | "partial" | "missing";
    adresse: string | null;
    needsFromUser: string[];
  };
  agentsPlanifies: {
    status: "configured" | "partial" | "missing";
    intervalHours: number;
    dernierPassage: string | null;
    needsFromUser: string[];
  };
};

function tone(status: Overview["tidycal"]["status"]) {
  if (status === "configured") return "ok" as const;
  if (status === "partial") return "warn" as const;
  return "danger" as const;
}

function label(status: Overview["tidycal"]["status"]) {
  if (status === "configured") return "Connecté";
  if (status === "partial") return "Partiel";
  return "À configurer";
}

function SmtpTest({ defaut }: { defaut: string }) {
  const [adresse, setAdresse] = useState(defaut);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function send(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/integrations/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adresse }),
      });
      const json = await res.json().catch(() => ({}));
      setResult(res.ok ? { ok: true, text: json.message } : { ok: false, text: json.error ?? "Échec de l'envoi" });
    });
  }

  return (
    <form onSubmit={send} className="mt-4 flex flex-wrap items-end gap-2 text-sm">
      <label className="min-w-56 flex-1">
        Envoyer un e-mail de test à
        <input
          required
          type="email"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          placeholder="vous@jamaliance.com"
          className="mt-1 block w-full border border-line bg-surface px-2 py-1.5"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="border border-line px-3 py-1.5 text-xs font-semibold hover:border-brand/40 disabled:opacity-50"
      >
        {pending ? "Envoi…" : "Envoyer le test"}
      </button>
      {result ? (
        <p className={`w-full border-l-2 bg-surface px-3 py-2 ${result.ok ? "border-nexus" : "border-danger"}`}>
          {result.text}
        </p>
      ) : null}
    </form>
  );
}

export function IntegrationsPanel({ isAdmin = false }: { isAdmin?: boolean }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/status")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erreur statut");
        if (!cancelled) setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-ink-muted">Vérification des connexions…</p>;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <article className="border-l-2 border-brand/40 pl-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-ink">TidyCal</h3>
          <StatusPill label={label(data.tidycal.status)} tone={tone(data.tidycal.status)} />
        </div>
        <ul className="mt-3 space-y-1 text-sm text-ink-muted">
          <li>Lien public : {data.tidycal.bookingUrl ?? "non défini"}</li>
          <li>Embed : {data.tidycal.embedReady ? "prêt" : "en attente"}</li>
          <li>
            API :{" "}
            {data.tidycal.live?.connected
              ? `OK (${data.tidycal.live.bookingTypes ?? 0} types)`
              : data.tidycal.apiReady
                ? data.tidycal.live?.message ?? "jeton présent, sonde en échec"
                : "jeton manquant"}
          </li>
        </ul>
        {data.tidycal.needsFromUser.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {data.tidycal.needsFromUser.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {data.tidycal.optional.length > 0 ? (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Optionnel
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-muted">
              {data.tidycal.optional.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : null}
      </article>

      <article className="border-l-2 border-accent/50 pl-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-ink">Hostinger</h3>
          <StatusPill
            label={label(data.hostinger.status)}
            tone={tone(data.hostinger.status)}
          />
        </div>
        <ul className="mt-3 space-y-1 text-sm text-ink-muted">
          <li>Vitrine Horizons : {data.hostinger.siteUrl ?? "non défini"}</li>
          <li>Moteur BOS-IA : {data.hostinger.appUrl ?? "non défini"}</li>
          {data.hostinger.servedHost ? (
            <li>En ligne sur : {data.hostinger.servedHost}</li>
          ) : null}
          <li>
            Sous-domaine cible :{" "}
            {data.hostinger.targetSubdomain ?? "app.jamaliance.com"}
          </li>
          <li>Build Next.js : prêt (mode serveur / standalone)</li>
        </ul>
        {data.hostinger.needsFromUser.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {data.hostinger.needsFromUser.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </article>

      <article className="border-l-2 border-brand/50 pl-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-ink">Base de données</h3>
          <StatusPill label={label(data.database.status)} tone={tone(data.database.status)} />
        </div>
        <ul className="mt-3 space-y-1 text-sm text-ink-muted">
          <li>{data.database.message}</li>
        </ul>
        {data.database.needsFromUser.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {data.database.needsFromUser.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </article>

      <article className="border-l-2 border-nexus/50 pl-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-ink">Agents IA (Claude)</h3>
          <StatusPill label={label(data.agentsIa.status)} tone={tone(data.agentsIa.status)} />
        </div>
        <ul className="mt-3 space-y-1 text-sm text-ink-muted">
          <li>Modèle : {data.agentsIa.model}</li>
          <li>Validation humaine (HITL) : forcée pour les agents à risque</li>
        </ul>
        {data.agentsIa.needsFromUser.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {data.agentsIa.needsFromUser.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </article>

      <article className="border-l-2 border-nexus/50 pl-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-ink">Agents planifiés</h3>
          <StatusPill
            label={label(data.agentsPlanifies.status)}
            tone={tone(data.agentsPlanifies.status)}
          />
        </div>
        <ul className="mt-3 space-y-1 text-sm text-ink-muted">
          <li>Intervalle minimal par agent : {data.agentsPlanifies.intervalHours} h</li>
          <li>
            Dernier passage planifié :{" "}
            {data.agentsPlanifies.dernierPassage
              ? new Date(data.agentsPlanifies.dernierPassage).toLocaleString("fr-FR", {
                  timeZone: "Europe/Paris",
                })
              : "aucun"}
          </li>
        </ul>
        {data.agentsPlanifies.needsFromUser.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {data.agentsPlanifies.needsFromUser.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </article>

      <article className="border-l-2 border-accent/50 pl-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-ink">E-mails (SMTP)</h3>
          <StatusPill label={label(data.emails.status)} tone={tone(data.emails.status)} />
        </div>
        <ul className="mt-3 space-y-1 text-sm text-ink-muted">
          {data.emails.from ? <li>Expéditeur : {data.emails.from}</li> : null}
          {data.emails.serveur ? <li>Serveur : {data.emails.serveur}</li> : null}
          {data.emails.message ? <li>{data.emails.message}</li> : null}
          <li>Envoi uniquement après « Approuver et envoyer » dans la file HITL</li>
        </ul>
        {data.emails.needsFromUser.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {data.emails.needsFromUser.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {data.emails.avertissements.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-danger">
            {data.emails.avertissements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {isAdmin && data.emails.status !== "missing" ? <SmtpTest defaut={data.alertes.adresse ?? ""} /> : null}
      </article>

      <article className="border-l-2 border-danger/40 pl-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-ink">Alertes et sauvegardes</h3>
          <StatusPill label={label(data.alertes.status)} tone={tone(data.alertes.status)} />
        </div>
        <ul className="mt-3 space-y-1 text-sm text-ink-muted">
          <li>Destinataire : {data.alertes.adresse ?? "non défini"}</li>
          <li>Rapport après chaque passage planifié (échecs, validations en attente)</li>
          <li>Alerte si un e-mail approuvé ne part pas ; sauvegarde hebdomadaire jointe</li>
        </ul>
        {data.alertes.needsFromUser.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {data.alertes.needsFromUser.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </article>
    </div>
  );
}
