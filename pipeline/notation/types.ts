/**
 * Types du noyau de notation (§7).
 *
 * Ils transcrivent `schema/notation.schema.json`, `schema/verdict.schema.json` et la part de
 * `schema/run.schema.json` que la règle de décision lit (juges, graines, taux de l'échantillon
 * humain). Aucun nom de champ n'est inventé : les énumérations viennent de `analysis/types.ts`, qui
 * les confronte déjà aux schémas (`tests/enumerations-schemas.test.ts`).
 *
 * Le noyau est pur : aucune lecture de fichier, aucun appel réseau, aucune horloge, aucun
 * identifiant engendré. L'identifiant et la date d'un verdict sont fournis par l'appelant ; la
 * validation de schéma des entrées et des sorties a lieu à la frontière qui lit et écrit les
 * fichiers (lot notation, PR C), et les tests valident chaque verdict produit contre le schéma.
 */

import type {
  CategorieRetenue,
  ContexteMesure,
  Drapeau,
  Gabarit,
  IdentifiantCourt,
  Instant,
  MotifNotation,
  ObjetNote,
  ReferenceItem,
  SourcageRetenu,
  Ulid,
  VerdictExistence,
  VerdictSoutien,
} from "../../analysis/types.ts";
import type { GraineTirage } from "../questions/types.ts";

/** `notation.schema.json#/properties/motif_inexactitude`. */
export const MOTIFS_INEXACTITUDE = [
  "position_opposee",
  "position_inventee",
  "ajout_fabrique",
  "quantification_fausse",
  "perimetre_faux",
  "candidat_confondu",
  "omission",
  "liste_incomplete",
  "autre",
] as const;
export type MotifInexactitude = (typeof MOTIFS_INEXACTITUDE)[number];

/** `verdict.schema.json#/properties/mode_resolution`. */
export const MODES_RESOLUTION = [
  "accord_juges",
  "tranche_humain",
  "echantillon_humain_10",
  "revue_erreur_grave",
  "arbitrage_panel",
  "juge_unique_apres_retrait",
] as const;
export type ModeResolution = (typeof MODES_RESOLUTION)[number];

/** §7 : les deux drapeaux qui imposent une revue humaine avant publication. */
export const DRAPEAUX_GRAVES: readonly Drapeau[] = ["fabrication", "mauvaise_attribution"];

export interface LienNotation {
  readonly url_citee: string;
  readonly url_finale?: string;
  readonly code_http?: number | null;
  readonly date_test: Instant;
  readonly verdict_existence: VerdictExistence;
  readonly verdict_soutien: VerdictSoutien;
  readonly sha256_contenu?: string;
  readonly archive_url?: string;
}

export interface ExtraitJustificatif {
  readonly provenance: "reponse" | "reference";
  readonly texte: string;
  readonly offset_debut?: number;
  readonly offset_fin?: number;
  readonly verifie_deterministe: boolean;
}

export interface Notateur {
  readonly type: "juge" | "humain";
  readonly id: IdentifiantCourt;
  readonly famille_modele?: string;
  readonly modele?: string;
  readonly version_prompt?: string;
  readonly sensibilite_declaree_famille?: string;
  readonly a_vu_identite_outil?: boolean;
}

/** Une notation individuelle, champ pour champ celle de `schema/notation.schema.json`. */
export interface NotationIndividuelle {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: ContexteMesure;
  readonly objet_note: ObjetNote;
  readonly notateur: Notateur;
  readonly gabarit: Gabarit;
  readonly references_item: readonly ReferenceItem[];
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  readonly motif_inexactitude?: MotifInexactitude;
  readonly obsolescence_fraiche?: boolean;
  readonly attribution?: {
    readonly attendus: readonly IdentifiantCourt[];
    readonly cites: readonly IdentifiantCourt[];
    readonly hors_perimetre_cites?: readonly string[];
  };
  readonly sourcage: { readonly cite: boolean; readonly liens: readonly LienNotation[] };
  readonly extrait_justificatif?: ExtraitJustificatif;
  readonly date: Instant;
  readonly duree_ms?: number;
  readonly motif_notation?: MotifNotation;
}

export interface RevueHumaine {
  readonly effectuee: boolean;
  readonly date: Instant;
  readonly annotateurs?: readonly IdentifiantCourt[];
}

/** Un verdict, champ pour champ celui de `schema/verdict.schema.json`. */
export interface VerdictProduit {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: ContexteMesure;
  readonly objet_note: ObjetNote;
  readonly categorie_retenue: CategorieRetenue;
  readonly drapeaux_retenus: readonly Drapeau[];
  readonly motif_inexactitude_retenu?: MotifInexactitude;
  readonly obsolescence_fraiche?: boolean;
  readonly sourcage_retenu: SourcageRetenu;
  readonly notations_sources: readonly Ulid[];
  readonly mode_resolution: ModeResolution;
  readonly desaccord_juges: boolean;
  readonly dans_echantillon_humain: boolean;
  readonly erreur_grave: boolean;
  readonly revue_humaine?: RevueHumaine;
  readonly date: Instant;
}

/** Un juge du run (`run.schema.json#/properties/juges`), réduit à ce que la notation lit. */
export interface JugeDuRun {
  readonly juge_id: IdentifiantCourt;
  readonly retire: boolean;
}

/** `run.schema.json#/properties/taux_echantillon_humain` : stocké, jamais supposé. */
export type TauxEchantillonHumain = 0.1 | 0.25;

/** La part d'un run que lit le noyau de notation. */
export interface RunDeNotation {
  readonly id: Ulid;
  readonly juges: readonly JugeDuRun[];
  readonly taux_echantillon_humain: TauxEchantillonHumain;
  readonly graines: {
    readonly echantillon_humain: GraineTirage;
    readonly contrefactuel: GraineTirage;
  };
}
