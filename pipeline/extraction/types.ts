/**
 * Types du cœur de l'extraction double (§4 ; décision D52).
 *
 * `ItemPropose` est la forme exacte qu'un modèle rend dans `{"items": [...]}`
 * (`prompts/extraction-1.0.0.md`, `schema/sortie-extraction.schema.json`) : rien de ce que le code
 * ajoute seul (offsets, page, extrait, source, dates, identifiants) n'y figure.
 */

/** Les énumérations vivent dans le schéma ; ces unions n'en sont que le typage, après validation. */
export type PositionExtraite = "pour" | "contre" | "conditionnel";
export type TypeExtrait = "P" | "O";

export interface MesureProposee {
  readonly libelle: string;
  readonly theme: string;
}

export interface ItemPropose {
  readonly type: TypeExtrait;
  readonly candidat_id: string;
  readonly mesure_proposee: MesureProposee;
  readonly position: PositionExtraite;
  readonly citation_verbatim: string;
  readonly paraphrase: string;
  readonly quantification?: unknown;
}

export interface SortieExtraction {
  readonly items: readonly ItemPropose[];
}

/** Rang d'un modèle dans la configuration : 0 pour le premier, celui qui fournit les champs d'une paire. */
export type RangModele = 0 | 1;

export type Accord = "accord" | "desaccord_existence" | "desaccord_contenu";

/**
 * Ce que le cœur reçoit d'un modèle : le texte de sa sortie, ou la raison pour laquelle la réponse
 * n'en donne pas (statut hors 2xx, sortie coupée, refus, enveloppe inattendue). Une sortie illisible
 * n'est jamais remplacée par une chaîne plausible : le cœur la rejette sous `lecture_illisible`,
 * avec cette raison. `LectureTexteModele` (`pipeline/reformulation/editeur.ts`) a cette forme.
 */
export type SortieModele = { readonly lisible: true; readonly texte: string } | { readonly lisible: false; readonly raison: string };
