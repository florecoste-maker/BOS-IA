import { notFound } from "next/navigation";
import { Metric, SectionTitle, StatusPill } from "@/components/ui";
import { brand } from "@/lib/brand";
import { getRepository } from "@/lib/data";
import { clientView } from "@/lib/espace";
import {
  CONTACT_CATEGORY_LABELS,
  formatDate,
  formatMoneyCents,
  missionTypeLabel,
  paymentModeLabel,
  statusLabel,
} from "@/lib/format";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

function tone(status: string) {
  if (["payee", "accepte", "facture", "terminee", "livree"].includes(status)) return "ok" as const;
  if (["relance", "impayee", "refuse", "expire"].includes(status)) return "danger" as const;
  if (["partiellement_payee"].includes(status)) return "warn" as const;
  return "brand" as const;
}

export default async function EspacePage() {
  const actor = await getActor();
  // L'entreprise vient du compte connecté, relu en base : jamais d'un paramètre.
  if (actor?.role !== "client" || !actor.clientId) notFound();
  const space = await (await getRepository()).getSpace(actor.clientId);
  if (!space) notFound();
  const v = clientView(space);
  const reste = v.factures.reduce((s, f) => s + f.resteDu, 0);
  const enAttente = v.devis.filter((d) => d.status === "envoye");

  return (
    <>
      <SectionTitle
        eyebrow="Espace client"
        title={v.entreprise.nom}
        description={`Vos devis, factures, paiements et missions avec ${brand.agency}. Une question ? Écrivez à ${brand.email}.`}
      />

      <section className="grid gap-6 border-y border-line bg-surface/60 py-6 md:grid-cols-3 md:gap-0">
        <Metric label="Reste à régler" value={formatMoneyCents(reste)} hint="Factures émises (TTC)" />
        <Metric label="Devis à valider" value={String(enAttente.length)} hint="Envoyés, en attente de votre accord" />
        <Metric
          label="Missions en cours"
          value={String(v.missions.filter((m) => m.statut === "en_cours").length)}
          hint={`${v.missions.length} mission${v.missions.length > 1 ? "s" : ""} au total`}
        />
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold">Factures</h2>
        {v.factures.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Aucune facture.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {v.factures.map((f) => (
              <li key={f.id} className="py-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-ink">
                    {f.numero}
                    {f.objet ? <span className="font-normal text-ink-muted"> · {f.objet}</span> : null}
                  </p>
                  <StatusPill label={statusLabel(f.status)} tone={tone(f.status)} />
                </div>
                <p className="mt-1 text-ink-muted">
                  {formatMoneyCents(f.montantTTC)} TTC · émise le {formatDate(f.emiseLe)} · échéance {formatDate(f.echeance)}
                  {f.joursRetard > 0 ? <span className="text-danger"> · en retard de {f.joursRetard} j</span> : null}
                </p>
                <p className="text-ink-muted">
                  Réglé {formatMoneyCents(f.montantPaye)}
                  {f.status !== "annulee" ? (
                    <>
                      {" "}· Reste à régler <span className="font-medium text-ink">{formatMoneyCents(f.resteDu)}</span>
                    </>
                  ) : null}
                </p>
                {v.paiements.some((p) => p.factureId === f.id) ? (
                  <ul className="mt-2 space-y-0.5 border-l-2 border-ok/40 pl-3 text-xs text-ink-muted">
                    {v.paiements
                      .filter((p) => p.factureId === f.id)
                      .map((p) => (
                        <li key={p.id}>
                          {formatDate(p.date)} · {formatMoneyCents(p.montant)} · {paymentModeLabel(p.mode)}
                        </li>
                      ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold">Devis</h2>
        {v.devis.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Aucun devis.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {v.devis.map((d) => (
              <li key={d.id} className="py-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-ink">
                    {d.numero} · <span className="font-normal">{d.objet}</span>
                  </p>
                  <StatusPill label={statusLabel(d.status)} tone={tone(d.status)} />
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
                  {d.lignes.map((l, i) => (
                    <li key={i}>
                      {l.designation} — {String(l.quantite).replace(".", ",")} × {formatMoneyCents(l.prixUnitaireHT)} HT
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-ink-muted">
                  {formatMoneyCents(d.montantHT)} HT · <span className="font-medium text-ink">{formatMoneyCents(d.montantTTC)} TTC</span>{" "}
                  · valable jusqu&apos;au {formatDate(d.valableJusquau)}
                </p>
                {d.status === "envoye" ? (
                  <p className="mt-1 text-xs text-ink-muted">
                    Pour l&apos;accepter, répondez à {brand.email} en indiquant le numéro {d.numero}.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-xl font-semibold">Missions</h2>
          {v.missions.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Aucune mission.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {v.missions.map((m) => (
                <li key={m.id} className="border-b border-line pb-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-ink">{m.titre}</p>
                    <StatusPill label={statusLabel(m.statut)} tone={tone(m.statut)} />
                  </div>
                  <p className="text-ink-muted">
                    {missionTypeLabel(m.type)}
                    {m.debut ? ` · début ${formatDate(m.debut)}` : ""}
                    {m.fin ? ` · fin prévue ${formatDate(m.fin)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">Contacts de votre entreprise</h2>
          {v.contacts.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Aucun contact enregistré.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {v.contacts.map((c) => (
                <li key={c.id} className="border-b border-line pb-3 text-sm">
                  <p className="font-medium text-ink">
                    {[c.prenom, c.nom].filter(Boolean).join(" ")}
                    {c.fonction ? <span className="font-normal text-ink-muted"> · {c.fonction}</span> : null}
                  </p>
                  <p className="text-ink-muted">
                    {[c.email, c.telephone].filter(Boolean).join(" · ")}
                    {c.email || c.telephone ? " · " : ""}
                    {c.principal ? "Interlocuteur principal" : CONTACT_CATEGORY_LABELS[c.categorie]}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
