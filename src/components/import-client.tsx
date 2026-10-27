"use client";

import { useState } from "react";
import { StatusPill } from "@/components/ui";
import type { ImportIssue, ImportKind } from "@/lib/import/schema";

interface Report {
  type: ImportKind;
  lignes: number;
  created: number;
  updated: number;
  committed: boolean;
  errors: ImportIssue[];
  warnings: string[];
}

export function ImportClient({
  kinds,
  enabled,
}: {
  kinds: Array<{ kind: ImportKind; label: string }>;
  enabled: boolean;
}) {
  const [kind, setKind] = useState<ImportKind>(kinds[0].kind);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(mode: "verifier" | "importer") {
    if (!file) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("type", kind);
    body.set("mode", mode);
    body.set("fichier", file);
    try {
      const res = await fetch("/api/import", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setReport(null);
        setError(data.error ?? "Erreur");
        return;
      }
      setReport(data);
    } catch {
      setError("Connexion au serveur impossible.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setReport(null);
    setError(null);
  }

  const verified = report && !report.committed && report.errors.length === 0;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="block font-medium">Type de données</span>
          <select
            value={kind}
            disabled={!enabled || busy}
            onChange={(e) => {
              setKind(e.target.value as ImportKind);
              reset();
            }}
            className="mt-1 border border-line bg-surface px-2 py-1.5"
          >
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block font-medium">Fichier CSV ou Excel (.xlsx)</span>
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={!enabled || busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              reset();
            }}
            className="mt-1 block text-sm"
          />
        </label>
        <button
          type="button"
          disabled={!enabled || !file || busy}
          onClick={() => send("verifier")}
          className="border border-line px-3 py-1.5 text-sm font-semibold hover:border-brand/40 disabled:opacity-50"
        >
          {busy && !verified ? "Vérification…" : "1. Vérifier"}
        </button>
        <button
          type="button"
          disabled={!enabled || !verified || busy}
          onClick={() => send("importer")}
          className="bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
        >
          {busy && verified ? "Import…" : "2. Importer"}
        </button>
      </div>

      {error ? (
        <p className="mt-6 border-l-2 border-danger bg-surface px-3 py-2 text-sm">{error}</p>
      ) : null}

      {report ? (
        <section className="mt-6 border-l-2 border-nexus bg-surface px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {report.committed ? (
              <StatusPill label="Importé" tone="ok" />
            ) : report.errors.length ? (
              <StatusPill label={`${report.errors.length} erreur(s)`} tone="danger" />
            ) : (
              <StatusPill label="Prêt à importer" tone="brand" />
            )}
            {report.committed ? null : (
              <span>
                {report.lignes} ligne(s) · {report.created} à créer · {report.updated} à mettre à jour
              </span>
            )}
          </div>
          {report.committed ? (
            <p className="mt-2">
              {report.created} ligne(s) créée(s), {report.updated} mise(s) à jour.
            </p>
          ) : report.errors.length ? (
            <>
              <p className="mt-2">Rien n&apos;a été importé. Corrigez le fichier puis vérifiez à nouveau :</p>
              <ul className="mt-2 max-h-72 list-disc space-y-1 overflow-auto pl-5 text-ink-muted">
                {report.errors.map((e) => (
                  <li key={`${e.line}-${e.message}`}>
                    Ligne {e.line} : {e.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2">Aucune erreur : cliquez sur « Importer » pour enregistrer.</p>
          )}
          {report.warnings.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-ink-muted">
              {report.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
