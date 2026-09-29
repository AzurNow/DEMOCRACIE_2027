/**
 * Comptage des items P d'un candidat au gel, qui décide du seuil de couverture du §4.
 *
 * §4 : « Un candidat comptant moins de 10 items P vérifiés à la date du run est rapporté à part,
 * avec la mention « couverture insuffisante ». » Décision de l'auteur du 2026-09-27 (conformité
 * n° 19, révision 0.12 du protocole en attente) : « vérifié à la date du run » se lit comme
 * « pourrait entrer au tirage à l'instant de gel ». Un item P compte s'il est vérifié, en vigueur
 * au gel, et non contesté ou arbitré par un maintien ou une correction. Décision de l'auteur du
 * 2026-09-29 (conformité n° 2) : un item qui épingle une version dépassée de sa mesure n'entre pas au
 * tirage (`epingleLaVersionCourante`), il ne compte donc pas non plus.
 *
 * Aucune de ces règles n'est réécrite ici : la validation et la contestation sont celles de
 * l'engendrement (`itemEngendreDesQuestions`), la vigueur celle de la réponse attendue
 * (`estEnVigueur`), et la décision du panel est lue telle que le tirage la fige
 * (`decisionPanelAuGel`, qui refuse une décision postérieure au gel). Le total est STOCKÉ dans
 * `run.perimetre.candidats[].items_p_verifies` ; `analysis/seuils.ts` lit `sous_seuil`, jamais ce
 * module, et le schéma du run lie les deux dans les deux sens.
 */

import { decisionPanelAuGel } from "./contestation.ts";
import { epingleLaVersionCourante, itemEngendreDesQuestions } from "./engendrement.ts";
import { estEnVigueur } from "./reponse-attendue.ts";
import type { Item, Mesure } from "./types.ts";

function estItemPDuCandidat(item: Item, candidat_id: string): boolean {
  return item.type === "P" && item.candidat_id === candidat_id;
}

/**
 * Vrai si l'item compte pour le seuil de couverture de ce candidat au gel. Pour un item arbitré,
 * la décision est lue au gel : une décision postérieure lève `DecisionPanelPosterieureAuGel`,
 * comme au tirage, plutôt que de compter un item sur un état que le gel ne connaissait pas.
 * `referentiel` : les mesures au gel, par identifiant ; une mesure absente lève `MesureIntrouvable`.
 */
export function itemPCompteAuGel(
  item: Item,
  candidat_id: string,
  date_gel: string,
  referentiel: ReadonlyMap<string, Mesure>,
): boolean {
  if (!estItemPDuCandidat(item, candidat_id)) return false;
  if (item.statut_contestation === "arbitree") decisionPanelAuGel(item, date_gel);
  const tirable = itemEngendreDesQuestions(item);
  const versionCourante = epingleLaVersionCourante(item, referentiel);
  return tirable && versionCourante && estEnVigueur(item, date_gel);
}

/** Le nombre d'items P de ce candidat qui comptent au gel. Tous les items sont évalués. */
export function itemsPComptesAuGel(
  items: readonly Item[],
  candidat_id: string,
  date_gel: string,
  mesures: readonly Mesure[],
): number {
  const referentiel = new Map(mesures.map((mesure) => [mesure.id, mesure]));
  return items.filter((item) => itemPCompteAuGel(item, candidat_id, date_gel, referentiel)).length;
}
