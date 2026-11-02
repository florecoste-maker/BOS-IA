import { ClientsClient } from "@/components/clients-client";
import { SectionTitle } from "@/components/ui";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const repo = await getRepository();
  const [clients, missions] = await Promise.all([repo.getClients(), repo.getMissions()]);
  return (
    <>
      <SectionTitle
        eyebrow="Relation client"
        title="Clients et missions"
        description="Prospects et entreprises clientes, leur contact principal et les missions vendues (agents IA, automatisations, accompagnement, abonnements). L'adresse e-mail du contact sert aux e-mails que vous approuvez et aux relances de factures."
      />
      <ClientsClient initialClients={clients} initialMissions={missions} />
    </>
  );
}
