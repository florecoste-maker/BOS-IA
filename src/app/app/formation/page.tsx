import { FormationClient } from "@/components/formation-client";
import { SectionTitle } from "@/components/ui";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function FormationPage() {
  const repo = await getRepository();
  const [learners, sessions] = await Promise.all([repo.getLearners(), repo.getSessions()]);
  return (
    <>
      <SectionTitle
        eyebrow="Pilier 1 — LMS Audit-Ready"
        title="Pipeline cognitif"
        description="Du lead à la certification : compréhension validée, détection des ghost learners et déclenchement Proof-to-Cash."
      />
      <FormationClient
        initialLearners={learners}
        initialSessions={sessions}
      />
    </>
  );
}
