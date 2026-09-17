/**
 * Kappa de Cohen non pondéré (§4).
 *
 * Deux décisions de conception qui changent le nombre publié :
 *
 * 1. **Les catégories sont fixées a priori**, jamais déduites de l'échantillon. Déduire les
 *    catégories des valeurs observées fait dépendre l'accord attendu par hasard de ce que les
 *    annotateurs ont fait, donc rend deux lots incomparables.
 * 2. **Le test de dégénérescence est exact.** En posant `p₀ = A/n` et `pₑ = B/n²`, le kappa
 *    vaut `(A·n − B) / (n² − B)` : deux entiers. Le cas indéfini est alors « dénominateur
 *    strictement nul », pas « à peu près nul » — un flottant aurait produit un kappa
 *    astronomique là où il n'en existe aucun.
 */

import type { CategorieKappa, Decision } from "./types.ts";

/** Ordre figé : il fixe l'indexation de la matrice de confusion. */
export const CATEGORIES_KAPPA: readonly CategorieKappa[] = ["retenu", "rejete", "non_evaluable"];

/**
 * §4, lecture retenue : c'est le devenir de l'item qui compte. « accepter » et « corriger »
 * mènent tous deux à un item vérifié ; les distinguer pénaliserait une coquille repérée par un
 * seul des deux annotateurs. « rejeté » et « non évaluable » ne fusionnent pas : l'un dit que
 * l'extraction est fausse, l'autre que le candidat est flou.
 */
export function categorieDe(decision: Decision): CategorieKappa {
  if (decision === "accepter" || decision === "corriger") return "retenu";
  if (decision === "rejeter") return "rejete";
  return "non_evaluable";
}

export type MotifIndefini = "aucun_item_commun" | "accord_attendu_maximal";

export interface ResultatKappa {
  /** `null` quand le kappa n'est pas défini. Jamais 0, jamais 1 : une absence reste absente. */
  readonly kappa: number | null;
  readonly motif_indefini: MotifIndefini | null;
  /** Accord observé. Toujours publié à côté du kappa, y compris quand celui-ci est indéfini. */
  readonly accord_observe: number | null;
  readonly accord_attendu: number | null;
  readonly n: number;
}

export interface PaireCategories<T extends string> {
  readonly a: T;
  readonly b: T;
}

/**
 * Kappa sur un jeu de catégories quelconque, fixé par l'appelant.
 * Toute paire dont une catégorie est hors de `categories` est une erreur de programmation, pas
 * une donnée à ignorer silencieusement : elle lève.
 */
export function kappaCohen<T extends string>(
  paires: readonly PaireCategories<T>[],
  categories: readonly T[],
): ResultatKappa {
  const n = paires.length;
  if (n === 0) {
    return { kappa: null, motif_indefini: "aucun_item_commun", accord_observe: null, accord_attendu: null, n: 0 };
  }

  const matrice = matriceConfusion(paires, categories);
  const accords = sommeDiagonale(matrice);
  const attendus = sommeProduitsMarginaux(matrice, categories.length);

  const denominateur = n * n - attendus;
  const accordObserve = accords / n;
  const accordAttendu = attendus / (n * n);

  if (denominateur === 0) {
    return {
      kappa: null,
      motif_indefini: "accord_attendu_maximal",
      accord_observe: accordObserve,
      accord_attendu: accordAttendu,
      n,
    };
  }

  return {
    kappa: (accords * n - attendus) / denominateur,
    motif_indefini: null,
    accord_observe: accordObserve,
    accord_attendu: accordAttendu,
    n,
  };
}

function matriceConfusion<T extends string>(
  paires: readonly PaireCategories<T>[],
  categories: readonly T[],
): number[][] {
  const taille = categories.length;
  const matrice: number[][] = Array.from({ length: taille }, () => new Array<number>(taille).fill(0));
  for (const paire of paires) {
    const i = categories.indexOf(paire.a);
    const j = categories.indexOf(paire.b);
    if (i < 0 || j < 0) {
      throw new Error(`Catégorie hors du jeu fixé a priori : ${paire.a} / ${paire.b}`);
    }
    const ligne = matrice[i] as number[];
    ligne[j] = (ligne[j] as number) + 1;
  }
  return matrice;
}

function sommeDiagonale(matrice: readonly (readonly number[])[]): number {
  let total = 0;
  for (let i = 0; i < matrice.length; i += 1) {
    total += (matrice[i] as readonly number[])[i] as number;
  }
  return total;
}

function sommeProduitsMarginaux(matrice: readonly (readonly number[])[], taille: number): number {
  let total = 0;
  for (let i = 0; i < taille; i += 1) {
    let ligne = 0;
    let colonne = 0;
    for (let j = 0; j < taille; j += 1) {
      ligne += (matrice[i] as readonly number[])[j] as number;
      colonne += (matrice[j] as readonly number[])[i] as number;
    }
    total += ligne * colonne;
  }
  return total;
}

/**
 * Le kappa publié, et le seul critère go/no-go : trois catégories dérivées de la décision.
 */
export function kappaPublie(paires: readonly PaireCategories<Decision>[]): ResultatKappa {
  const categories = paires.map((paire) => ({ a: categorieDe(paire.a), b: categorieDe(paire.b) }));
  return kappaCohen(categories, CATEGORIES_KAPPA);
}

const CATEGORIES_BINAIRES: readonly ["oui", "non"] = ["oui", "non"];

/**
 * Kappa par question de la grille, diagnostic secondaire. Calculé uniquement sur les items où
 * les **deux** réponses sont non nulles : un `null` dit « sans objet pour ce type d'item », et
 * le compter comme un désaccord inventerait de la discorde là où il n'y a pas de question.
 */
export function kappaQuestion(
  paires: readonly { readonly a: boolean | null; readonly b: boolean | null }[],
): ResultatKappa {
  const retenues: PaireCategories<"oui" | "non">[] = [];
  for (const paire of paires) {
    if (typeof paire.a !== "boolean" || typeof paire.b !== "boolean") continue;
    retenues.push({ a: paire.a ? "oui" : "non", b: paire.b ? "oui" : "non" });
  }
  return kappaCohen(retenues, CATEGORIES_BINAIRES);
}

/** Seuil du §4 : sous 0,80, le lot est réannoté après séance de calibration. */
export const SEUIL_KAPPA = 0.8;

/**
 * L'alerte se déclenche **sous** 0,80, pas **à** 0,80. Un kappa indéfini ne la déclenche pas :
 * un accord observé parfait n'est pas un désaccord.
 */
export function alerteReannotation(resultat: ResultatKappa): boolean {
  return resultat.kappa !== null && resultat.kappa < SEUIL_KAPPA;
}
