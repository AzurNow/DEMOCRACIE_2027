/**
 * Le délai d'abandon d'un appel d'extraction (`delai_abandon_ms` de `config/extraction.json`, jamais
 * envoyé à l'API), posé autour d'un transport : l'envoi et la minuterie courent ensemble, le premier
 * arrivé l'emporte et l'autre est annulé. Un délai écoulé interrompt l'envoi et rejette
 * `ErreurReseau`, comme un échec de transport : rien n'est reçu, donc rien n'est écrit.
 *
 * Même règle que l'exécution de `pnpm reformuler` (`pipeline/reformulation/executer.ts`), mise ici
 * sous la forme d'un transport, que `editeur.ts:appelerExtracteur` reçoit tel quel.
 */

import { ErreurReseau, type ReponseHttp, type RequeteHttp, type Transport } from "../interrogation/editeur.ts";
import type { Horloge } from "../interrogation/horloge.ts";

type Course = { readonly genre: "reponse"; readonly reponse: ReponseHttp } | { readonly genre: "rejet"; readonly erreur: unknown } | { readonly genre: "minuterie" };

interface Reglage {
  readonly delai_ms: number;
  readonly attendre: Horloge["attendre"];
}

async function courir(transport: Transport, requete: RequeteHttp, signal: AbortSignal, reglage: Reglage): Promise<Course> {
  const arretEnvoi = new AbortController();
  signal.addEventListener("abort", () => arretEnvoi.abort(), { once: true });
  const arretMinuterie = new AbortController();
  const envoi = transport.envoyer(requete, arretEnvoi.signal).then(
    (reponse): Course => ({ genre: "reponse", reponse }),
    (erreur: unknown): Course => ({ genre: "rejet", erreur }),
  );
  const minuterie = reglage.attendre(reglage.delai_ms, arretMinuterie.signal).then((): Course => ({ genre: "minuterie" }));
  try {
    return await Promise.race([envoi, minuterie]);
  } finally {
    arretMinuterie.abort();
    arretEnvoi.abort();
  }
}

export function transportSousDelai(transport: Transport, delai_ms: number, attendre: Horloge["attendre"]): Transport {
  return {
    async envoyer(requete, signal) {
      const course = await courir(transport, requete, signal, { delai_ms, attendre });
      if (course.genre === "reponse") return course.reponse;
      if (course.genre === "rejet") throw course.erreur;
      throw new ErreurReseau(`Aucune réponse de ${requete.endpoint} au bout de ${delai_ms} ms : appel abandonné.`);
    },
  };
}
