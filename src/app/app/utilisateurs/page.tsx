import { redirect } from "next/navigation";
import { SectionTitle } from "@/components/ui";
import { UsersClient } from "@/components/users-client";
import { getRepository } from "@/lib/data";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getActor } from "@/lib/session";
import { ownerEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await getActor();
  if (actor?.role !== "admin") redirect("/app");
  const repo = await getRepository();
  const [users, clients] = await Promise.all([repo.listUsers(), repo.getClients()]);

  return (
    <>
      <SectionTitle
        eyebrow="Administration"
        title="Comptes"
        description="Un compte par personne : chaque décision et chaque envoi sont attribués à leur auteur dans le journal. Les membres font le travail courant ; les administrateurs gèrent aussi les comptes et consultent le journal. Un compte client ne voit que l'espace de son entreprise (devis, factures, paiements, missions, contacts)."
      />
      {!isDatabaseConfigured() ? (
        <p className="mb-6 border-l-2 border-warn bg-surface px-3 py-2 text-sm">
          Votre accès administrateur ({ownerEmail()}) est enregistré sur le serveur : aucun compte
          à créer pour vous. Les comptes de l&apos;équipe et des clients seront disponibles une fois
          la base MySQL reliée (Connexions → Réglages du serveur) ; sans elle, ils seraient effacés
          à chaque redémarrage, d&apos;où leur création désactivée.
        </p>
      ) : null}
      <UsersClient
        initialUsers={users}
        selfId={actor.id}
        clients={clients.map((c) => ({ id: c.id, nom: c.nom }))}
        creationPossible={isDatabaseConfigured()}
      />
      <p className="mt-10 max-w-2xl text-xs text-ink-muted">
        L&apos;accès administrateur ({ownerEmail()} et le mot de passe administrateur) ne dépend
        d&apos;aucun compte en base : il reste disponible même si la base est indisponible. Chaque
        connexion est journalisée et signalée par alerte.
      </p>
    </>
  );
}
