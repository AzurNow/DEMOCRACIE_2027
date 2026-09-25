/**
 * Tendance (§8, QR7/H5).
 *
 * « Comparaison du premier et du dernier run par outil, sur les questions communes aux deux
 * runs, avec intervalle par bootstrap. Toute autre analyse temporelle est exploratoire. »
 *
 * Une question est commune quand son identifiant ET l'empreinte de ses trois formulations sont
 * identiques dans les deux runs (schema/question.schema.json : « même identifiant ET même
 * empreinte : une correction d'item qui change le texte casse la reprise explicitement au lieu
 * de faire passer une mesure d'amélioration pour une mesure de notre propre correction »).
 *
 * La différence est orientée dernier − premier : un chiffre positif dit que le taux a monté
 * entre les deux runs, et rien d'autre. Ni « meilleur », ni « pire » (§8).
 */

import { differenceAppariee, type DifferenceTaux, type OptionsBootstrap, type Statistique } from "./bootstrap.ts";
import type { UniteAnalyse } from "./filtre.ts";
import type { IdentifiantCourt, Question } from "./types.ts";

export interface EtatRun {
  readonly unites: readonly UniteAnalyse[];
  readonly questions: readonly Question[];
}

export interface TendanceOutil {
  readonly outil_id: IdentifiantCourt;
  readonly questions_communes: number;
  /** Dernier run moins premier run, sur les seules questions communes. */
  readonly difference: DifferenceTaux;
}

export function signatureQuestion(question: Question): string {
  const empreintes = question.formulations.map((f) => f.empreinte_texte).sort();
  return `${question.id}\0${empreintes.join("\0")}`;
}

export function questionsCommunes(
  premier: readonly Question[],
  dernier: readonly Question[],
): Set<string> {
  const signaturesDernier = new Set(dernier.map(signatureQuestion));
  const communes = new Set<string>();
  for (const question of premier) {
    if (signaturesDernier.has(signatureQuestion(question))) communes.add(question.id);
  }
  return communes;
}

export function tendanceParOutil(
  premier: EtatRun,
  dernier: EtatRun,
  statistique: Statistique,
  options: OptionsBootstrap,
): TendanceOutil[] {
  const communes = questionsCommunes(premier.questions, dernier.questions);
  const unitesPremier = premier.unites.filter((u) => communes.has(u.question_id));
  const unitesDernier = dernier.unites.filter((u) => communes.has(u.question_id));
  const outils = [...new Set([...unitesPremier, ...unitesDernier].map((u) => u.outil_id))];
  return outils.map((outil_id) => {
    const avant = unitesPremier.filter((u) => u.outil_id === outil_id);
    const apres = unitesDernier.filter((u) => u.outil_id === outil_id);
    return {
      outil_id,
      questions_communes: questionsDesDeux(avant, apres),
      // Graine propre à l'outil (`graines.ts`) : la clé de l'appelant, suivie de l'outil.
      difference: differenceAppariee(apres, avant, statistique, { ...options, cle: [...options.cle, outil_id] }),
    };
  });
}

/** Questions que cet outil a effectivement rencontrées dans les deux runs. */
function questionsDesDeux(avant: readonly UniteAnalyse[], apres: readonly UniteAnalyse[]): number {
  const dansApres = new Set(apres.map((u) => u.question_id));
  return new Set(avant.map((u) => u.question_id).filter((id) => dansApres.has(id))).size;
}
