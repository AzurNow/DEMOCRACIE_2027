/**
 * Types du lot « interrogation ».
 *
 * Ils transcrivent `schema/reponse.schema.json` pour la part que ce lot écrit : une réponse du
 * canal API, contexte « run ». Aucun nom de champ n'est inventé ici. Les listes fermées recopient
 * un `enum` du schéma ; `tests/interrogation/enumerations.test.ts` les y confronte.
 */

export const MODES = ["web_activee", "web_desactivee"] as const;
export type Mode = (typeof MODES)[number];

/** `reponse.schema.json#/$defs/tentative/properties/erreur/properties/type`. */
export const TYPES_ERREUR_TENTATIVE = ["reseau", "http", "quota", "timeout", "autre"] as const;
export type TypeErreurTentative = (typeof TYPES_ERREUR_TENTATIVE)[number];

/** `reponse.schema.json#/properties/motif_manquante` (décision de l'auteur du 2026-10-02). */
export const MOTIFS_MANQUANTE = ["echecs", "hors_fenetre"] as const;
export type MotifManquante = (typeof MOTIFS_MANQUANTE)[number];

export type ObjetJson = Readonly<Record<string, unknown>>;

export interface ErreurTentative {
  readonly type: TypeErreurTentative;
  readonly message: string;
  readonly code_http?: number;
}

/** Une tentative en échec, telle que la réponse la conserve. */
export interface Tentative {
  readonly numero: number;
  readonly horodatage: string;
  readonly erreur: ErreurTentative;
}

/**
 * Une requête du plan : l'unité de mesure du §2 (question × outil × mode × formulation ×
 * échantillon), avec ce qu'il faut pour l'envoyer et l'enregistrer.
 */
export interface RequetePlanifiee {
  readonly outil_id: string;
  readonly alias_aveugle: string;
  readonly modele_demande: string;
  readonly mode: Mode;
  readonly question_id: string;
  readonly formulation_id: string;
  /** Le texte de la formulation, envoyé tel quel et seul (§6, règle 6). */
  readonly texte: string;
  readonly echantillon: number;
}

/** Ce qui identifie une requête, à travers les relances et les reprises. */
export interface CleRequete {
  readonly outil_id: string;
  readonly question_id: string;
  readonly mode: Mode;
  readonly formulation_id: string;
  readonly echantillon: number;
}

export interface ProjectionNormalisee {
  readonly texte: string;
  readonly liens: readonly string[];
  readonly citations?: readonly ObjetJson[];
  readonly appels_outils?: readonly ObjetJson[];
  readonly troncature: boolean;
  readonly refus_api: boolean;
}

export interface MetadonneesReponse {
  readonly modele_demande: string;
  readonly modele_renvoye: string | null;
  readonly horodatage_requete: string;
  readonly horodatage_reponse: string;
  readonly latence_ms: number;
  readonly stop_reason: string | null;
  readonly parametres_effectifs: ObjetJson;
  readonly tokens?: { readonly entree?: number; readonly sortie?: number };
}

export interface RequeteEnregistree {
  readonly corps: ObjetJson;
  readonly sha256: string;
  readonly endpoint: string;
  readonly horodatage: string;
}

interface ReponseCommune {
  readonly id: string;
  readonly run_id: string;
  readonly contexte: "run";
  readonly canal: "api";
  readonly alias_aveugle: string;
  readonly outil_id: string;
  readonly mode: Mode;
  readonly question_id: string;
  readonly formulation_id: string;
  readonly echantillon: number;
  readonly requete: RequeteEnregistree;
}

export interface ReponseObtenue extends ReponseCommune {
  readonly statut_reponse: "obtenue";
  readonly brut: ObjetJson;
  readonly brut_sha256: string;
  readonly normalise: ProjectionNormalisee;
  readonly normalisation: { readonly fonction: string; readonly version: string };
  readonly metadonnees: MetadonneesReponse;
  readonly tentatives?: readonly Tentative[];
}

export interface ReponseManquante extends ReponseCommune {
  readonly statut_reponse: "manquante";
  readonly motif_manquante: MotifManquante;
  readonly tentatives: readonly Tentative[];
}

/** Une réponse écrite par ce lot, conforme à `schema/reponse.schema.json`. */
export type ReponseEcrite = ReponseObtenue | ReponseManquante;

export function cleDe(requete: CleRequete): CleRequete {
  return {
    outil_id: requete.outil_id,
    question_id: requete.question_id,
    mode: requete.mode,
    formulation_id: requete.formulation_id,
    echantillon: requete.echantillon,
  };
}
