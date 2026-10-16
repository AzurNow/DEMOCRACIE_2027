/**
 * Le port réseau du gel : une lecture HTTP GET, rien d'autre. Deux usages, et seulement eux
 * (décisions D44, D46) : les deux relais drand (`balise.ts`) et l'API de disponibilité de la Wayback
 * Machine (`engagement.ts`). Les URL sont construites par la logique, jamais par l'adaptateur.
 *
 * L'adaptateur réel est mince, sans logique : `fetch` injecté (comme `outils/reformuler.ts`), aucune
 * redirection suivie (`redirect: "error"` : une redirection ferait lire un hôte que la décision ne
 * nomme pas), le corps rendu en octets exacts, tels que reçus (règle 7). D47 (4) : chaque appel est
 * abandonné après `DELAI_APPEL_RESEAU_MS` ; le dépassement lève `DelaiDepasse`, qui nomme l'URL, et
 * aucune nouvelle tentative n'est faite. Toute autre erreur réseau remonte telle quelle ; c'est
 * l'appelant qui la nomme. Les tests n'injectent que des adaptateurs de fixture.
 */

/** D47 (4) : le délai d'abandon de chaque appel réseau du gel. */
export const DELAI_APPEL_RESEAU_MS = 30_000;

export interface ReponseHttp {
  readonly statut: number;
  /** Le corps reçu, octet pour octet, avant tout décodage. */
  readonly octets: Uint8Array;
}

export type LireHttp = (url: string) => Promise<ReponseHttp>;

export type Envoi = (url: string, init: RequestInit) => Promise<Response>;

/** Un appel abandonné au bout du délai : refus, jamais une nouvelle tentative. */
export class DelaiDepasse extends Error {
  constructor(url: string, delai_ms: number) {
    super(`${url} : aucune réponse complète en ${delai_ms} ms, appel abandonné (D47), sans nouvelle tentative.`);
    this.name = "DelaiDepasse";
  }
}

function estAbandon(erreur: unknown): boolean {
  return erreur instanceof Error && (erreur.name === "TimeoutError" || erreur.name === "AbortError");
}

/** L'adaptateur réel ; `delai_ms` vaut `DELAI_APPEL_RESEAU_MS` en production, un délai court en test. */
export function lectureParFetch(envoi: Envoi, delai_ms: number): LireHttp {
  return async (url) => {
    try {
      const reponse = await envoi(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(delai_ms) });
      return { statut: reponse.status, octets: new Uint8Array(await reponse.arrayBuffer()) };
    } catch (erreur) {
      if (estAbandon(erreur)) throw new DelaiDepasse(url, delai_ms);
      throw erreur;
    }
  };
}

/** Le message d'une erreur levée par un adaptateur, pour la nommer dans un refus. */
export function messageDErreur(erreur: unknown): string {
  return erreur instanceof Error ? `${erreur.name} : ${erreur.message}` : String(erreur);
}

/** Le corps décodé en UTF-8 strict puis lu en JSON ; lève `SyntaxError` ou `TypeError` sinon. */
export function jsonDesOctets(octets: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(octets));
}
