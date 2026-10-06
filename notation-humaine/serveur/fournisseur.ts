/**
 * Le fournisseur d'existences de l'écran de notation humaine.
 *
 * L'interface vit dans `pipeline/notation/fournisseur-existences.ts`, partagée avec la chaîne de
 * notation des juges ; elle est réexportée ici pour les modules de l'écran. Contrat inchangé : un
 * lien sans verdict dans le résultat n'a pas de verdict, la réponse n'est pas proposée à la notation
 * et l'écran la compte « en attente du test des liens ». Aucun verdict n'est jamais supposé.
 */

import type { FournisseurExistences } from "../../pipeline/notation/fournisseur-existences.ts";

export type { FournisseurExistences } from "../../pipeline/notation/fournisseur-existences.ts";

/**
 * La seule implémentation de production de cette PR : aucun verdict d'existence n'est connu. Une
 * réponse sans lien reste notable ; une réponse qui en cite est comptée en attente.
 */
export const FOURNISSEUR_SANS_EXISTENCE: FournisseurExistences = {
  existencesDe: () => [],
};
