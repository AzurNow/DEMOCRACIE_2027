/**
 * Le fournisseur d'existences de l'écran de notation humaine.
 *
 * L'interface vit dans `pipeline/notation/fournisseur-existences.ts`, partagée avec la chaîne de
 * notation des juges ; elle est réexportée ici pour les modules de l'écran. Contrat inchangé : un
 * lien sans verdict dans le résultat n'a pas de verdict, la réponse n'est pas proposée à la notation
 * et l'écran la compte « en attente du test des liens ». Aucun verdict n'est jamais supposé.
 */

import { existsSync } from "node:fs";
import type { FournisseurExistences } from "../../pipeline/notation/fournisseur-existences.ts";
import { fournisseurFichiers, repertoireLiens } from "../../pipeline/notation/fournisseur-fichiers.ts";

export type { FournisseurExistences } from "../../pipeline/notation/fournisseur-existences.ts";

/**
 * Aucun verdict d'existence n'est connu : le test des liens n'est pas encore passé sur ce run. Une
 * réponse sans lien reste notable ; une réponse qui en cite est comptée en attente.
 */
export const FOURNISSEUR_SANS_EXISTENCE: FournisseurExistences = {
  existencesDe: () => [],
};

/**
 * Le fournisseur de production d'un run : les fichiers de `volume/liens/` (`pnpm liens`, D20) s'il
 * existe, sinon aucun verdict. Un fichier invalide ou incohérent lève à la construction
 * (`ErreurSchema`, `FichierExistenceRefuse`) : l'écran ne démarre pas sur des verdicts douteux.
 */
export function fournisseurDuRun(repertoire_run: string): FournisseurExistences {
  return existsSync(repertoireLiens(repertoire_run)) ? fournisseurFichiers(repertoire_run) : FOURNISSEUR_SANS_EXISTENCE;
}
