/**
 * Graine de chaque intervalle et de chaque test du §8, dérivée de la graine publiée du run.
 *
 * §8 : « 2 000 rééchantillonnages, méthode des percentiles, graine publiée » ; §9 : les analyses
 * se relancent par une commande unique. Le run publie deux entiers, `run.graines.bootstrap.valeur`
 * et `run.graines.permutation.valeur` (schema/run.schema.json). Un run calcule des centaines
 * d'intervalles : chacun reçoit SA graine, dérivée de l'entier du run et d'une clé lisible qui
 * nomme la comparaison. Aucune graine ne dépend de l'ordre des calculs ni de la liste des autres
 * métriques : ajouter une métrique ne déplace le tirage d'aucune autre.
 *
 * **La règle, pour la rejouer ailleurs** (algorithme `splitmix64-sha256-v1` de
 * `validation/domaine/alea.ts`, le même que le tirage du §5) :
 *
 * 1. L'entier du run s'écrit en décimal, chiffres ASCII, sans signe, sans séparateur de milliers,
 *    sans zéro de tête (`0` s'écrit `0`). Il doit être un entier de 0 à 2⁵³ − 1 : au-delà, un
 *    entier JSON n'a plus d'écriture exacte dans un nombre JavaScript, et deux valeurs publiées
 *    différentes pourraient donner la même graine.
 * 2. La clé est une liste ordonnée de composants non vides, dont aucun ne contient U+0000. Sa
 *    première entrée est la famille : `bootstrap` ou `permutation`, ajoutée par le module qui tire
 *    (`bootstrap.ts`, `permutation.ts`), jamais par l'appelant. Suivent, dans cet ordre, les
 *    composants fournis par l'appelant dans `options.cle`, puis ceux qu'ajoute le module qui
 *    démultiplie une comparaison : la clé de la paire (`conditions.ts`, `PaireCondition.cle`),
 *    l'identifiant de l'outil (`tendance.ts`).
 * 3. Le texte haché est l'entier écrit en (1), suivi de chaque composant, tous joints par le
 *    caractère nul U+0000, encodés en UTF-8. Les huit premiers octets de son sha256, lus en
 *    gros-boutiste, sont la graine de SplitMix64.
 *
 * **Exemple complet.** Graine de bootstrap du run : 20261201. L'appelant demande l'intervalle de
 * l'exactitude globale d'un outil dans un mode avec `cle: ["outil-alpha", "web_desactivee",
 * "exactitude", "global"]` ; `bootstrap.ts` y ajoute sa famille en tête. Texte haché :
 *
 *     20261201␀bootstrap␀outil-alpha␀web_desactivee␀exactitude␀global
 *
 * (␀ = U+0000). sha256, huit premiers octets : `d8bcfbd164a58f33`, soit la graine
 * 15617634484569345843. En shell :
 *
 *     printf '20261201\0bootstrap\0outil-alpha\0web_desactivee\0exactitude\0global' \
 *       | shasum -a 256 | cut -c1-16
 *
 * `tests/analysis/graines.test.ts` fige trois vecteurs de ce type.
 *
 * Les recalculs de robustesse (a) à (d) d'une comparaison gardent la clé de cette comparaison :
 * même graine, mêmes grappes tirées (nombres aléatoires communs). Un recalcul qui ne retire
 * aucune réponse rend ainsi exactement l'intervalle principal, et l'écart entre les deux ne tient
 * qu'aux réponses retirées, pas au hasard du tirage.
 */

import { graineDepuisTexte } from "../validation/domaine/alea.ts";

const SEPARATEUR = "\0";

export function graineDerivee(graineDuRun: number, cle: readonly string[]): bigint {
  verifierEntierDuRun(graineDuRun);
  verifierCle(cle);
  return graineDepuisTexte(String(graineDuRun), ...cle);
}

function verifierEntierDuRun(graineDuRun: number): void {
  if (!Number.isInteger(graineDuRun) || graineDuRun < 0) {
    throw new Error(`Graine du run invalide : ${graineDuRun} (entier positif ou nul attendu, schema/run.schema.json).`);
  }
  if (graineDuRun > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Graine du run ${graineDuRun} au-delà de 2^53 − 1 : son écriture décimale n'est plus exacte.`);
  }
}

function verifierCle(cle: readonly string[]): void {
  if (cle.length === 0) throw new Error("Graine dérivée sans clé : l'intervalle ne serait pas nommé.");
  for (const composant of cle) {
    if (composant.length === 0) throw new Error(`Composant vide dans la clé [${cle.join(", ")}].`);
    if (composant.includes(SEPARATEUR)) {
      throw new Error("Composant de clé contenant le séparateur U+0000 : la clé ne s'écrirait pas de façon unique.");
    }
  }
}
