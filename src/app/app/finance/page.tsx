import { FinanceClient } from "@/components/finance-client";
import { SectionTitle } from "@/components/ui";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const repo = await getRepository();
  const [dossiers, invoices] = await Promise.all([repo.getOpcoDossiers(), repo.getInvoices()]);
  return (
    <>
      <SectionTitle
        eyebrow="Pilier 2 — ERP OPCO-Ready"
        title="Machine administrative & financière"
        description="Complétude des dossiers de financement, facturation 30/70 et suivi du délai de paiement cible sous 30 jours."
      />
      <FinanceClient
        initialDossiers={dossiers}
        initialInvoices={invoices}
      />
    </>
  );
}
