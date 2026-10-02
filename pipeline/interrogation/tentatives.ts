/**
 * Une tentative : un envoi borné à 180 s, et ce que l'adaptateur de l'éditeur en conclut.
 *
 * L'envoi et la minuterie courent ensemble ; le premier arrivé l'emporte et l'autre est annulé.
 * Une minuterie écoulée est un échec « timeout » ; un échec de transport, « reseau » ; une réponse
 * HTTP est classée par l'adaptateur — réponse, refus de modération (réponse obtenue, jamais
 * retentée) ou échec « http » / « quota ».
 */

import { DELAI_TENTATIVE_MS } from "./conditions.ts";
import { ErreurReseau, type Adaptateur, type Editeur, type ReponseHttp, type RequeteHttp } from "./editeur.ts";
import type { Horloge } from "./horloge.ts";
import type { ErreurTentative, ObjetJson } from "./types.ts";

type Envoi =
  | { readonly genre: "http"; readonly reponse: ReponseHttp }
  | { readonly genre: "reseau"; readonly message: string }
  | { readonly genre: "timeout" }
  | { readonly genre: "abandonne" };

export type Conclusion =
  | { readonly genre: "obtenue"; readonly brut: ObjetJson; readonly refus_api: boolean }
  | { readonly genre: "echec"; readonly erreur: ErreurTentative };

export const MESSAGE_TIMEOUT = `Aucune réponse au bout de ${DELAI_TENTATIVE_MS / 1000} s : tentative abandonnée.`;

/**
 * L'envoi, ramené à une issue. Une fois l'envoi abandonné (minuterie écoulée), son rejet n'est plus
 * attendu par personne : il devient « abandonne ». Avant cela, toute erreur qui n'est pas un échec
 * de transport remonte telle quelle.
 */
function transporter(editeur: Editeur, requete: RequeteHttp, signal: AbortSignal): Promise<Envoi> {
  return editeur.transport.envoyer(requete, signal).then(
    (reponse): Envoi => ({ genre: "http", reponse }),
    (erreur: unknown): Envoi => {
      if (signal.aborted) return { genre: "abandonne" };
      if (erreur instanceof ErreurReseau) return { genre: "reseau", message: erreur.message };
      throw erreur;
    },
  );
}

export async function envoyerSousDelai(editeur: Editeur, requete: RequeteHttp, horloge: Horloge): Promise<Envoi> {
  const arretEnvoi = new AbortController();
  const arretMinuterie = new AbortController();
  const minuterie = horloge
    .attendre(DELAI_TENTATIVE_MS, arretMinuterie.signal)
    .then((issue): Envoi => (issue === "ecoulee" ? { genre: "timeout" } : { genre: "abandonne" }));
  try {
    return await Promise.race([transporter(editeur, requete, arretEnvoi.signal), minuterie]);
  } finally {
    arretMinuterie.abort();
    arretEnvoi.abort();
  }
}

function conclureHttp(reponse: ReponseHttp, adaptateur: Adaptateur): Conclusion {
  const classement = adaptateur.classer(reponse);
  switch (classement.issue) {
    case "reponse":
      return { genre: "obtenue", brut: classement.brut, refus_api: false };
    case "refus_api":
      return { genre: "obtenue", brut: classement.brut, refus_api: true };
    case "echec":
      return { genre: "echec", erreur: classement.erreur };
  }
}

export function conclure(envoi: Envoi, adaptateur: Adaptateur): Conclusion {
  switch (envoi.genre) {
    case "http":
      return conclureHttp(envoi.reponse, adaptateur);
    case "reseau":
      return { genre: "echec", erreur: { type: "reseau", message: envoi.message } };
    case "timeout":
      return { genre: "echec", erreur: { type: "timeout", message: MESSAGE_TIMEOUT } };
    case "abandonne":
      throw new Error("Envoi abandonné avant d'avoir été attendu : course entre envoi et minuterie incohérente.");
  }
}
