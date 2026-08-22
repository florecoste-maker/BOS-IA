import { AgentsClient } from "@/components/agents-client";
import { SectionTitle } from "@/components/ui";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function AgentsPage() {
  return (
    <>
      <SectionTitle
        eyebrow="Digital Nexus"
        title="Écosystème multi-agents"
        description="SMA hiérarchisé : QAA (vérité & conformité), IPOA (optimisation), FCA/MDGA (délégation surveillée). Les processus à haut risque restent sous HITL."
      />
      <AgentsClient
        initialAgents={store.getAgents()}
        initialActions={store.getAgentActions()}
      />
    </>
  );
}
