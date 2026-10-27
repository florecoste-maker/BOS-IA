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
          Vous êtes connecté avec le mot de passe de secours, qui se change dans hPanel
          (BOS_ADMIN_PASSWORD). Créez plutôt votre compte nominatif dans « Comptes ».
        </p>
      ) : (
        <AccountClient />
      )}
    </>
  );
}
