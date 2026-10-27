import { ImportClient } from "@/components/import-client";
import { SectionTitle } from "@/components/ui";
import { isDatabaseConfigured } from "@/lib/db/config";
import { FIELDS, IMPORT_KINDS } from "@/lib/import/schema";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  const enabled = isDatabaseConfigured();
  return (
    <>
      <SectionTitle
        eyebrow="Données"
        title="Import CSV / Excel"
        description="Chargez vos sessions, apprenants, dossiers OPCO et factures depuis un tableur. Vérifiez d'abord : rien n'est enregistré tant qu'une ligne est en erreur."
      />

      {!enabled ? (
        <p className="mb-8 border-l-2 border-warn bg-surface px-3 py-2 text-sm">
          L&apos;import nécessite la base MySQL : configurez DB_HOST, DB_NAME, DB_USER et
          DB_PASSWORD dans hPanel (voir Connexions), puis redémarrez.
        </p>
      ) : null}

      <ImportClient
        kinds={IMPORT_KINDS.map(({ kind, label }) => ({ kind, label }))}
        enabled={enabled}
      />

      <section className="mt-14 max-w-3xl text-sm">
        <h2 className="font-display text-xl font-semibold">Mode d&apos;emploi</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink-muted">
          <li>
            Importez dans cet ordre : sessions, apprenants, dossiers OPCO, factures (chaque
            type fait référence au précédent).
          </li>
          <li>
            Téléchargez le modèle, remplissez-le dans Excel puis enregistrez en .xlsx ou en
            CSV. La première feuille est lue ; la première ligne contient les en-têtes.
          </li>
          <li>
            Une ligne déjà présente (même code, e-mail, référence ou numéro) est mise à jour ;
            une cellule vide conserve la valeur enregistrée.
          </li>
        </ol>
      </section>

      <section className="mt-10 grid gap-10 lg:grid-cols-2">
        {IMPORT_KINDS.map(({ kind, label }) => (
          <article key={kind} className="border-t border-line pt-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">{label}</h3>
              <a
                href={`/api/import/modele?type=${kind}`}
                className="font-semibold text-brand hover:text-brand-deep"
              >
                Télécharger le modèle
              </a>
            </div>
            <ul className="mt-3 space-y-1 text-ink-muted">
              {FIELDS[kind].map((f) => (
                <li key={f.key}>
                  <code className="text-ink">{f.header}</code>
                  {f.required ? <span className="text-danger"> *</span> : null}
                  {f.help ? ` — ${f.help}` : ""}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      <p className="mt-6 text-xs text-ink-muted">* colonne obligatoire</p>

      <section className="mt-14 max-w-3xl border-t border-line pt-8 text-sm">
        <h2 className="font-display text-xl font-semibold">Exporter et sauvegarder</h2>
        <p className="mt-2 text-ink-muted">
          Les exports CSV ont exactement le format de l&apos;import : en cas de besoin, ils se
          réimportent tels quels pour restaurer les données. La sauvegarde complète (JSON)
          contient aussi les agents et leur journal récent.
        </p>
        <ul className="mt-4 flex flex-wrap gap-3">
          <li>
            <a
              href="/api/export?format=json"
              className="inline-block bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-deep"
            >
              Sauvegarde complète (JSON)
            </a>
          </li>
          {IMPORT_KINDS.map(({ kind, label }) => (
            <li key={kind}>
              <a
                href={`/api/export?format=csv&type=${kind}`}
                className="inline-block border border-line px-3 py-1.5 font-semibold hover:border-brand/40"
              >
                {label} (CSV)
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-muted">
          Ces fichiers contiennent des données personnelles : conservez-les dans un espace
          protégé. Une sauvegarde hebdomadaire peut aussi partir par e-mail (voir Connexions).
        </p>
      </section>
    </>
  );
}
