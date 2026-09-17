/**
 * Spécification de l'interaction : raccourcis clavier et coût en gestes de chaque décision.
 *
 * Ce fichier existe pour une raison précise. « Accepter, rejeter et non évaluable coûtent le
 * même nombre de gestes » est une exigence méthodologique — un raccourci plus rapide pour
 * accepter produit un biais d'acquiescement, et ce biais se retrouverait ensuite dans le jeu
 * de données de référence, donc dans toutes les mesures. Une exigence de cette nature ne peut
 * pas reposer sur la vigilance de celui qui écrit l'écran : elle doit être **calculable**.
 *
 * Le client construit donc son clavier à partir de cette table, et le test de symétrie compte
 * les gestes à partir de la même table. Les deux ne peuvent pas diverger sans que le test ne
 * tombe.
 *
 * Ce que le test couvre : le nombre de gestes. Ce qu'il ne couvre pas : la taille des boutons,
 * leur couleur, leur ordre à l'écran. Ces trois-là sont tenus par la revue humaine, et il vaut
 * mieux le dire que le laisser croire.
 */

import { applicabiliteDe } from "./decision.ts";
import { CLES_GRILLE, questionsSpecifiques } from "./grille.ts";
import type { Decision, Item } from "./types.ts";

export type Categorie = "grille" | "decision" | "navigation" | "edition" | "aide";

export interface Raccourci {
  readonly touche: string;
  readonly libelle: string;
  readonly categorie: Categorie;
}

/** Les trois décisions soumises à la symétrie de friction. « corriger » en est exclue : elle ouvre une édition, donc coûte davantage par nature. */
export const DECISIONS_SYMETRIQUES: readonly Decision[] = ["accepter", "rejeter", "non_evaluable"];

/** Une touche par décision, et la même confirmation pour toutes les quatre. */
export const TOUCHES_DECISION: Readonly<Record<Decision, string>> = {
  accepter: "a",
  corriger: "c",
  rejeter: "r",
  non_evaluable: "e",
};

export const TOUCHE_CONFIRMATION = "Enter";

/** Une réponse de grille se donne d'une touche ; le focus avance tout seul à la suivante. */
export const TOUCHES_REPONSE: Readonly<Record<"oui" | "non", string>> = { oui: "o", non: "n" };

export const RACCOURCIS: readonly Raccourci[] = [
  { touche: "o", libelle: "Répondre « oui » à la question courante", categorie: "grille" },
  { touche: "n", libelle: "Répondre « non » à la question courante", categorie: "grille" },
  { touche: "Tab", libelle: "Question suivante", categorie: "grille" },
  { touche: "Shift+Tab", libelle: "Question précédente", categorie: "grille" },
  { touche: "a", libelle: "Décision : accepter", categorie: "decision" },
  { touche: "r", libelle: "Décision : rejeter", categorie: "decision" },
  { touche: "e", libelle: "Décision : non évaluable", categorie: "decision" },
  { touche: "c", libelle: "Décision : corriger (ouvre l'édition)", categorie: "decision" },
  { touche: "Enter", libelle: "Confirmer la décision choisie", categorie: "decision" },
  { touche: "Escape", libelle: "Annuler le choix en cours, sans rien écrire", categorie: "decision" },
  { touche: "Ctrl+z", libelle: "Annuler ma dernière décision (nouvelle entrée au journal)", categorie: "edition" },
  { touche: "k", libelle: "Écrire un commentaire", categorie: "edition" },
  { touche: "ArrowRight", libelle: "Item suivant, sans décider", categorie: "navigation" },
  { touche: "ArrowLeft", libelle: "Item précédent, sans décider", categorie: "navigation" },
  { touche: "s", libelle: "Placer le focus sur la source", categorie: "navigation" },
  { touche: "g", libelle: "Revenir à la citation surlignée dans la source", categorie: "navigation" },
  { touche: "?", libelle: "Afficher les raccourcis", categorie: "aide" },
];

/**
 * Questions auxquelles l'annotateur doit répondre avant de pouvoir décider, quelle que soit
 * la décision. Le fait qu'elles soient exigées **identiquement** pour les quatre décisions est
 * le cœur de la symétrie : si rejeter dispensait de la grille, rejeter coûterait moins cher.
 */
export function questionsObligatoires(item: Item): readonly string[] {
  const questions: string[] = [];
  if (item.type === "O") {
    questions.push(...questionsDUneGrille(item, "anterieur"), ...questionsDUneGrille(item, "posterieur"));
  } else {
    questions.push(...questionsDUneGrille(item));
  }
  questions.push(...questionsSpecifiques(item.type));
  return questions;
}

function questionsDUneGrille(item: Item, etat?: "anterieur" | "posterieur"): readonly string[] {
  const applicabilite = applicabiliteDe(item, etat);
  const prefixe = etat === undefined ? "" : `${etat}.`;
  return CLES_GRILLE.filter((cle) => applicabilite[cle] === "applicable").map(
    (cle) => `${prefixe}${cle}`,
  );
}

export interface CoutDecision {
  /** Frappes nécessaires pour désigner la décision. */
  readonly touches_decision: number;
  /** Une confirmation est-elle demandée avant écriture ? */
  readonly confirmation: boolean;
  /** La grille complète est-elle exigée avant de pouvoir décider ? */
  readonly exige_grille: boolean;
  /** La décision ouvre-t-elle une édition d'ampleur inconnue ? */
  readonly gestes_variables: boolean;
}

/**
 * Le coût de chaque décision, en données.
 *
 * Trois lignes identiques, et c'est tout l'intérêt : la symétrie de friction devient une
 * propriété de cette table, qu'un test vérifie, au lieu d'une intention dans un écran. Passer
 * `confirmation` à `false` pour « accepter », ou `exige_grille` à `false` pour « rejeter »,
 * fait tomber le test — ce qui est exactement ce qu'on veut, car les deux se défendraient très
 * bien du point de vue de l'ergonomie.
 */
export const COUT_DECISION: Readonly<Record<Decision, CoutDecision>> = {
  accepter: { touches_decision: 1, confirmation: true, exige_grille: true, gestes_variables: false },
  rejeter: { touches_decision: 1, confirmation: true, exige_grille: true, gestes_variables: false },
  non_evaluable: { touches_decision: 1, confirmation: true, exige_grille: true, gestes_variables: false },
  corriger: { touches_decision: 1, confirmation: true, exige_grille: true, gestes_variables: true },
};

/**
 * Nombre de gestes entre l'affichage d'un item et l'enregistrement d'une décision.
 * « variable » pour « corriger », qui ouvre l'édition d'un nombre de champs inconnu d'avance :
 * c'est la seule décision dont le coût n'est pas comparable, et elle est hors de l'exigence.
 */
export function gestesPourDecision(item: Item, decision: Decision): number | "variable" {
  const cout = COUT_DECISION[decision];
  if (cout.gestes_variables) return "variable";
  return (
    (cout.exige_grille ? questionsObligatoires(item).length : 0) +
    cout.touches_decision +
    (cout.confirmation ? 1 : 0)
  );
}
