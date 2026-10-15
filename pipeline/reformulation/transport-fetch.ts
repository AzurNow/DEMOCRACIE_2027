/**
 * Le transport réel : le `fetch` natif de Node, sans SDK ni dépendance (D3 : le corps stocké est le
 * corps HTTP tel que reçu, jamais l'objet d'un SDK).
 *
 * Il rend le statut et les octets du corps, lus en entier, sans décodage. Un échec avant ou pendant
 * la lecture du corps (connexion refusée, coupée, nom introuvable) est un échec de transport :
 * `ErreurReseau`, dont le message ne reprend ni la requête ni ses en-têtes, donc jamais la clé.
 *
 * `envoi` est injecté : la commande passe `globalThis.fetch`, les tests un faux. Aucun test
 * n'appelle le réseau.
 */

import { ErreurReseau, type RequeteHttp, type ReponseHttp, type Transport } from "../interrogation/editeur.ts";

export type Envoi = (url: string, init: RequestInit) => Promise<Response>;

function raisonDe(erreur: unknown): string {
  if (!(erreur instanceof Error)) return String(erreur);
  const cause: unknown = erreur.cause;
  return cause instanceof Error ? `${erreur.message} (${cause.message})` : erreur.message;
}

async function recevoir(envoi: Envoi, requete: RequeteHttp, signal: AbortSignal): Promise<ReponseHttp> {
  const reponse = await envoi(requete.endpoint, {
    method: "POST",
    headers: requete.entetes,
    body: JSON.stringify(requete.corps),
    signal,
  });
  return { statut: reponse.status, corps: new Uint8Array(await reponse.arrayBuffer()) };
}

export function transportFetch(envoi: Envoi): Transport {
  return {
    async envoyer(requete, signal) {
      try {
        return await recevoir(envoi, requete, signal);
      } catch (erreur) {
        throw new ErreurReseau(`Échec de transport vers ${requete.endpoint} : ${raisonDe(erreur)}`);
      }
    },
  };
}
