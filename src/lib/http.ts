import { NextResponse } from "next/server";

/**
 * Redirection relative : derrière le proxy Hostinger, `request.url` peut porter
 * l'adresse interne du serveur Node (0.0.0.0:PORT) au lieu de app.jamaliance.com.
 */
export function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}
