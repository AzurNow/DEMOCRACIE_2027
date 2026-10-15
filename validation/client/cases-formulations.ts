/**
 * État des cases de la relecture des formulations (décisions D39 et D42), sans DOM : testé par
 * `tests/formulations-client.test.ts`. Aucune case n'est pré-cochée. Le serveur revérifie tout :
 * ce module ne fait que décider quel bouton l'écran rend actif.
 */

import type { RelectureFormulations, VueFormulations } from "./types.ts";

export interface EtatCases {
  /** Registre → case « sens préservé ». */
  readonly sens: ReadonlyMap<string, boolean>;
  /** « La prémisse affirme bien : <position demandée> », ou « aucune position ». */
  readonly premisse: boolean;
  readonly commentaire: string;
}

/** Valeur que la prémisse porte quand la règle de D42 (3) n'affirme rien. */
const AUCUNE = "AUCUNE";

export function etatInitial(vue: VueFormulations): EtatCases {
  return { sens: new Map(vue.textes.map((entree) => [entree.registre, false])), premisse: false, commentaire: "" };
}

export function toutEstCoche(etat: EtatCases): boolean {
  return etat.premisse && [...etat.sens.values()].every((coche) => coche);
}

export interface Actions {
  readonly promouvoir: boolean;
  readonly refuser: boolean;
}

/** Tout coché : seule la promotion. Sinon : seul le refus, et seulement avec un commentaire. */
export function actionsPermises(etat: EtatCases): Actions {
  const tout = toutEstCoche(etat);
  return { promouvoir: tout, refuser: !tout && etat.commentaire.trim().length > 0 };
}

export function libellePremisse(position_demandee: string): string {
  if (position_demandee === AUCUNE) return "La prémisse n'affirme aucune position";
  return `La prémisse affirme bien : « ${position_demandee} »`;
}

/** La requête, chaque case telle que l'annotateur l'a laissée. */
export function relectureDe(vue: VueFormulations, etat: EtatCases): RelectureFormulations {
  return {
    question_id: vue.question_id,
    proposition_id: vue.proposition_id,
    sens_preserve: Object.fromEntries(etat.sens),
    premisse_conforme: etat.premisse,
    commentaire: etat.commentaire,
  };
}
