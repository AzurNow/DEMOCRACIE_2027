/**
 * Le fournisseur d'existences : ce que l'écran de notation humaine sait du test HTTP des liens.
 *
 * Le test des liens (§7 : « test HTTP déterministe », lot `test-liens`) n'existe pas encore : il
 * attend une décision de l'auteur, car il ouvre un appel réseau nouveau. L'écran ne l'attend pas et
 * ne l'invente pas : il reçoit, par cette interface, les verdicts d'existence déjà établis, réponse
 * par réponse. Brancher le test des liens plus tard, c'est fournir une autre implémentation à
 * `demarrer`, sans toucher à l'écran.
 *
 * Contrat : `existencesDe` rend les verdicts connus pour les liens demandés, ni plus ni moins. Un lien
 * sans verdict dans le résultat n'a pas de verdict : la réponse n'est pas proposée à la notation et
 * l'écran la compte « en attente du test des liens ». Aucun verdict n'est jamais supposé.
 */

import type { ExistenceEtablie } from "../../pipeline/notation/vue-annotateur.ts";

export interface FournisseurExistences {
  existencesDe(reponse_id: string, liens: readonly string[]): readonly ExistenceEtablie[];
}

/**
 * La seule implémentation de production de cette PR : aucun verdict d'existence n'est connu. Une
 * réponse sans lien reste notable ; une réponse qui en cite est comptée en attente.
 */
export const FOURNISSEUR_SANS_EXISTENCE: FournisseurExistences = {
  existencesDe: () => [],
};
