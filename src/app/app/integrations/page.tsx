import { SectionTitle } from "@/components/ui";
import { IntegrationsPanel } from "@/components/integrations-panel";
import { TidyCalEmbed } from "@/components/tidycal-embed";
import { isVercel } from "@/lib/auth";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const actor = await getActor();
  return (
    <>
      <SectionTitle
        eyebrow="Connexions"
        title="Hostinger & TidyCal"
        description="Vitrine = jamaliance.com (Horizons, intacte). Moteur BOS-IA sur Hostinger (Web App Node.js). Base de données et e-mails se règlent ci-dessous (administrateurs)."
      />

      <section className="border-y border-line bg-surface/60 py-8">
        <IntegrationsPanel isAdmin={actor?.role === "admin"} reglagesServeur={!isVercel()} />
      </section>

      <section className="mt-14">
        <TidyCalEmbed
          title="Aperçu calendrier"
          description="Embed public une fois NEXT_PUBLIC_TIDYCAL_URL renseigné. Les listes et créations de rendez-vous via API utilisent TIDYCAL_API_TOKEN."
        />
      </section>
    </>
  );
}
