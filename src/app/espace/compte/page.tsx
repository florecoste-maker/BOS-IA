import { AccountClient } from "@/components/account-client";
import { SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function EspaceComptePage() {
  return (
    <>
      <SectionTitle eyebrow="Mon compte" title="Mot de passe" description="12 caractères minimum." />
      <AccountClient />
    </>
  );
}
