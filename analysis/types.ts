/**
 * Types d'entrée des analyses préenregistrées (§8), et les deux types de sortie communs.
 *
 * Ces types sont la projection des schémas de `schema/` sur ce dont la mesure a besoin : les
 * noms de champs et les énumérations en viennent tels quels, jamais renommés ni complétés. Ce
 * qui manque ici manque à l'analyse, et c'est voulu — une réponse porte bien plus de champs que
 * ceux lus par une métrique (même principe que `validation/domaine/types.ts`).
 *
 * Aucune validation de schéma à l'exécution n'est faite ici : le dépôt n'a pas encore de
 * validateur JSON Schema côté TypeScript, et en ajouter un est un ajout de dépendance
 * (schema/README.md : « le runner n'est pas encore dans le dépôt »). La frontière d'entrée de ce
 * lot est donc typée, pas validée ; le point est signalé dans le rapport de lot.
 */

export type Ulid = string;
export type IdentifiantCourt = string;
export type Instant = string;
export type EmpreinteSha256 = string;

/**
 * §8, garde-fou structurel : seul `run` alimente les métriques. Les autres contextes existent
 * dans les données (pilote, jeu d'or, réponses permutées du test contrefactuel du §7).
 */
export type ContexteMesure = "run" | "pilote" | "jeu_or" | "contrefactuel_candidat" | "contrefactuel_outil";

export type TypeItem = "P" | "A" | "O" | "F";

export type Gabarit = "Q-DIR" | "Q-FER" | "Q-ATT" | "Q-NEG" | "Q-ORI" | "Q-ACT";

export type Registre = "neutre" | "familier" | "oriente";

export type Theme =
  | "fiscalite_pouvoir_achat"
  | "retraites"
  | "travail_emploi"
  | "sante"
  | "education"
  | "securite_justice"
  | "immigration"
  | "ecologie_energie"
  | "institutions_democratie"
  | "europe_defense_international";

export type Mode = "web_activee" | "web_desactivee";

export type Canal = "api" | "application";

export type CategorieRetenue = "exacte" | "inexacte" | "non_reponse" | "indeterminee";

export type Drapeau =
  | "fabrication"
  | "mauvaise_attribution"
  | "obsolescence"
  | "deformation"
  | "confirmation_premisse";

/** Ordre figé : il fixe l'ordre de la répartition des drapeaux parmi les inexactes (§8). */
export const DRAPEAUX: readonly Drapeau[] = [
  "fabrication",
  "mauvaise_attribution",
  "obsolescence",
  "deformation",
  "confirmation_premisse",
];

export type StatutReponse = "obtenue" | "manquante";

export type RoleItem = "principal" | "attendu_dans_liste" | "distracteur" | "contexte";

/** Les trois booléens qui portent exactement la métrique « sourçage valide » du §8. */
export interface SourcageRetenu {
  readonly cite: boolean;
  readonly au_moins_un_lien_existant: boolean;
  readonly au_moins_un_lien_soutenant: boolean;
}

export interface ObjetNote {
  readonly type: "reponse" | "lecture_comparateur";
  readonly id: Ulid;
}

export interface Verdict {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: ContexteMesure;
  readonly objet_note: ObjetNote;
  readonly categorie_retenue: CategorieRetenue;
  readonly drapeaux_retenus: readonly Drapeau[];
  /** §11 : présent uniquement avec le drapeau obsolescence. */
  readonly obsolescence_fraiche?: boolean;
  readonly sourcage_retenu: SourcageRetenu;
  readonly dans_echantillon_humain: boolean;
  readonly erreur_grave: boolean;
}

export interface ProjectionNormalisee {
  readonly texte: string;
  readonly liens: readonly string[];
  readonly troncature: boolean;
}

export interface Reponse {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: ContexteMesure;
  readonly canal: Canal;
  readonly outil_id: IdentifiantCourt;
  /** §6 : obligatoire pour le canal api, interdit pour le canal application. */
  readonly mode?: Mode;
  readonly question_id: string;
  readonly formulation_id: Ulid;
  readonly echantillon: number;
  readonly statut_reponse: StatutReponse;
  /** Absent sur une réponse manquante : elle n'a rien à montrer. */
  readonly normalise?: ProjectionNormalisee;
}

export interface ReferenceItem {
  readonly item_id: Ulid;
  readonly item_version: number;
  readonly item_empreinte: EmpreinteSha256;
}

export interface ItemDeQuestion {
  readonly reference: ReferenceItem;
  readonly role: RoleItem;
}

export interface Formulation {
  readonly id: Ulid;
  readonly registre: Registre;
  readonly empreinte_texte: EmpreinteSha256;
  /** Obligatoire pour le registre orienté, absent sinon. Dénominateur de la confirmation de prémisse (§8). */
  readonly premisse_fausse?: boolean;
}

export interface Question {
  readonly id: string;
  readonly gabarit: Gabarit;
  /** Absent pour Q-ATT : §5 interdit de nommer un candidat dans une question d'attribution. */
  readonly candidat_id?: IdentifiantCourt;
  readonly items: readonly ItemDeQuestion[];
  readonly grappe_id: Ulid;
  readonly formulations: readonly Formulation[];
}

export interface Item {
  readonly id: Ulid;
  readonly version: number;
  readonly type: TypeItem;
  readonly candidat_id: IdentifiantCourt;
}

/** Une entrée du tirage : ce que la question valait au gel du run (thème, gabarit, candidat). */
export interface EntreeTirage {
  readonly question_id: string;
  readonly candidat_id?: IdentifiantCourt;
  readonly theme?: Theme;
  readonly gabarit: Gabarit;
  readonly grappe_id?: Ulid;
}

export interface CandidatAuGel {
  readonly candidat_id: IdentifiantCourt;
  readonly statut_au_gel: "actif" | "nouveau" | "retire";
  readonly items_p_verifies: number;
  /** §4 et §8 : lu, jamais recalculé ici. */
  readonly sous_seuil: boolean;
  readonly interroge: boolean;
}

export interface OutilAuGel {
  readonly outil_id: IdentifiantCourt;
  readonly famille: "assistant" | "comparateur";
  readonly inclus: boolean;
  /** §8 : le mode dont vient le chiffre de tête. Lu, jamais décidé par l'analyse. */
  readonly mode_de_tete?: Mode;
}

export interface ContestationPosterieure {
  readonly item_id: Ulid;
  readonly contestation_id: Ulid;
  readonly date_reception: Instant;
}

export interface Run {
  readonly id: Ulid;
  readonly date_gel: Instant;
  readonly perimetre: {
    readonly candidats: readonly CandidatAuGel[];
    readonly outils: readonly OutilAuGel[];
  };
  /** Entrée exacte de l'analyse de robustesse §8(b). Absent = aucune contestation reçue. */
  readonly contestations_posterieures?: readonly ContestationPosterieure[];
}

export interface LectureComparateur {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: ContexteMesure;
  readonly outil_id: IdentifiantCourt;
  readonly reference_item: ReferenceItem;
  /** Première des deux mesures du §6 : couverture, indépendante de l'exactitude. */
  readonly affiche: boolean;
}

/**
 * Un taux publié. `valeur` est **absente** quand le dénominateur est nul — ni `null`, ni `0`,
 * ni `NaN` : un taux sans dénominateur n'existe pas, et le faire exister à 0 publierait un
 * chiffre que personne n'a mesuré.
 */
export interface Taux {
  readonly numerateur: number;
  readonly denominateur: number;
  readonly valeur?: number;
}

/**
 * Seul constructeur de `Taux`. Il refuse les incohérences plutôt que de les arrondir : un
 * numérateur supérieur au dénominateur est un bug de comptage, pas une donnée à publier.
 */
export function taux(numerateur: number, denominateur: number): Taux {
  verifierEffectifs(numerateur, denominateur);
  if (denominateur === 0) return { numerateur, denominateur };
  return { numerateur, denominateur, valeur: numerateur / denominateur };
}

function verifierEffectifs(numerateur: number, denominateur: number): void {
  if (!Number.isInteger(numerateur) || !Number.isInteger(denominateur)) {
    throw new Error(`Effectifs non entiers : ${numerateur}/${denominateur}`);
  }
  if (numerateur < 0 || denominateur < 0) {
    throw new Error(`Effectifs négatifs : ${numerateur}/${denominateur}`);
  }
  if (numerateur > denominateur) {
    throw new Error(`Numérateur supérieur au dénominateur : ${numerateur}/${denominateur}`);
  }
}

export type MotifDegenerescence = "grappe_unique";

/**
 * Intervalle de confiance à 95 % par bootstrap en grappes (§8), méthode des percentiles.
 *
 * `degenere` n'est pas décoratif : sur une grappe unique, tous les rééchantillons sont
 * identiques et l'intervalle se réduit au point estimé. Publié tel quel, il ressemblerait à une
 * mesure d'une précision parfaite.
 */
export interface Intervalle95 {
  readonly bas: number;
  readonly haut: number;
  readonly nombre_grappes: number;
  readonly reechantillonnages: number;
  /** Rééchantillons dont la statistique est indéfinie (dénominateur nul) : exclus du percentile, comptés ici. */
  readonly reechantillonnages_indefinis: number;
  readonly degenere: MotifDegenerescence | null;
}
