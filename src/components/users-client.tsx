"use client";

import { useState, useTransition } from "react";
import { StatusPill } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { User } from "@/lib/types";

const input = "mt-1 block w-full border border-line bg-surface px-2 py-1.5";

export function UsersClient({ initialUsers, selfId }: { initialUsers: User[]; selfId: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ email: "", nom: "", role: "membre", motDePasse: "" });
  const [pending, startTransition] = useTransition();

  async function call(method: "POST" | "PATCH", body: object, success: string) {
    const res = await fetch("/api/utilisateurs", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ ok: false, text: data.error ?? "Erreur" });
      return false;
    }
    const list = await fetch("/api/utilisateurs").then((r) => r.json());
    setUsers(list.users);
    setMessage({ ok: true, text: success });
    return true;
  }

  function create(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      if (await call("POST", form, `Compte créé pour ${form.nom}`)) {
        setForm({ email: "", nom: "", role: "membre", motDePasse: "" });
      }
    });
  }

  function update(user: User, patch: object, success: string) {
    startTransition(async () => {
      await call("PATCH", { id: user.id, ...patch }, success);
    });
  }

  function resetPassword(user: User) {
    const motDePasse = window.prompt(
      `Nouveau mot de passe pour ${user.nom} (12 caractères minimum). Transmettez-le de vive voix ou par un canal sûr.`,
    );
    if (motDePasse) update(user, { motDePasse }, `Mot de passe de ${user.nom} réinitialisé`);
  }

  return (
    <>
      {message ? (
        <p
          className={`mb-6 border-l-2 bg-surface px-3 py-2 text-sm ${message.ok ? "border-nexus" : "border-danger"}`}
        >
          {message.text}
        </p>
      ) : null}

      <ul className="divide-y divide-line border-y border-line">
        {users.length === 0 ? (
          <li className="py-4 text-sm text-ink-muted">
            Aucun compte. Créez le vôtre ci-dessous (rôle administrateur), puis reconnectez-vous
            avec votre e-mail.
          </li>
        ) : (
          users.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
              <div className="min-w-48 flex-1">
                <p className="font-medium">
                  {user.nom} {user.id === selfId ? <span className="text-ink-muted">(vous)</span> : null}
                </p>
                <p className="text-ink-muted">{user.email}</p>
                <p className="text-xs text-ink-muted">
                  {user.derniereConnexion
                    ? `Dernière connexion : ${formatDateTime(user.derniereConnexion)}`
                    : "Jamais connecté"}
                </p>
              </div>
              <StatusPill label={user.actif ? "Actif" : "Désactivé"} tone={user.actif ? "ok" : "danger"} />
              <select
                value={user.role}
                disabled={pending || user.id === selfId}
                onChange={(e) => update(user, { role: e.target.value }, `Rôle de ${user.nom} modifié`)}
                className="border border-line bg-surface px-2 py-1"
                aria-label={`Rôle de ${user.nom}`}
              >
                <option value="membre">Membre</option>
                <option value="admin">Administrateur</option>
              </select>
              <button
                type="button"
                disabled={pending}
                onClick={() => resetPassword(user)}
                className="border border-line px-3 py-1 text-xs font-semibold hover:border-brand/40 disabled:opacity-50"
              >
                Nouveau mot de passe
              </button>
              {user.id === selfId ? null : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    update(
                      user,
                      { actif: !user.actif },
                      user.actif ? `${user.nom} ne peut plus se connecter` : `${user.nom} est réactivé`,
                    )
                  }
                  className="border border-line px-3 py-1 text-xs font-semibold hover:border-danger/40 disabled:opacity-50"
                >
                  {user.actif ? "Désactiver" : "Réactiver"}
                </button>
              )}
            </li>
          ))
        )}
      </ul>

      <form onSubmit={create} className="mt-10 grid max-w-2xl gap-4 text-sm md:grid-cols-2">
        <h2 className="font-display text-xl font-semibold md:col-span-2">Nouveau compte</h2>
        <label>
          Nom
          <input required maxLength={120} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className={input} />
        </label>
        <label>
          E-mail
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
        </label>
        <label>
          Rôle
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={input}>
            <option value="membre">Membre : travail courant</option>
            <option value="admin">Administrateur : + comptes et journal</option>
          </select>
        </label>
        <label>
          Mot de passe initial (12 caractères minimum)
          <input
            required
            type="password"
            minLength={12}
            autoComplete="new-password"
            value={form.motDePasse}
            onChange={(e) => setForm({ ...form, motDePasse: e.target.value })}
            className={input}
          />
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
          >
            Créer le compte
          </button>
        </div>
      </form>
    </>
  );
}
