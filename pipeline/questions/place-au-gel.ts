/**
 * La place d'un item dans la vérité de référence à l'instant du gel, et ce qu'elle fait d'une
 * question d'attribution (Q-ATT). Seule définition : l'engendrement et le tirage la lisent.
 *
 * Décision de l'auteur du 2026-09-29 (conformité 2026-09-29, n° 3 ; texte à écrire au §5 en 0.14) :
 * « une question d'attribution n'est pas tirée lorsque l'item d'un candidat interrogé au run sur la
 * mesure est contesté à la date du gel : sa position fait l'objet d'une contestation, et la liste
 * attendue n'est pas établie. La question est exclue et comptée à part dans le rapport du run […].
 * Un item en attente de validation, retiré ou déclaré non évaluable n'appartient pas à la vérité de
 * référence : il n'entre pas dans la liste et ne la rend pas indéfinie. »
 *
 * Trois places, et aucune autre :
 *
 * - `retenu` : vérifié, non contesté ou arbitré par une décision qui le réintègre
 *   (`contestationPermetLeTirage`, règle unique de `contestation.ts`). Il engendre ses questions et
 *   entre dans la liste d'une Q-ATT.
 * - `conteste` : vérifié et contesté, en attente de la décision du panel. Il n'engendre aucune
 *   question (§4, décision 5 du même jour), mais il reste dans les items de la Q-ATT de sa mesure,
 *   pour que le tirage puisse l'exclure en la comptant.
 * - `ecarte` : tout le reste — non vérifié (en attente, à confirmer, rejeté, non évaluable, retiré
 *   par le panel), ou arbitré sans réintégration. Il n'appartient pas à la vérité de référence.
 *
 * Ce que chaque place fait d'une Q-ATT est une table (`EFFET_SUR_ATTRIBUTION`), pas du code.
 */

import { contestationPermetLeTirage } from "./contestation.ts";
import type { Item } from "./types.ts";

export type PlaceAuGel = "retenu" | "conteste" | "ecarte";

/**
 * Ce que la place d'un item fait de la Q-ATT dont il est un `attendu_dans_liste` :
 * `entre` dans la liste ; `bloque` la question si son candidat est interrogé au run (sinon il est
 * ignoré, comme tout item d'un candidat non interrogé) ; `ignore` : ni dans la liste, ni bloquant.
 */
export type EffetSurAttribution = "entre" | "bloque" | "ignore";

export const EFFET_SUR_ATTRIBUTION: Readonly<Record<PlaceAuGel, EffetSurAttribution>> = {
  retenu: "entre",
  conteste: "bloque",
  ecarte: "ignore",
};

/**
 * La contestation est lue avant la validation, et toujours : un arbitrage illisible se signale même
 * sur un item que sa validation écarte déjà (comportement de `itemEngendreDesQuestions` avant ce lot).
 */
export function placeAuGel(item: Item): PlaceAuGel {
  const selonContestation = placeSelonContestation(item);
  if (item.statut_validation !== "verifie") return "ecarte";
  return selonContestation;
}

function placeSelonContestation(item: Item): PlaceAuGel {
  if (item.statut_contestation === "contestee") return "conteste";
  return contestationPermetLeTirage(item) ? "retenu" : "ecarte";
}

/** L'effet de l'item sur une Q-ATT, lu dans la table. */
export function effetSurAttribution(item: Item): EffetSurAttribution {
  return EFFET_SUR_ATTRIBUTION[placeAuGel(item)];
}

/** À l'engendrement : l'item figure-t-il dans les items de la Q-ATT de sa mesure ? */
export function figureDansAttribution(item: Item): boolean {
  return effetSurAttribution(item) !== "ignore";
}
