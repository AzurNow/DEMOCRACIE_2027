/**
 * Les critères go/no-go du §12 et la décision qui en découle (D24 de l'auteur, 2026-10-09).
 *
 * Les codes et leur ordre sont ceux de `schema/run.schema.json#/properties/go_no_go` : l'ordre fixe
 * celui des critères écrits dans `run.json` et celui des codes énumérés dans le motif d'une
 * décision provisoire. Rien ne s'ajoute ici sans amendement du §12.
 */

export const CODES_CRITERES = [
  "kappa_juges_humains",
  "test_contrefactuel",
  "aucun_item_conteste_dans_le_tirage",
  "tests_symetrie",
  "reponses_manquantes",
  "erreurs_graves_revues",
  "analyses_preenregistrees_executees",
] as const;
export type CodeCritere = (typeof CODES_CRITERES)[number];

export type StatutCritere = "vert" | "rouge";

/** Un critère tel que `run.json#/go_no_go/criteres` le publie. */
export interface Critere {
  readonly code: CodeCritere;
  readonly statut: StatutCritere;
  readonly valeur: number | string;
  readonly seuil: number | string;
}

export type DecisionPublication = "publie" | "publie_provisoire";

export interface GoNoGo {
  readonly criteres: readonly Critere[];
  readonly decision: DecisionPublication;
  /** Présent si et seulement si la décision est provisoire : les codes rouges, dans l'ordre fixe. */
  readonly motif?: string;
}

/** Valeur publiée d'un critère quand aucun juge n'est retenu : une absence de mesure (D24 (2)). */
export const AUCUN_JUGE_RETENU = "aucun juge retenu";
