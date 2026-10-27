import { AgentsClient } from "@/components/agents-client";
import { SectionTitle } from "@/components/ui";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const repo = await getRepository();
  const [agents, actions] = await Promise.all([repo.getAgents(), repo.getAgentActions()]);
  return (
    <>
      <SectionTitle
        eyebrow="Digital Nexus"
        title="Écosystème multi-agents"
        description="SMA hiérarchisé : QAA (vérité & conformité), IPOA (optimisation), FCA/MDGA (délégation surveillée). Les processus à haut risque restent sous HITL."
      />
      <AgentsClient
        initialAgents={agents}
        initialActions={actions}
      />
    </>
  );
}
