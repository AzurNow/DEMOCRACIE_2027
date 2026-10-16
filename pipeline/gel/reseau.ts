/**
 * Le port réseau du gel : une lecture HTTP GET, rien d'autre. Deux usages, et seulement eux
 * (décisions D44, D46) : les deux relais drand (`balise.ts`) et l'API de disponibilité de la Wayback
 * Machine (`engagement.ts`). Les URL sont construites par la logique, jamais par l'adaptateur.
 *
 * L'adaptateur réel est mince, sans logique : `fetch` injecté (comme `outils/reformuler.ts`), aucune
 * redirection suivie (`redirect: "error"` : une redirection ferait lire un hôte que la décision ne
 * nomme pas), le corps rendu en octets exacts, tels que reçus (règle 7). Une erreur réseau remonte
 * telle quelle ; c'est l'appelant qui la nomme. Les tests n'injectent que des adaptateurs de fixture.
 */

export interface ReponseHttp {
  readonly statut: number;
  /** Le corps reçu, octet pour octet, avant tout décodage. */
  readonly octets: Uint8Array;
}

export type LireHttp = (url: string) => Promise<ReponseHttp>;

export type Envoi = (url: string, init: RequestInit) => Promise<Response>;

/** L'adaptateur réel. */
export function lectureParFetch(envoi: Envoi): LireHttp {
  return async (url) => {
    const reponse = await envoi(url, { method: "GET", redirect: "error" });
    return { statut: reponse.status, octets: new Uint8Array(await reponse.arrayBuffer()) };
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
