/**
 * Dates de validité et dates des sources (§4 ; conformité n° 17).
 *
 * « Chaque item porte une date de début de validité (date de la source) » : un `valide_du` qui ne
 * serait pas la date de la source, ou une `date_changement` d'item O qui ne serait pas celle de la
 * source postérieure, change la réponse attendue (`reponse-attendue.ts`) sans que rien le signale.
 * Deux annotateurs qui corrigent de concert l'une de ces dates vers une valeur sans rapport avec la
 * source produiraient exactement cela. La seule divergence admise est motivée, dans un champ écrit
 * pour cela (`valide_du_motif`, `obsolescence.date_changement_motif`).
 *
 * JSON Schema ne compare pas deux champs : ce contrôle vit ici, et `pnpm promote` l'applique à tout
 * item qu'il écrirait dans `data/`, après corrections.
 *
 * Les quatre dates comparées sont des dates civiles `AAAA-MM-JJ` (`commun#/$defs/date_civile`) :
 * l'égalité de chaînes est l'égalité de dates, sans fuseau ni conversion.
 *
 * Hors contrôle, faute de règle écrite : le `valide_du` d'un item O (date de l'état antérieur ?
 * du premier état connu ?) et celui des items A et F, qui n'ont pas d'assertion.
 */

import type { Item } from "./types.ts";

export interface EcartDeDate {
  readonly champ: "valide_du" | "obsolescence.date_changement";
  readonly date: string;
  readonly champ_source: string;
  readonly date_source: string;
  readonly champ_motif: "valide_du_motif" | "obsolescence.date_changement_motif";
}

function ecartValideDu(item: Item): EcartDeDate | null {
  const assertion = item.assertion;
  if (assertion === undefined || item.valide_du_motif !== undefined) return null;
  if (item.valide_du === assertion.source.date_source) return null;
  return {
    champ: "valide_du",
    date: item.valide_du,
    champ_source: "assertion.source.date_source",
    date_source: assertion.source.date_source,
    champ_motif: "valide_du_motif",
  };
}

function ecartDateChangement(item: Item): EcartDeDate | null {
  const bloc = item.obsolescence;
  if (bloc === undefined || bloc.date_changement_motif !== undefined) return null;
  const dateSource = bloc.etat_posterieur.source.date_source;
  if (bloc.date_changement === dateSource) return null;
  return {
    champ: "obsolescence.date_changement",
    date: bloc.date_changement,
    champ_source: "obsolescence.etat_posterieur.source.date_source",
    date_source: dateSource,
    champ_motif: "obsolescence.date_changement_motif",
  };
}

export function ecartsDeDates(item: Item): readonly EcartDeDate[] {
  return [ecartValideDu(item), ecartDateChangement(item)].filter((ecart): ecart is EcartDeDate => ecart !== null);
}

export function decrireEcart(item_id: string, ecart: EcartDeDate): string {
  return (
    `Item ${item_id} : ${ecart.champ} ${ecart.date} ≠ ${ecart.champ_source} ${ecart.date_source}, ` +
    `sans ${ecart.champ_motif} (§4, conformité n° 17)`
  );
}
