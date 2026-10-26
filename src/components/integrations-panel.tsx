"use client";

import { useEffect, useState } from "react";
import { StatusPill } from "@/components/ui";

type Overview = {
  tidycal: {
    status: "configured" | "partial" | "missing";
    bookingUrl: string | null;
    embedReady: boolean;
    apiReady: boolean;
    bookingTypeReady: boolean;
    needsFromUser: string[];
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
    targetSubdomain?: string;
    needsFromUser: string[];
  };
  agentsIa: {
    status: "configured" | "partial" | "missing";
    model: string;
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

export function IntegrationsPanel() {
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
    </div>
  );
}
