"use client";

import { useState, useTransition } from "react";

const input = "mt-1 block w-full border border-line bg-surface px-2 py-1.5";

export function AccountClient() {
  const [form, setForm] = useState({ actuel: "", nouveau: "", confirmation: "" });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.nouveau !== form.confirmation) {
      setMessage({ ok: false, text: "La confirmation ne correspond pas au nouveau mot de passe" });
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/compte", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actuel: form.actuel, nouveau: form.nouveau }),
      });
      const data = await res.json();
      setMessage(res.ok ? { ok: true, text: "Mot de passe modifié" } : { ok: false, text: data.error ?? "Erreur" });
      if (res.ok) setForm({ actuel: "", nouveau: "", confirmation: "" });
    });
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-4 text-sm">
      <h2 className="font-display text-xl font-semibold">Changer de mot de passe</h2>
      {message ? (
        <p className={`border-l-2 bg-surface px-3 py-2 ${message.ok ? "border-nexus" : "border-danger"}`}>
          {message.text}
        </p>
      ) : null}
      <label className="block">
        Mot de passe actuel
        <input required type="password" autoComplete="current-password" value={form.actuel} onChange={(e) => setForm({ ...form, actuel: e.target.value })} className={input} />
      </label>
      <label className="block">
        Nouveau mot de passe (12 caractères minimum)
        <input required type="password" minLength={12} autoComplete="new-password" value={form.nouveau} onChange={(e) => setForm({ ...form, nouveau: e.target.value })} className={input} />
      </label>
      <label className="block">
        Confirmation
        <input required type="password" minLength={12} autoComplete="new-password" value={form.confirmation} onChange={(e) => setForm({ ...form, confirmation: e.target.value })} className={input} />
      </label>
      <button type="submit" disabled={pending} className="bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
        Enregistrer
      </button>
    </form>
  );
}
