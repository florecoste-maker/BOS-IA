import { NextResponse, after } from "next/server";
import { withRecipients } from "@/lib/actions/execute";
import { AgentRunError, runAgent } from "@/lib/agents/claude";
import { finishJob, getJob, runningJobFor, startJob } from "@/lib/agents/jobs";
import { audit } from "@/lib/audit";
import { getRepository } from "@/lib/data";
import { NO_STORE } from "@/lib/http";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": NO_STORE } });

/**
 * Lance l'analyse IA d'un agent en arrière-plan et répond aussitôt (202) avec
 * l'identifiant de l'analyse : une requête de plus d'une minute serait coupée
 * par le CDN / proxy Hostinger. Le résultat se lit avec GET ?id=…
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { agentId?: string };
  if (!body.agentId) return json({ error: "agentId requis" }, 400);
  const agentId = body.agentId;

  const repo = await getRepository();
  if (!(await repo.getAgents()).some((a) => a.id === agentId)) return json({ error: "Agent introuvable" }, 404);

  const existing = runningJobFor(agentId);
  if (existing) return json({ jobId: existing, statut: "en_cours" }, 202);

  // Session lue maintenant : après la réponse, la requête n'est plus disponible.
  const actor = await getActor();
  const jobId = startJob(agentId);
  after(async () => {
    try {
      const run = await runAgent(agentId);
      finishJob(jobId, { run });
      await audit(actor, "analyse_lancee", agentId, { details: { actions: run?.actions.length ?? 0 } });
    } catch (error) {
      if (error instanceof AgentRunError) {
        finishJob(jobId, { erreur: error.message, code: error.status });
      } else {
        console.error("Exécution agent échouée", error);
        finishJob(jobId, { erreur: "Erreur interne pendant l'analyse", code: 500 });
      }
    }
  });
  return json({ jobId, statut: "en_cours" }, 202);
}

/** État d'une analyse : en cours, réussie (avec agents et actions à jour) ou en échec (avec la raison). */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const job = getJob(id);
  if (!job) {
    return json({ error: "Analyse introuvable : le serveur a peut-être redémarré. Relancez l'analyse." }, 404);
  }
  if (job.statut === "en_cours") {
    return json({ statut: "en_cours", depuis: Math.round((Date.now() - job.debut) / 1000) });
  }
  if (job.statut === "echec") return json({ statut: "echec", error: job.erreur, code: job.code });
  const repo = await getRepository();
  return json({
    statut: "succes",
    run: job.run,
    agents: await repo.getAgents(),
    actions: await withRecipients(repo, await repo.getAgentActions()),
  });
}
