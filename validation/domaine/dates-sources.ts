/**
 * Dates de validité et dates des sources (§4 ; conformité n° 17 ; protocole 0.13).
 *
 * « Chaque item porte une date de début de validité (date de la source) » : un `valide_du` qui ne
 * serait pas la date de la source, ou une `date_changement` d'item O qui ne serait pas celle de la
 * source postérieure, change la réponse attendue (`reponse-attendue.ts`) sans que rien le signale.
 * Deux annotateurs qui corrigent de concert l'une de ces dates vers une valeur sans rapport avec la
 * source produiraient exactement cela. La seule divergence admise est motivée, dans un champ écrit
 * pour cela (`valide_du_motif`, `obsolescence.date_changement_motif`).
 *
 * Protocole 0.13 (§4, « Cycle de vie et dates ») : « La source de référence est la citation pour un
 * item P, l'état antérieur pour un item O, dont la date du changement est celle de la source
 * postérieure, et la source de couverture pour un item A ; un item F, sans source, n'est pas
 * contraint. Une date qui diverge de sa source porte un motif publié. » La source de référence de
 * `valide_du` est donc une donnée par type (`REFERENCE_VALIDE_DU`), jamais un `if` par type.
 *
 * JSON Schema ne compare pas deux champs : ce contrôle vit ici, et `pnpm promote` l'applique à tout
 * item qu'il écrirait dans `data/`, après corrections.
 *
 * Les dates comparées sont des dates civiles `AAAA-MM-JJ` (`commun#/$defs/date_civile`) :
 * l'égalité de chaînes est l'égalité de dates, sans fuseau ni conversion.
 */

import type { Item, Source } from "./types.ts";

export interface EcartDeDate {
  readonly champ: "valide_du" | "obsolescence.date_changement";
  readonly date: string;
  readonly champ_source: string;
  readonly date_source: string;
  readonly champ_motif: "valide_du_motif" | "obsolescence.date_changement_motif";
}

interface Reference {
  /** Chemin publié dans le message d'écart. */
  readonly champ_source: string;
  /** La source de référence, `undefined` si l'item ne porte pas le bloc attendu (le schéma le refuse). */
  readonly source: (item: Item) => Source | undefined;
}

/** Source de référence de `valide_du` par type d'item. Un item F, sans source, n'y figure pas. */
const REFERENCE_VALIDE_DU: Readonly<Partial<Record<Item["type"], Reference>>> = {
  P: { champ_source: "assertion.source.date_source", source: (item) => item.assertion?.source },
  O: { champ_source: "obsolescence.etat_anterieur.source.date_source", source: (item) => item.obsolescence?.etat_anterieur.source },
  A: { champ_source: "absence.source_couverture_theme.date_source", source: (item) => item.absence?.source_couverture_theme },
};

function ecartValideDu(item: Item): EcartDeDate | null {
  const reference = REFERENCE_VALIDE_DU[item.type];
  if (reference === undefined || item.valide_du_motif !== undefined) return null;
  const source = reference.source(item);
  if (source === undefined || item.valide_du === source.date_source) return null;
  return {
    champ: "valide_du",
    date: item.valide_du,
    champ_source: reference.champ_source,
    date_source: source.date_source,
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
