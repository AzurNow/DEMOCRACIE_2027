/**
 * Fraîcheur d'une erreur d'obsolescence (§11 ; D17 du 2026-10-06).
 *
 * §11 : « Une erreur d'obsolescence est dite fraîche quand la date de gel du run est strictement
 * antérieure à la date du changement plus 14 jours ; elle est comptée mais signalée à part. » D17 :
 * la fraîcheur n'est portée que par une note qui pose le drapeau obsolescence ; c'est à l'appelant de
 * ne la calculer que dans ce cas (`notation-humaine.ts`).
 *
 * Arithmétique, avec les règles de date du §4 (`pipeline/questions/reponse-attendue.ts`, seule
 * source de ces conventions) :
 *
 * - `date_changement` est une date civile, lue à minuit UTC (`instantDeDateCivile`) ;
 * - `date_gel` est un instant dont le décalage est obligatoire (`instantDe`), comparé en
 *   millisecondes depuis l'époque, donc indépendamment de l'écriture du fuseau ;
 * - « plus 14 jours » ajoute 14 × 86 400 000 ms : en UTC un jour civil dure toujours 86 400 s, il
 *   n'y a pas de changement d'heure. La borne est donc minuit UTC du quatorzième jour suivant ;
 * - « strictement antérieure » : fraîche si `gel < changement + 14 j`. Un gel à J+14 minuit UTC
 *   pile n'est plus frais.
 *
 * Un gel antérieur au changement lui-même donne « fraîche » : la règle du §11 est appliquée telle
 * qu'écrite, sans cas ajouté.
 */

import { instantDe, instantDeDateCivile } from "../questions/reponse-attendue.ts";

/** §11 : « la date du changement plus 14 jours ». */
export const DELAI_FRAICHEUR_JOURS = 14;

const MILLISECONDES_PAR_JOUR = 86_400_000;

export function obsolescenceFraiche(date_changement: string, date_gel: string): boolean {
  const borne = instantDeDateCivile(date_changement) + DELAI_FRAICHEUR_JOURS * MILLISECONDES_PAR_JOUR;
  return instantDe(date_gel) < borne;
}
