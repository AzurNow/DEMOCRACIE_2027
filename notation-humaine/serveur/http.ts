/**
 * La plomberie HTTP de l'écran de notation humaine : en-têtes, fichiers statiques, corps JSON.
 *
 * Mêmes garanties que le serveur de l'interface de validation (`validation/serveur/principal.ts`),
 * dont ce module reprend la politique de sécurité telle quelle plutôt que de la modifier : aucune
 * origine externe, aucune réponse mise en cache. Elle est recopiée et non partagée pour ne pas
 * toucher à `pnpm validate` ; un test garde les deux politiques identiques.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

export interface Reponse {
  readonly statut: number;
  readonly corps?: unknown;
  readonly binaire?: Buffer;
  readonly type_mime?: string;
}

export const POLITIQUE_SECURITE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "frame-src 'self'",
  "connect-src 'self'",
  "form-action 'none'",
].join("; ");

const TYPES_STATIQUES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

/** Un corps de requête qui n'est pas du JSON : une erreur de l'appelant (400), pas du serveur. */
export class CorpsIllisible extends Error {
  constructor(detail: string) {
    super(`Corps de requête illisible : ${detail}`);
    this.name = "CorpsIllisible";
  }
}

export async function lireCorps(requete: IncomingMessage): Promise<unknown> {
  const morceaux: Buffer[] = [];
  for await (const morceau of requete) morceaux.push(morceau as Buffer);
  const texte = Buffer.concat(morceaux).toString("utf8");
  if (texte.length === 0) return null;
  try {
    return JSON.parse(texte);
  } catch (erreur) {
    throw new CorpsIllisible(erreur instanceof Error ? erreur.message : String(erreur));
  }
}

/** Sert un fichier de `dossier_client`, et de lui seul. */
export function servirStatique(dossier_client: string, chemin: string): Reponse {
  const relatif = chemin === "/" ? "index.html" : chemin.replace(/^\/+/, "");
  const complet = join(dossier_client, relatif);
  if (!complet.startsWith(dossier_client) || !existsSync(complet)) {
    return { statut: 404, corps: { erreur: `Introuvable : ${chemin}` } };
  }
  return { statut: 200, binaire: readFileSync(complet), type_mime: TYPES_STATIQUES[extname(complet)] ?? "application/octet-stream" };
}

export function repondre(reponse: ServerResponse, resultat: Reponse): void {
  const entetes: Record<string, string> = {
    "content-security-policy": POLITIQUE_SECURITE,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
  };
  if (resultat.binaire !== undefined) {
    reponse.writeHead(resultat.statut, { ...entetes, "content-type": resultat.type_mime ?? "application/octet-stream" });
    reponse.end(resultat.binaire);
    return;
  }
  reponse.writeHead(resultat.statut, { ...entetes, "content-type": "application/json; charset=utf-8" });
  reponse.end(JSON.stringify(resultat.corps));
}
