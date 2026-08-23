import { FormationClient } from "@/components/formation-client";
import { SectionTitle } from "@/components/ui";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function FormationPage() {
  return (
    <>
      <SectionTitle
        eyebrow="Pilier 1 — LMS Audit-Ready"
        title="Pipeline cognitif"
        description="Du lead à la certification : compréhension validée, détection des ghost learners et déclenchement Proof-to-Cash."
      />
      <FormationClient
        initialLearners={store.getLearners()}
        initialSessions={store.getSessions()}
      />
    </>
  );
}
