import { NextResponse } from "next/server";

/** Réponses liées à la session : jamais gardées par le navigateur ni par le CDN. */
export const NO_STORE = "private, no-store, max-age=0";

/**
 * Redirection relative : derrière le proxy Hostinger, `request.url` peut porter
 * l'adresse interne du serveur Node (0.0.0.0:PORT) au lieu de app.jamaliance.com.
 */
export function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": NO_STORE } });
}
