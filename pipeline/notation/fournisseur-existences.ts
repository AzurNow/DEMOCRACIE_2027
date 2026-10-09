/**
 * Le fournisseur d'existences : ce que la notation sait du test HTTP des liens (§7).
 *
 * Le test des liens (§7 : « test HTTP déterministe », lot `test-liens`) n'existe pas encore : il
 * attend une décision de l'auteur, car il ouvre un appel réseau nouveau. La notation ne l'attend pas
 * et ne l'invente pas : elle reçoit, par cette interface, les verdicts d'existence déjà établis,
 * réponse par réponse. Brancher le test des liens plus tard, c'est fournir une autre implémentation,
 * sans toucher à la notation.
 *
 * Contrat : `existencesDe` rend les verdicts connus pour les liens demandés, ni plus ni moins. Un lien
 * sans verdict dans le résultat n'a pas de verdict : la réponse n'est ni notée ni proposée à un
 * humain, et elle est comptée « en attente du test des liens ». Aucun verdict n'est jamais supposé.
 *
 * Partagé par l'écran de notation humaine (`notation-humaine/serveur/fournisseur.ts`, qui le
 * réexporte) et par la chaîne de notation des juges (`chaine.ts`).
 *
 * **Texte des copies (D27 (E)).** Le même passage conserve la copie d'un lien (page reçue, ou
 * version brute d'un instantané, D21), puis `pnpm liens:textes` en extrait le texte. `texteDeCopie`
 * rend ce que l'extraction a donné pour une copie, désignée par son empreinte (`sha256_contenu`) :
 * le texte, ou le refus d'extraction et son motif. `undefined` : l'extraction n'a pas encore eu lieu,
 * et la réponse attend comme elle attend un verdict d'existence. Jamais un texte supposé.
 */

import type { TexteDeCopie } from "./pages-citees.ts";
import type { ExistenceEtablie } from "./vue-annotateur.ts";

export interface FournisseurExistences {
  existencesDe(reponse_id: string, liens: readonly string[]): readonly ExistenceEtablie[];
  texteDeCopie(sha256_contenu: string): TexteDeCopie | undefined;
}
