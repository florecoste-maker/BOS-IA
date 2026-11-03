import { ClientsClient } from "@/components/clients-client";
import { SectionTitle } from "@/components/ui";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const repo = await getRepository();
  const [clients, contacts, missions] = await Promise.all([repo.getClients(), repo.getContacts(), repo.getMissions()]);
  return (
    <>
      <SectionTitle
        eyebrow="Relation client"
        title="Entreprises clientes"
        description="Chaque entreprise cliente a son espace : ses contacts (interlocuteurs, et leurs propres clients pour ses agents IA), ses missions, devis, factures et paiements. L'e-mail de la fiche sert aux e-mails que vous approuvez et aux relances de factures."
      />
      <ClientsClient initialClients={clients} initialContacts={contacts} initialMissions={missions} />
    </>
  );
}
