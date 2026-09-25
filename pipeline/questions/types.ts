/**
 * Types du lot « questions, tirage, symétrie ».
 *
 * Ils transcrivent `schema/question.schema.json`, `schema/tirage.schema.json` et l'objet
 * `symetrie` de `schema/run.schema.json`. Aucun nom de champ n'est inventé ici : ce qui n'a
 * pas de domicile dans un schéma n'existe pas dans ces types.
 *
 * L'item et la mesure sont importés de `validation/domaine/types.ts` plutôt que redéclarés :
 * deux définitions du même objet divergeraient, et c'est exactement le genre de divergence
 * silencieuse que le projet prétend mesurer chez les autres.
 */

import type {
  BlocObsolescence,
  EtatPositionnel,
  Item,
  Mesure,
  TypeItem,
} from "../../validation/domaine/types.ts";

/*
 * Chaque liste fermée de ce fichier recopie un `enum` de `schema/` ; son union est dérivée de la
 * constante, et `tests/enumerations-schemas.test.ts` confronte la constante au schéma.
 */

export type { BlocObsolescence, EtatPositionnel, Item, Mesure, TypeItem };

/** Les dix thèmes du §3. Une position hors de cette liste n'entre pas dans le tirage. */
export const THEMES = [
  "fiscalite_pouvoir_achat",
  "retraites",
  "travail_emploi",
  "sante",
  "education",
  "securite_justice",
  "immigration",
  "ecologie_energie",
  "institutions_democratie",
  "europe_defense_international",
] as const;

export type Theme = (typeof THEMES)[number];

export function estTheme(valeur: string): valeur is Theme {
  return (THEMES as readonly string[]).includes(valeur);
}

/** Annexe B. */
export const CODES_GABARIT = ["Q-DIR", "Q-FER", "Q-ATT", "Q-NEG", "Q-ORI", "Q-ACT"] as const;
export type CodeGabarit = (typeof CODES_GABARIT)[number];

/** §5 : trois formulations par question, exactement. */
export const REGISTRES = ["neutre", "familier", "oriente"] as const;
export type Registre = (typeof REGISTRES)[number];

export const POSITIONS = ["pour", "contre", "conditionnel", "sans_objet"] as const;
export type Position = (typeof POSITIONS)[number];

export const ROLES_ITEM = ["principal", "attendu_dans_liste", "distracteur", "contexte"] as const;
export type RoleItem = (typeof ROLES_ITEM)[number];

export const STATUTS_VALIDATION = [
  "en_attente",
  "a_confirmer",
  "verifie",
  "rejete",
  "non_evaluable",
  "retire_par_panel",
] as const;

export type StatutValidation = (typeof STATUTS_VALIDATION)[number];

export function estStatutValidation(valeur: string): valeur is StatutValidation {
  return (STATUTS_VALIDATION as readonly string[]).includes(valeur);
}

export const STATUTS_CONTESTATION = ["aucune", "contestee", "arbitree"] as const;
export type StatutContestation = (typeof STATUTS_CONTESTATION)[number];

/**
 * La dernière décision du panel d'un item arbitré, figée au gel dans le tirage : la symétrie d'un
 * tirage publié se juge sur elle, jamais sur l'état courant des items.
 */
export interface DecisionPanelAuGel {
  readonly decision: string;
  /** `contestations[].decision_panel.date`, instant horodaté avec décalage. */
  readonly date: string;
}

export interface ReferenceItem {
  readonly item_id: string;
  readonly item_version: number;
  readonly item_empreinte: string;
}

export interface ItemDeQuestion {
  readonly reference: ReferenceItem;
  readonly role: RoleItem;
}

/* ------------------------------------------------------------- engendrement */

/**
 * Sortie de l'engendrement : tout ce qu'un gabarit produit mécaniquement, et rien de plus.
 *
 * Ce n'est PAS encore un objet `question` conforme au schéma, qui exige trois formulations.
 * Les formulations familière et orientée sont « produites par un modèle puis relues par un
 * annotateur » (§5) : elles supposent un prompt versionné et un appel d'API, hors de ce lot.
 * Le champ `theme` n'existe pas non plus sur l'objet `question` — il est porté par la mesure —
 * mais le tirage en a besoin comme strate, et le recalculer deux fois le ferait diverger.
 */
export interface QuestionEngendree {
  readonly id: string;
  readonly gabarit: CodeGabarit;
  /** Absent pour Q-ATT : §5 interdit de nommer un candidat dans une question d'attribution. */
  readonly candidat_id?: string;
  readonly items: readonly ItemDeQuestion[];
  /** L'item principal ; la mesure pour une question d'attribution (§5 et §8, protocole 0.9). */
  readonly grappe_id: string;
  readonly theme: Theme;
  readonly texte_neutre: string;
  readonly version_gabarits: string;
}

/* ------------------------------------------------------------------ question */

export interface Formulation {
  readonly id: string;
  readonly registre: Registre;
  readonly texte: string;
  readonly empreinte_texte: string;
  readonly premisse_fausse?: boolean;
  readonly production: { readonly modele: string; readonly version_prompt: string };
  readonly relecture: {
    readonly annotateur_id: string;
    readonly date: string;
    readonly sens_preserve: boolean;
    readonly commentaire?: string;
  };
}

/** Objet `question` complet, conforme à `schema/question.schema.json`. */
export interface Question {
  readonly id: string;
  readonly gabarit: CodeGabarit;
  readonly candidat_id?: string;
  readonly items: readonly ItemDeQuestion[];
  readonly grappe_id: string;
  readonly formulations: readonly Formulation[];
  readonly engendree_le: string;
  readonly version_gabarits?: string;
}

/* -------------------------------------------------------------------- tirage */

export const NATURES_REPONSE = [
  "position",
  "absence_de_position",
  "oui",
  "non",
  "liste_candidats",
  "aucun_candidat",
  "changement_de_position",
  "position_anterieure",
  "non_avec_correction",
] as const;
export type NatureReponse = (typeof NATURES_REPONSE)[number];

export interface ResolutionTemporelle {
  readonly date_gel: string;
  readonly date_changement?: string;
  readonly regle: "semi_ouvert";
}

export interface ReponseAttendue {
  readonly nature: NatureReponse;
  readonly position?: Position;
  readonly etat_attendu?: "anterieur" | "posterieur";
  readonly candidats_attendus?: readonly string[];
  readonly resolution_temporelle: ResolutionTemporelle;
}

export interface ItemAuGel {
  readonly reference: ReferenceItem;
  readonly role: RoleItem;
  readonly statut_validation_au_gel: StatutValidation;
  readonly statut_contestation_au_gel: StatutContestation;
  /** Présente si et seulement si `statut_contestation_au_gel` vaut « arbitree ». */
  readonly decision_panel_au_gel?: DecisionPanelAuGel;
}

export interface EntreeTirage {
  readonly question_id: string;
  readonly candidat_id?: string;
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
  readonly grappe_id: string;
  readonly items_au_gel: readonly ItemAuGel[];
  readonly reponse_attendue: ReponseAttendue;
  readonly reprise: boolean;
  readonly run_origine_id?: string;
  readonly empreinte_texte_precedente?: string;
}

export interface GraineTirage {
  readonly valeur: number;
  readonly algorithme: string;
  readonly bibliotheque: string;
  readonly version: string;
}

/**
 * §5 (protocole 0.9) : pourquoi une question n'entre pas au tirage alors que ses items sont
 * vérifiés. `hors_validite` : la fenêtre de validité d'un item ne contient pas l'instant du gel ;
 * `reponse_attendue_indecidable` : la réponse attendue n'est pas définie au gel (« sans objet » sur
 * un gabarit fermé, négatif ou orienté ; liste d'attribution non définie).
 */
export const MOTIFS_EXCLUSION = ["hors_validite", "reponse_attendue_indecidable"] as const;
export type MotifExclusion = (typeof MOTIFS_EXCLUSION)[number];

/** Une question écartée avant le tirage, « comptée à part dans le rapport du run » (§5). */
export interface ExclusionTirage {
  readonly question_id: string;
  readonly candidat_id?: string;
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
  readonly motif: MotifExclusion;
  /** Le message de l'erreur de résolution, tel quel. */
  readonly detail: string;
}

/**
 * §5 (protocole 0.9) : par candidat, et pour les questions d'attribution sur l'ensemble des thèmes
 * (`candidat_id` absent), le budget de reprise et son dépassement.
 */
export interface BilanReprise {
  readonly candidat_id?: string;
  /** Questions tirées dans le groupe, compensations comprises. */
  readonly cible: number;
  readonly budget_reprise: number;
  readonly reprises: number;
  /** Reprises au-delà du budget, venues compléter une strate sans question neuve. */
  readonly depassement: number;
}

/** §5 (protocole 0.9) : une question tirée dans un autre thème pour combler une strate déficitaire. */
export interface CompensationTirage {
  readonly candidat_id: string;
  readonly gabarit: CodeGabarit;
  readonly theme_deficitaire: Theme;
  readonly question_id: string;
  readonly theme_origine: Theme;
}

export interface Tirage {
  readonly run_id: string;
  readonly date_gel: string;
  readonly graine_tirage: GraineTirage;
  readonly entrees: readonly EntreeTirage[];
  readonly exclusions: readonly ExclusionTirage[];
  readonly bilan_reprise: readonly BilanReprise[];
  readonly compensations: readonly CompensationTirage[];
}

/* ----------------------------------------------------------------------- run */

/**
 * Le nom d'un candidat, saisi par l'auteur dans le périmètre du run : `libelle` (prénom et nom tels
 * qu'affichés) remplit `[candidat]` dans les gabarits qui le nomment, et la barrière « aucun nom de
 * candidat dans les Q-ATT » (§5, protocole 0.6) cherche `libelle` ET `nom`. Deux champs saisis,
 * jamais l'un dérivé de l'autre.
 */
export interface CandidatNomme {
  readonly candidat_id: string;
  readonly libelle: string;
  readonly nom: string;
}

export interface CandidatAuGel extends CandidatNomme {
  readonly statut_au_gel: "actif" | "nouveau" | "retire";
  readonly items_p_verifies: number;
  readonly sous_seuil: boolean;
  readonly interroge: boolean;
}

/** La part du run que ce lot lit. Le run complet porte bien d'autres champs. */
export interface RunAuGel {
  readonly id: string;
  readonly date_gel: string;
  readonly perimetre: { readonly candidats: readonly CandidatAuGel[] };
}

/* ------------------------------------------------------------------ symétrie */

export const CODES_CONDITION = [
  "nombre_questions_par_candidat",
  "repartition_gabarits_formulations",
  "repartition_themes",
  "aucun_item_conteste_ou_en_attente",
  "aucun_nom_candidat_dans_q_att",
  "part_items_a_f_minimale",
] as const;

export type CodeCondition = (typeof CODES_CONDITION)[number];

export const STATUTS_SYMETRIE = ["vert", "ecart_tolere", "rouge"] as const;
export type StatutSymetrie = (typeof STATUTS_SYMETRIE)[number];

export interface DetailCandidat {
  readonly candidat_id: string;
  readonly valeur: number;
}

export interface ConditionSymetrie {
  readonly code: CodeCondition;
  readonly statut: StatutSymetrie;
  readonly mesure?: number;
  readonly seuil?: number;
  readonly detail_par_candidat?: readonly DetailCandidat[];
  readonly commentaire?: string;
}

export interface Symetrie {
  readonly statut_global: StatutSymetrie;
  readonly conditions: readonly ConditionSymetrie[];
}
