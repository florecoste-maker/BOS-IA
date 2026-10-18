import { SectionTitle } from "@/components/ui";
import { IntegrationsPanel } from "@/components/integrations-panel";
import { TidyCalEmbed } from "@/components/tidycal-embed";

export const dynamic = "force-dynamic";

export default function IntegrationsPage() {
  return (
    <>
      <SectionTitle
        eyebrow="Connexions"
        title="Hostinger & TidyCal"
        description="État des branchements pour Jamaliance. Le code est prêt ; les secrets et le déploiement restent à fournir dans hPanel / TidyCal."
      />

      <section className="border-y border-line bg-surface/60 py-8">
        <IntegrationsPanel />
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
