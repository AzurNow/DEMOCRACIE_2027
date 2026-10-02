/**
 * Appariement de deux bras avant une différence (§8), écrit une seule fois.
 *
 * Une clé présente dans un seul bras sort de la comparaison et est nommée dans `exclues`. Elle
 * n'est jamais remplacée par une moyenne, un zéro ou un report : comparer deux bras sur des
 * ensembles différents ne mesure plus ce qui les distingue.
 *
 * Deux lecteurs, deux clés :
 * - les effets de condition (`conditions.ts`) apparient par item, `grappe_id` (§8, « différences
 *   appariées par item ») ;
 * - la tendance (`tendance.ts`) apparie par question, `question_id` : une question commune dont
 *   l'outil n'a de réponse obtenue qu'à l'un des deux runs sort de la comparaison (décision de
 *   l'auteur du 2026-10-02, conformité n° 21, texte en 0.15). Une réponse manquante ne forme pas
 *   d'unité (`filtre.ts`) : « absente d'un bras » et « non obtenue à ce run » sont la même chose.
 *
 * Les clés retenues sont un sous-ensemble des grappes de chaque bras : après appariement, les deux
 * bras ont exactement les mêmes grappes, et le bootstrap apparié (`bootstrap.ts`) tire dans leur
 * réunion, qui est alors leur intersection.
 */

import type { UniteAnalyse } from "./filtre.ts";

export interface Appariement {
  readonly a: UniteAnalyse[];
  readonly b: UniteAnalyse[];
  /** Clés présentes dans les deux bras, dans l'ordre de première apparition (A, puis B). */
  readonly communes: readonly string[];
  /** Clés présentes dans un seul bras : nommées, jamais complétées. Même ordre. */
  readonly exclues: readonly string[];
}

export function apparier(
  a: readonly UniteAnalyse[],
  b: readonly UniteAnalyse[],
  cle: (unite: UniteAnalyse) => string,
): Appariement {
  const clesA = new Set(a.map(cle));
  const clesB = new Set(b.map(cle));
  const communes: string[] = [];
  const exclues: string[] = [];
  for (const k of new Set([...clesA, ...clesB])) {
    if (clesA.has(k) && clesB.has(k)) communes.push(k);
    else exclues.push(k);
  }
  const retenues = new Set(communes);
  return {
    a: a.filter((u) => retenues.has(cle(u))),
    b: b.filter((u) => retenues.has(cle(u))),
    communes,
    exclues,
  };
}
