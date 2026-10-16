/**
 * Accord d'une paire (décision D52 (2)) :
 *
 * - item sans partenaire ⇒ `desaccord_existence` ;
 * - item apparié dont `type`, `position` ou `quantification` diffèrent ⇒ `desaccord_contenu`, avec
 *   `detail_desaccord` qui nomme les champs qui divergent, dans l'ordre fixe de `CHAMPS_COMPARES` ;
 * - sinon ⇒ `accord`.
 *
 * Le libellé et la paraphrase sont du texte libre : ils ne sont jamais comparés. Une quantification
 * absente d'un côté et présente de l'autre diverge ; deux quantifications égales à l'ordre des clés
 * près ne divergent pas (forme canonique, `validation/domaine/empreinte.ts:canoniser`).
 */

import { canoniser } from "../../validation/domaine/empreinte.ts";
import type { Paire } from "./appariement.ts";
import type { Accord, ItemPropose } from "./types.ts";

const CHAMPS_COMPARES = ["type", "position", "quantification"] as const;

export interface AccordDePaire {
  readonly accord: Accord;
  readonly detail_desaccord?: string;
}

function valeurComparee(item: ItemPropose, champ: (typeof CHAMPS_COMPARES)[number]): string {
  const valeur = item[champ];
  return canoniser(valeur === undefined ? null : valeur);
}

export function accordDe(paire: Paire, modeles: readonly [string, string]): AccordDePaire {
  if (paire.premier === null) {
    return { accord: "desaccord_existence", detail_desaccord: `aucun item apparié dans la sortie de ${modeles[0]}` };
  }
  if (paire.second === null) {
    return { accord: "desaccord_existence", detail_desaccord: `aucun item apparié dans la sortie de ${modeles[1]}` };
  }
  const { premier, second } = paire;
  const divergents = CHAMPS_COMPARES.filter((champ) => valeurComparee(premier.item, champ) !== valeurComparee(second.item, champ));
  if (divergents.length === 0) return { accord: "accord" };
  return { accord: "desaccord_contenu", detail_desaccord: `champs divergents : ${divergents.join(", ")}` };
}
