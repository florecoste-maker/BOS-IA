import { redirect } from "next/navigation";
import { SectionTitle } from "@/components/ui";
import { AUDIT_LABELS } from "@/lib/audit";
import { getRepository } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function JournalPage({ searchParams }: PageProps<"/app/journal">) {
  const actor = await getActor();
  if (actor?.role !== "admin") redirect("/app");
  const params = await searchParams;
  const utilisateur = typeof params.utilisateur === "string" ? params.utilisateur : "";
  const action = typeof params.action === "string" ? params.action : "";

  const repo = await getRepository();
  const [entries, users] = await Promise.all([
    repo.getAudit({ utilisateurId: utilisateur || undefined, action: action || undefined, limit: 300 }),
    repo.listUsers(),
  ]);
  const csv = `/api/journal?${new URLSearchParams({ format: "csv", utilisateur, action })}`;

  return (
    <>
      <SectionTitle
        eyebrow="Administration"
        title="Journal des actions"
        description="Qui a fait quoi, quand et d'où : connexions, décisions sur les propositions des agents, envois, imports, exports, paiements et gestion des comptes. Archivable en CSV (Qualiopi, RGPD)."
      />

      <form className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        <label>
          <span className="block text-ink-muted">Utilisateur</span>
          <select name="utilisateur" defaultValue={utilisateur} className="mt-1 border border-line bg-surface px-2 py-1.5">
            <option value="">Tous</option>
            <option value="secours">Compte de secours</option>
            <option value="systeme">BOS-IA (automatique)</option>
            <option value="anonyme">Anonyme (connexions refusées)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nom}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-ink-muted">Action</span>
          <select name="action" defaultValue={action} className="mt-1 border border-line bg-surface px-2 py-1.5">
            <option value="">Toutes</option>
            {Object.entries(AUDIT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="border border-line px-3 py-1.5 font-semibold hover:border-brand/40">
          Filtrer
        </button>
        <a href={csv} className="bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-deep">
          Exporter en CSV
        </a>
      </form>

      <div className="overflow-x-auto border-y border-line">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-2 pr-4 font-semibold">Date</th>
              <th className="py-2 pr-4 font-semibold">Utilisateur</th>
              <th className="py-2 pr-4 font-semibold">Action</th>
              <th className="py-2 pr-4 font-semibold">Objet</th>
              <th className="py-2 font-semibold">Adresse IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-ink-muted">
                  Aucune entrée.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap py-2 pr-4">{formatDateTime(e.le)}</td>
                  <td className="py-2 pr-4">{e.utilisateur}</td>
                  <td className="py-2 pr-4">{AUDIT_LABELS[e.action] ?? e.action}</td>
                  <td className="py-2 pr-4">
                    {e.objet}
                    {e.details ? <span className="block text-xs text-ink-muted">{e.details}</span> : null}
                  </td>
                  <td className="py-2 text-ink-muted">{e.ip ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-muted">300 dernières entrées affichées ; l&apos;export CSV en contient jusqu&apos;à 5 000.</p>
    </>
  );
}
