/**
 * Ce que `pnpm proprete` relève, et les seuils. Un signal n'est pas un défaut : c'est un endroit
 * qu'un relecteur doit regarder (compétence `revue-de-code`). Les seuils vivent ici, une fois.
 */

/** Les genres de signal, dans l'ordre des sections du rapport. */
export const GENRES = ["fichier-long", "fonction-longue", "conversion", "defaut", "capture", "compteur"] as const;
export type Genre = (typeof GENRES)[number];

export interface Signal {
  readonly genre: Genre;
  /** Chemin relatif à la racine du dépôt, séparateurs `/`. */
  readonly fichier: string;
  readonly ligne: number;
  readonly detail: string;
}

export const SEUIL_FICHIER_LIGNES = 400;
export const SEUIL_FONCTION_LIGNES = 50;

/** Titre de la section de chaque genre. */
export const TITRES: Readonly<Record<Genre, string>> = {
  "fichier-long": `Fichiers de plus de ${SEUIL_FICHIER_LIGNES} lignes`,
  "fonction-longue": `Fonctions de plus de ${SEUIL_FONCTION_LIGNES} lignes (TypeScript)`,
  conversion: "Conversions de type `as` (hors `as const`)",
  defaut: "Valeurs par défaut littérales (`??`, `||`, `or`, `.get(clé, défaut)`)",
  capture: "Erreurs capturées sans nom ou sans traitement",
  compteur: "Nombres écrits en dur dans un commentaire",
};

/**
 * « seize schémas », « 70 exemples » : un compte écrit dans un commentaire se périme au premier
 * ajout, sans qu'aucun test ne le voie.
 */
export const MOTIF_COMPTEUR =
  /\b(\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt)\s+(exemples?|schémas?|fichiers?|tests?|règles?|lots?|objets?|gabarits?|sources?|cas limites)\b/iu;

export function compteurDans(ligne: string): string | null {
  const trouve = MOTIF_COMPTEUR.exec(ligne);
  return trouve === null ? null : trouve[0];
}
