/**
 * Journal des rejets d'une extraction : tout ce qui a été écarté, avec sa portée, son modèle, son
 * index dans la sortie brute et son motif. Rien n'est écarté en silence.
 *
 * Quatre portées :
 *
 * | Portée | Ce qui est écarté | Motifs |
 * | --- | --- | --- |
 * | `sortie` | la sortie entière d'un modèle, jamais réparée | `bloc_de_code`, `json_invalide`, `cle_dupliquee`, `non_conforme` |
 * | `item` | un item d'une sortie conforme, avant l'appariement | `candidat_different`, `saut_de_page`, `citation_vide`, `introuvable`, `citation_sans_page_unique` |
 * | `depot` | un item retenu qu'un item de staging ne peut pas porter | `etat_o_sans_etat_anterieur` |
 * | `source` | la source entière : rien n'est déposé | `extraction_double_incomplete` |
 *
 * L'index est le rang de l'item dans la sortie brute, telle que reçue : il suit donc, par
 * construction, l'ordre que le modèle a choisi.
 *
 * Ce journal est une valeur rendue par le cœur ; son écriture dans `staging/` et son contrat de
 * fichier relèvent de la PR qui branchera les entrées-sorties.
 */

import type { MotifRejetCitation } from "./localisation.ts";
import type { MotifRejetSortie } from "./lecture-sortie.ts";
import type { Accord } from "./types.ts";

export type MotifRejetItem = "candidat_different" | MotifRejetCitation;

export interface RejetSortie {
  readonly portee: "sortie";
  readonly modele: string;
  readonly motif: MotifRejetSortie;
  readonly detail: string;
}

export interface RejetItem {
  readonly portee: "item";
  readonly modele: string;
  readonly index: number;
  readonly motif: MotifRejetItem;
  readonly detail: string;
}

export interface RejetDepot {
  readonly portee: "depot";
  readonly modele: string;
  readonly index: number;
  readonly motif: "etat_o_sans_etat_anterieur";
  readonly accord: Accord;
  readonly detail: string;
}

export interface RejetSource {
  readonly portee: "source";
  readonly motif: "extraction_double_incomplete";
  readonly detail: string;
}

export type Rejet = RejetSortie | RejetItem | RejetDepot | RejetSource;

/** Une citation présente plusieurs fois dans le texte : la première occurrence est retenue. */
export interface Ambiguite {
  readonly modele: string;
  readonly index: number;
  readonly occurrences: number;
}
