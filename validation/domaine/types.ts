/**
 * Types du domaine de la validation humaine.
 *
 * Ils décrivent ce que l'interface manipule, pas l'intégralité de `schema/` : un item porte
 * bien plus de champs que ceux lus ici. Ce qui est absent de ce fichier est absent de
 * l'interface, et c'est voulu — la projection vers le client (projection.ts) est une liste
 * blanche, pas un filtre.
 */

export type TypeItem = "P" | "A" | "O" | "F";

export type Decision = "accepter" | "corriger" | "rejeter" | "non_evaluable";

/**
 * Les trois catégories du kappa publié. Dérivées de la décision : c'est le devenir de l'item
 * qui compte, et distinguer « accepter » de « corriger » pénaliserait une coquille repérée par
 * un seul annotateur. « rejeté » et « non évaluable » ne fusionnent pas : l'un dit que
 * l'extraction est fausse, l'autre que le candidat est flou.
 */
export type CategorieKappa = "retenu" | "rejete" | "non_evaluable";

export type NatureLot = "entrainement" | "reel" | "reannotation";

export type CleGrille =
  | "citation_fidele"
  | "paraphrase_exacte"
  | "position_univoque"
  | "theme_correct"
  | "quantification_correcte";

export type CleSpecifique =
  | "couverture_theme_verifiee"
  | "corpus_complet"
  | "confirmation_absence"
  | "changement_explicite"
  | "fictivite_verifiee"
  | "plausibilite";

/** `null` = sans objet pour ce type d'item. Jamais « non répondu » : voir grille.ts. */
export type Grille = Readonly<Record<CleGrille, boolean | null>>;

export type QuestionsSpecifiques = Readonly<Partial<Record<CleSpecifique, boolean>>>;

export type EtatObsolescence = "anterieur" | "posterieur";

export interface Correction {
  readonly cible: "item" | "mesure";
  readonly chemin: string;
  readonly ancienne_valeur: unknown;
  readonly nouvelle_valeur: unknown;
  readonly offsets?: {
    readonly ancien_debut: number | null;
    readonly ancien_fin: number | null;
    readonly nouveau_debut: number;
    readonly nouveau_fin: number;
  };
}

interface EntreeCommune {
  readonly id: string;
  readonly journal_version: number;
  readonly annotateur_id: string;
  readonly lot_id: string;
  readonly lot_nature: NatureLot;
  readonly item_id: string;
  readonly horodatage: string;
  readonly commentaire?: string | null;
  readonly empreinte_ligne: string;
}

export interface EntreeDecision extends EntreeCommune {
  readonly type_entree: "decision";
  readonly item_version: number;
  readonly item_empreinte: string;
  readonly item_type: TypeItem;
  readonly decision: Decision;
  readonly reponses_grille?: Grille;
  readonly reponses_par_etat?: Readonly<Record<EtatObsolescence, Grille>>;
  readonly questions_specifiques?: QuestionsSpecifiques;
  readonly corrections: readonly Correction[];
  readonly duree_affichage_ms: number;
  readonly duree_active_ms: number;
  readonly visite: number;
}

export interface EntreeAnnulation extends EntreeCommune {
  readonly type_entree: "annulation";
  readonly annule: string;
}

export interface EntreeRetrait extends EntreeCommune {
  readonly type_entree: "retrait_item";
  readonly motif: string;
}

export type EntreeJournal = EntreeDecision | EntreeAnnulation | EntreeRetrait;

/* ------------------------------------------------------------------ items */

export interface Source {
  readonly tier: "T1" | "T2" | "T3";
  readonly url: string;
  readonly type_document: string;
  readonly page?: number;
  readonly extrait?: { readonly debut: string; readonly fin: string };
  readonly transcription_verifiee_par?: string;
  readonly transcription_verifiee_le?: string;
  readonly sha256: string;
  readonly texte_sha256?: string;
  readonly archive_url: string;
  readonly date_source: string;
  readonly date_collecte: string;
  readonly chemin_local?: string;
  readonly publication: "publique" | "interne";
}

export interface TestVerbatim {
  readonly passe: boolean;
  readonly date: string;
  readonly version_normalisation: string;
  readonly offset_debut?: number;
  readonly offset_fin?: number;
}

export interface EtatPositionnel {
  readonly position: string;
  readonly paraphrase: string;
  readonly citation_verbatim: string;
  readonly quantification?: unknown;
  readonly source: Source;
  readonly test_verbatim?: TestVerbatim;
  /** Présent en staging, jamais projeté vers le client : l'annotateur travaille à l'aveugle. */
  readonly extraction?: unknown;
}

export interface BlocAbsence {
  readonly source_couverture_theme: Source;
  readonly corpus_examine: readonly {
    readonly url: string;
    readonly sha256: string;
    readonly tier: "T1" | "T2" | "T3";
  }[];
  readonly date_examen: string;
  readonly reverifications: readonly unknown[];
  readonly confirmation_initiale?: {
    readonly lot_id: string;
    readonly date: string;
    readonly annotateurs: readonly string[];
  };
}

export interface BlocObsolescence {
  readonly date_changement: string;
  readonly etat_anterieur: EtatPositionnel;
  readonly etat_posterieur: EtatPositionnel;
  readonly remplace_item_id?: string | null;
}

export interface Item {
  readonly id: string;
  readonly version: number;
  readonly empreinte: string;
  readonly libelle_lisible?: string;
  readonly type: TypeItem;
  readonly candidat_id: string;
  readonly mesure_id: string;
  readonly mesure_version: number;
  readonly statut_validation: string;
  readonly statut_contestation: "aucune" | "contestee" | "arbitree";
  readonly valide_du: string;
  readonly valide_au: string | null;
  readonly assertion?: EtatPositionnel;
  readonly absence?: BlocAbsence;
  readonly obsolescence?: BlocObsolescence;
  readonly validations?: readonly unknown[];
  readonly contestations?: readonly unknown[];
  readonly historique?: readonly unknown[];
}

export interface Mesure {
  readonly id: string;
  readonly version: number;
  readonly empreinte: string;
  readonly libelle: string;
  readonly theme: string;
  readonly formulation_canonique: string;
  readonly fictive: boolean;
  readonly origine_fictive?: string;
  readonly verification_fictivite?: {
    readonly date: string;
    readonly corpus_verifies: readonly string[];
    readonly operateur: string;
    readonly resultat: string;
  };
}

/* -------------------------------------------------------------------- lots */

export interface ItemDuLot {
  readonly item_id: string;
  readonly item_version: number;
  readonly item_empreinte: string;
  readonly candidat_id: string;
}

export interface Lot {
  readonly lot_id: string;
  readonly nature: NatureLot;
  readonly graine_maitresse: string;
  readonly algorithme_ordre: string;
  readonly date_creation: string;
  readonly annotateurs: readonly string[];
  readonly items: readonly ItemDuLot[];
  /** Lot d'origine, pour une réannotation après séance de calibration (§4). */
  readonly reannote?: string;
}
