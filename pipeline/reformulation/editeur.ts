/**
 * L'éditeur appelé pour reformuler : un adaptateur et un transport injectables, sur le modèle de
 * `pipeline/interrogation/editeur.ts` (D3), dont le transport, la requête et la lecture du corps
 * sont repris tels quels.
 *
 * Ce qui distingue un éditeur d'un autre — l'adresse, la forme du corps envoyé, l'en-tête
 * d'authentification, l'enveloppe qui porte le texte du modèle — vit dans son adaptateur. La
 * commande (`executer.ts`) ne connaît que cette interface : aucun `if` sur un éditeur.
 *
 * La classification HTTP est commune et ne dépend pas de l'éditeur : un statut hors 2xx est un
 * `echec_http` ; dans une réponse 2xx, l'adaptateur dit où lire le texte du modèle, ou pourquoi
 * l'enveloppe ne le donne pas (`corps_illisible`).
 */

import type { Contenu, RequeteHttp, Transport } from "../interrogation/editeur.ts";

/** Le texte du modèle lu dans l'enveloppe de l'éditeur, ou la raison pour laquelle il n'y est pas. */
export type LectureTexteModele =
  | { readonly lisible: true; readonly texte: string }
  | { readonly lisible: false; readonly raison: string };

export interface AdaptateurReformulation {
  /** Identifiant du modèle appelé, recopié dans `production.modele` de chaque proposition. */
  readonly modele: string;
  /** La requête prête à partir, authentification comprise : elle n'est jamais enregistrée. */
  construireRequete(prompt: string): RequeteHttp;
  /** Le texte du modèle dans le corps d'une réponse 2xx, sans rien en retirer ni y ajouter. */
  texteDuModele(contenu: Contenu): LectureTexteModele;
}

export interface EditeurReformulation {
  readonly adaptateur: AdaptateurReformulation;
  readonly transport: Transport;
}
