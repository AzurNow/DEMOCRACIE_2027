/**
 * Les soutiens qu'un lien peut recevoir. Le schéma de notation (`schema/notation.schema.json`,
 * `sourcage.liens.items.allOf`) refuse deux combinaisons :
 *  - un lien `mort` noté « soutient » ;
 *  - un lien `inaccessible` ou `non_testable` noté « soutient » sans `archive_url` ET `sha256_contenu`
 *    (copie archivée, §7).
 * Le domaine garde son refus (D22) ; l'écran, lui, n'offre pas ce que le schéma refuserait et dit
 * pourquoi. `tests/notation-humaine/soutiens.test.ts` aligne cette fonction sur le schéma.
 */

import type { Existence } from "./types.ts";

/** Seul soutien que le schéma conditionne à l'existence du lien. */
const SOUTIEN_CONDITIONNE = "soutient";
const EXISTENCE_MORT = "mort";
const EXISTENCES_SANS_TEST_FIABLE: readonly string[] = ["inaccessible", "non_testable"];

export const MOTIF_LIEN_MORT = "lien mort : ne peut pas soutenir";
export const MOTIF_SANS_COPIE = "pas de copie archivée : ne peut pas soutenir";

/** La raison pour laquelle « soutient » est refusé à ce lien, ou `null` s'il est admis. */
export function motifSansSoutien(lien: Existence): string | null {
  if (lien.verdict_existence === EXISTENCE_MORT) return MOTIF_LIEN_MORT;
  const sansCopie = lien.archive_url === undefined || lien.sha256_contenu === undefined;
  if (EXISTENCES_SANS_TEST_FIABLE.includes(lien.verdict_existence) && sansCopie) return MOTIF_SANS_COPIE;
  return null;
}

/** `tous` (la grille servie) privé de « soutient » si le schéma le refuserait ; l'ordre est conservé. */
export function soutiensAdmis(lien: Existence, tous: readonly string[]): readonly string[] {
  if (motifSansSoutien(lien) === null) return tous;
  return tous.filter((soutien) => soutien !== SOUTIEN_CONDITIONNE);
}
