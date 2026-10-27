import { redirect } from "next/navigation";
import { SectionTitle } from "@/components/ui";
import { UsersClient } from "@/components/users-client";
import { getRepository } from "@/lib/data";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await getActor();
  if (actor?.role !== "admin") redirect("/app");
  const users = await (await getRepository()).listUsers();

  return (
    <>
      <SectionTitle
        eyebrow="Administration"
        title="Comptes"
        description="Un compte par personne : chaque décision et chaque envoi sont attribués à leur auteur dans le journal. Les membres font le travail courant ; les administrateurs gèrent aussi les comptes et consultent le journal."
      />
      {!isDatabaseConfigured() ? (
        <p className="mb-6 border-l-2 border-warn bg-surface px-3 py-2 text-sm">
          Mode démonstration : les comptes créés ici disparaissent au redémarrage. Connectez la
          base MySQL pour les conserver.
        </p>
      ) : null}
      <UsersClient initialUsers={users} selfId={actor.id} />
      <p className="mt-10 max-w-2xl text-xs text-ink-muted">
        Le mot de passe de secours (BOS_ADMIN_PASSWORD, connexion sans e-mail) reste utilisable en
        cas de perte de tous les accès ; chaque usage est journalisé et signalé par alerte. Une fois
        vos comptes créés, vous pouvez le désactiver avec BOS_SECOURS_DESACTIVE=1 dans hPanel.
      </p>
    </>
  );
}
