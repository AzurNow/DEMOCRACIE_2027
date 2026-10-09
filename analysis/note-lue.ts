/**
 * Ce que les métriques primaires du §8 lisent d'une notation individuelle, et la seule égalité de
 * deux notations du dépôt.
 *
 * §7 (protocole 0.15) : « Deux humains s'accordent lorsque leurs notations sont identiques sur tout
 * ce que lisent les métriques primaires : catégorie, drapeaux, fraîcheur de l'obsolescence et, pour
 * le sourçage, le seul sourçage valide (un même lien cité, existant et soutenant). » Décision D14 (3)
 * de l'auteur du 2026-10-05 (texte proposé pour la 0.16) : la même égalité définit l'accord des deux
 * juges et « la note change » du test contrefactuel.
 *
 * Cette égalité vivait dans `robustesse.ts` (recalcul (a)) ; elle en a été extraite sans changement
 * pour que la règle de décision du §7 (`pipeline/notation/decision.ts`) et le test contrefactuel la
 * lisent au même endroit. Si une métrique primaire venait à lire un autre champ d'une note, il
 * entrerait ici, une fois, et l'accord des humains, l'accord des juges et le changement de note
 * suivraient ensemble.
 */

import type { CategorieRetenue, Drapeau, Notation, SourcageRetenu } from "./types.ts";

/** Ce que les métriques primaires lisent d'une note : c'est aussi ce sur quoi deux notations s'accordent. */
export interface NoteLue {
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  readonly obsolescence_fraiche: boolean | null;
  readonly sourcage: SourcageRetenu;
}

/**
 * Traduction d'une notation individuelle vers les trois booléens de `sourcage_retenu` (§7, §8 :
 * « au moins une source existante qui soutient l'affirmation ») : `au_moins_un_lien_existant` =
 * au moins un lien dont le test HTTP dit `existe` ; `au_moins_un_lien_soutenant` = au moins un
 * MÊME lien qui existe ET soutient. Un lien mort qui « soutient » ne soutient rien.
 */
export function sourcageDeNotation(notation: Notation): SourcageRetenu {
  const liens = notation.sourcage.liens;
  return {
    cite: notation.sourcage.cite,
    au_moins_un_lien_existant: liens.some((l) => l.verdict_existence === "existe"),
    au_moins_un_lien_soutenant: liens.some((l) => l.verdict_existence === "existe" && l.verdict_soutien === "soutient"),
  };
}

export function lireNote(notation: Notation): NoteLue {
  return {
    categorie: notation.categorie,
    drapeaux: notation.drapeaux,
    obsolescence_fraiche: notation.obsolescence_fraiche === undefined ? null : notation.obsolescence_fraiche,
    sourcage: sourcageDeNotation(notation),
  };
}

export function memeNote(a: NoteLue, b: NoteLue): boolean {
  return (
    a.categorie === b.categorie &&
    memesDrapeaux(a.drapeaux, b.drapeaux) &&
    a.obsolescence_fraiche === b.obsolescence_fraiche &&
    memeSourcage(a.sourcage, b.sourcage)
  );
}

/** Deux notations individuelles s'accordent (§7 ; D14 (3)) : `memeNote` sur leurs notes lues. */
export function notationsConcordent(a: Notation, b: Notation): boolean {
  return memeNote(lireNote(a), lireNote(b));
}

/**
 * « La note change » du test contrefactuel des noms de candidats (décision D29 (2) de l'auteur,
 * 2026-10-09, qui remplace D14 (3) pour ce seul test) : catégorie, drapeaux et motif d'inexactitude.
 * Le soutien des liens n'y entre pas : le texte des pages citées n'est pas permuté (§7 ne permute que
 * la réponse et l'item), un soutien qui change avec lui ne dit rien d'un biais sur le nom. La
 * fraîcheur n'y entre pas non plus : elle se calcule depuis les dates (D27 (C)), identiques des deux
 * côtés. Seconde égalité du dépôt, à côté de `notationsConcordent`, qui garde l'accord des juges et
 * des humains.
 */
export function notesContrefactuellesConcordent(a: Notation, b: Notation): boolean {
  return a.categorie === b.categorie && memesDrapeaux(a.drapeaux, b.drapeaux) && a.motif_inexactitude === b.motif_inexactitude;
}

/** Les drapeaux sont un ensemble (`uniqueItems` au schéma) : l'ordre ne compte pas. */
function memesDrapeaux(a: readonly Drapeau[], b: readonly Drapeau[]): boolean {
  return a.length === b.length && a.every((drapeau) => b.includes(drapeau));
}

/**
 * Conformité n° 43 (décision de l'auteur du 2026-10-02, texte en 0.15) : seul le booléen que lisent
 * les métriques primaires (`metriques.ts:sourcageValide`) départage deux notations. Si une métrique
 * primaire venait à lire un autre booléen du sourçage, il entrerait ici aussi.
 */
function memeSourcage(a: SourcageRetenu, b: SourcageRetenu): boolean {
  return a.au_moins_un_lien_soutenant === b.au_moins_un_lien_soutenant;
}
