/**
 * Tendance (§8, QR7/H5).
 *
 * « Comparaison du premier et du dernier run par outil et par mode, sur le seul canal API, sur les
 * questions communes aux deux runs, avec intervalle par bootstrap. […] Toute autre analyse
 * temporelle est exploratoire. » (0.9)
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
import type { IdentifiantCourt, Mode, Question } from "./types.ts";
import { signatureQuestion } from "../pipeline/questions/signature.ts";

export interface EtatRun {
  readonly unites: readonly UniteAnalyse[];
  readonly questions: readonly Question[];
}

export interface TendanceOutilEtMode {
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode;
  readonly questions_communes: number;
  /** Dernier run moins premier run, sur les seules questions communes. */
  readonly difference: DifferenceTaux;
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

/**
 * Une ligne par couple (outil, mode) rencontré dans l'un des deux runs, sur le seul canal API :
 * le canal application est exploratoire (QR8) et n'a pas de mode (§6). Un couple présent à un
 * seul run garde sa ligne, sans différence ni qualificatif — jamais une valeur plausible.
 */
export function tendanceParOutilEtMode(
  premier: EtatRun,
  dernier: EtatRun,
  statistique: Statistique,
  options: OptionsBootstrap,
): TendanceOutilEtMode[] {
  const communes = questionsCommunes(premier.questions, dernier.questions);
  const unitesPremier = unitesComparables(premier.unites, communes);
  const unitesDernier = unitesComparables(dernier.unites, communes);
  return cellules([...unitesPremier, ...unitesDernier]).map(({ outil_id, mode }) => {
    const avant = unitesPremier.filter((u) => u.outil_id === outil_id && u.mode === mode);
    const apres = unitesDernier.filter((u) => u.outil_id === outil_id && u.mode === mode);
    return {
      outil_id,
      mode,
      questions_communes: questionsDesDeux(avant, apres),
      // Graine propre au couple (`graines.ts`) : la clé de l'appelant, suivie de l'outil puis du mode.
      difference: differenceAppariee(apres, avant, statistique, { ...options, cle: [...options.cle, outil_id, mode] }),
    };
  });
}

interface Cellule {
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode;
}

/** Unités du canal API portant sur une question commune. */
function unitesComparables(unites: readonly UniteAnalyse[], communes: ReadonlySet<string>): UniteAnalyse[] {
  return unites.filter((u) => u.canal === "api" && communes.has(u.question_id));
}

/** Couples (outil, mode) dans l'ordre de première apparition. */
function cellules(unites: readonly UniteAnalyse[]): Cellule[] {
  const vues = new Map<string, Cellule>();
  for (const unite of unites) {
    const mode = modeExige(unite);
    const cle = `${unite.outil_id}\0${mode}`;
    if (!vues.has(cle)) vues.set(cle, { outil_id: unite.outil_id, mode });
  }
  return [...vues.values()];
}

/** §6 : le mode est obligatoire au canal api. Son absence est une donnée corrompue, pas un mode. */
function modeExige(unite: UniteAnalyse): Mode {
  if (unite.mode === null) {
    throw new Error(`Réponse ${unite.reponse_id} du canal api sans mode (§6) : tendance incalculable.`);
  }
  return unite.mode;
}

/** Questions que cet outil a effectivement rencontrées dans les deux runs. */
function questionsDesDeux(avant: readonly UniteAnalyse[], apres: readonly UniteAnalyse[]): number {
  const dansApres = new Set(apres.map((u) => u.question_id));
  return new Set(avant.map((u) => u.question_id).filter((id) => dansApres.has(id))).size;
}
