/**
 * Verrou d'un lot terminé.
 *
 * Décision de l'auteur du 2026-10-02, conformité n° 16, texte au §4 en 0.15 : « Une fois qu'un lot
 * est terminé par ses deux annotateurs, leurs décisions sont figées : aucune décision nouvelle
 * n'y est enregistrée, et un changement d'avis ne passe que par un lot de réannotation. »
 *
 * « Terminé » n'est pas redéfini ici : c'est `lesDeuxOntFini` de `analyse-lot.ts`, la définition
 * du diagnostic. Un lot de réannotation est un autre lot, avec son propre journal : le verrou
 * du lot d'origine ne l'atteint pas.
 */

import { lesDeuxOntFini } from "./analyse-lot.ts";

type EntreeVerrou = Parameters<typeof lesDeuxOntFini>[0];

/** Le message à montrer à l'annotateur si le lot est figé, `null` si l'écriture est admise. */
export function refusSurLotTermine(entree: EntreeVerrou): string | null {
  if (!lesDeuxOntFini(entree)) return null;
  return (
    `Le lot ${entree.lot.lot_id} est terminé par ses deux annotateurs : ses décisions sont figées ` +
    `et plus aucune écriture n'y est admise. Pour changer d'avis, passer par un lot de ` +
    `réannotation (§4).`
  );
}
