import { SESSION_COOKIE } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { redirectTo } from "@/lib/http";
import { getActor } from "@/lib/session";

export async function POST(request: Request) {
  const actor = await getActor().catch(() => null);
  if (actor) await audit(actor, "deconnexion", actor.nom, { request });
  const response = redirectTo("/login");
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
