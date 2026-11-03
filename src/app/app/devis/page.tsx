import { DevisClient } from "@/components/devis-client";
import { SectionTitle } from "@/components/ui";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DevisPage() {
  const repo = await getRepository();
  const [quotes, clients, missions] = await Promise.all([repo.getQuotes(), repo.getClients(), repo.getMissions()]);
  return (
    <>
      <SectionTitle
        eyebrow="Commercial"
        title="Devis"
        description="Devis par lignes (désignation, quantité, prix HT), avec TVA et date de validité. Un devis envoyé apparaît dans l'espace du client ; une fois accepté, « Créer la facture » le transforme en facture émise, une seule fois."
      />
      <DevisClient initialQuotes={quotes} clients={clients} missions={missions} />
    </>
  );
}
