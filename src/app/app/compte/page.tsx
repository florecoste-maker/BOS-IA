import { redirect } from "next/navigation";
import { AccountClient } from "@/components/account-client";
import { SectionTitle } from "@/components/ui";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return (
    <>
      <SectionTitle
        eyebrow="Mon compte"
        title={actor.nom}
        description={actor.role === "admin" ? "Administrateur" : "Membre"}
      />
      {actor.secours ? (
        <p className="max-w-2xl text-sm text-ink-muted">
          Compte de l&apos;administratrice principale : connexion avec cette adresse et le mot de
          passe administrateur, enregistré sur le serveur (il ne disparaît pas au redémarrage).
          Pour le changer : GitHub → BOS-IA-Hostinger → Actions → « Installation du cockpit » →
          « Mot de passe administrateur oublié ».
        </p>
      ) : (
        <AccountClient />
      )}
    </>
  );
}
