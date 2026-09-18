/**
 * Quelles questions s'appliquent à quel type d'item, et comment se lit une réponse absente.
 *
 * Les cinq questions du §4 sont écrites pour un item P : « la citation est-elle fidèle à la
 * source » n'a pas de sens pour une absence, qui ne cite rien, et en a deux pour un item
 * obsolète, qui porte deux états sourcés. Cette table est la réponse, sous forme de données —
 * un `if` par type d'item dans le code de l'interface serait exactement l'anti-patron que
 * CLAUDE.md interdit.
 *
 * Règle invariable : une question sans objet vaut `null`, jamais `false`. `false` est un
 * jugement, `null` est une absence de sujet ; les confondre ferait entrer des désaccords
 * imaginaires dans le kappa par question.
 */

import type {
  CleGrille,
  CleSpecifique,
  EtatObsolescence,
  Grille,
  QuestionsSpecifiques,
  TypeItem,
} from "./types.ts";

export type Applicabilite = "applicable" | "sans_objet";

export const CLES_GRILLE: readonly CleGrille[] = [
  "citation_fidele",
  "paraphrase_exacte",
  "position_univoque",
  "theme_correct",
  "quantification_correcte",
];

/** Ce que l'annotateur lit à l'écran. Le libellé de `position_univoque` change pour un item A. */
export const LIBELLES_GRILLE: Readonly<Record<CleGrille, string>> = {
  citation_fidele: "La citation est-elle fidèle à la source ?",
  paraphrase_exacte: "La paraphrase est-elle exacte ?",
  position_univoque: "La position est-elle explicite et univoque ?",
  theme_correct: "Le thème est-il correct ?",
  quantification_correcte: "La quantification (montant, taux, date, périmètre) est-elle correcte ?",
};

export const LIBELLES_GRILLE_ABSENCE: Readonly<Partial<Record<CleGrille, string>>> = {
  position_univoque: "La mesure recherchée est-elle définie sans ambiguïté ?",
};

export const LIBELLES_SPECIFIQUES: Readonly<Record<CleSpecifique, string>> = {
  couverture_theme_verifiee: "Le programme cité couvre-t-il bien ce thème ?",
  corpus_complet: "La liste examinée correspond-elle au corpus T1 et T2 enregistré du candidat ?",
  confirmation_absence: "Je confirme qu'aucune position sur cette mesure ne figure dans ce corpus.",
  changement_explicite:
    "La source postérieure dit-elle que la position a changé ou été retirée (et pas simplement autre chose) ?",
  fictivite_verifiee: "Les corpus balayés et les termes recherchés justifient-ils la fictivité ?",
  plausibilite: "La mesure est-elle plausible (ni absurde, ni fantaisiste) ?",
};

const QUESTIONS_SPECIFIQUES: Readonly<Record<TypeItem, readonly CleSpecifique[]>> = {
  P: [],
  A: ["couverture_theme_verifiee", "corpus_complet", "confirmation_absence"],
  O: ["changement_explicite"],
  F: ["fictivite_verifiee", "plausibilite"],
};

export function questionsSpecifiques(type: TypeItem): readonly CleSpecifique[] {
  return QUESTIONS_SPECIFIQUES[type];
}

/** Contexte de l'item : ce dont dépend l'applicabilité au-delà du seul type. */
export interface ContexteApplicabilite {
  /** L'état jugé porte-t-il une quantification ? Sinon la question est sans objet. */
  readonly quantifie: boolean;
  /** Pour un item O : lequel des deux états est jugé. */
  readonly etat?: EtatObsolescence;
}

const SANS_OBJET_TOTAL: Readonly<Record<CleGrille, Applicabilite>> = {
  citation_fidele: "sans_objet",
  paraphrase_exacte: "sans_objet",
  position_univoque: "sans_objet",
  theme_correct: "sans_objet",
  quantification_correcte: "sans_objet",
};

function applicabiliteP(contexte: ContexteApplicabilite): Record<CleGrille, Applicabilite> {
  return {
    citation_fidele: "applicable",
    paraphrase_exacte: "applicable",
    position_univoque: "applicable",
    theme_correct: "applicable",
    quantification_correcte: contexte.quantifie ? "applicable" : "sans_objet",
  };
}

function applicabiliteA(): Record<CleGrille, Applicabilite> {
  // Une absence ne cite rien et ne paraphrase rien. Reste ce qui définit la recherche :
  // la mesure cherchée est-elle sans ambiguïté, et le thème est-il le bon.
  return {
    ...SANS_OBJET_TOTAL,
    position_univoque: "applicable",
    theme_correct: "applicable",
  };
}

function applicabiliteF(): Record<CleGrille, Applicabilite> {
  // Un item F n'a ni citation, ni paraphrase, ni position de candidat : sa substance est
  // dans la mesure fictive, jugée par les questions propres au type.
  return { ...SANS_OBJET_TOTAL, theme_correct: "applicable" };
}

function applicabiliteO(contexte: ContexteApplicabilite): Record<CleGrille, Applicabilite> {
  // Le thème appartient à la mesure, identique pour les deux états d'un item O : il se juge
  // une fois, sur l'état en vigueur — donc le postérieur. Le poser deux fois ferait répondre
  // deux fois la même chose, sur trente heures d'annotation.
  const base = applicabiliteP(contexte);
  return { ...base, theme_correct: contexte.etat === "posterieur" ? "applicable" : "sans_objet" };
}

export function applicabiliteGrille(
  type: TypeItem,
  contexte: ContexteApplicabilite,
): Record<CleGrille, Applicabilite> {
  if (type === "P") return applicabiliteP(contexte);
  if (type === "A") return applicabiliteA();
  if (type === "F") return applicabiliteF();
  return applicabiliteO(contexte);
}

/**
 * Réduction des deux grilles d'un item O vers les cinq clés d'`item.schema.json`.
 * `false` si l'un des deux états est faux, `null` si les deux sont sans objet, `true` sinon.
 * Déterministe, et jamais stockée dans le journal : la stocker à côté des deux grilles
 * dont elle dérive, ce serait écrire deux fois une valeur qui peut diverger.
 */
export function reduireEtats(anterieur: Grille, posterieur: Grille): Grille {
  const reduite: Partial<Record<CleGrille, boolean | null>> = {};
  for (const cle of CLES_GRILLE) {
    reduite[cle] = reduireReponse(anterieur[cle], posterieur[cle]);
  }
  return reduite as Grille;
}

function reduireReponse(a: boolean | null, b: boolean | null): boolean | null {
  if (a === false || b === false) return false;
  if (a === null && b === null) return null;
  return true;
}

/* ------------------------------------------------------- contrôles de saisie */

export interface ManquementGrille {
  readonly cle: string;
  readonly probleme: "sans_reponse" | "repondue_alors_que_sans_objet";
}

/**
 * Une grille est complète quand toute question applicable porte un booléen et toute question
 * sans objet porte `null`. Le second contrôle n'est pas du zèle : une réponse à une question
 * sans objet signale que l'interface a affiché autre chose que ce que le modèle prévoit.
 */
export function controlerGrille(
  grille: Grille,
  applicabilite: Record<CleGrille, Applicabilite>,
): readonly ManquementGrille[] {
  const manquements: ManquementGrille[] = [];
  for (const cle of CLES_GRILLE) {
    const attendue = applicabilite[cle] === "applicable";
    const valeur = grille[cle];
    if (attendue && typeof valeur !== "boolean") {
      manquements.push({ cle, probleme: "sans_reponse" });
    }
    if (!attendue && valeur !== null) {
      manquements.push({ cle, probleme: "repondue_alors_que_sans_objet" });
    }
  }
  return manquements;
}

export function controlerSpecifiques(
  type: TypeItem,
  reponses: QuestionsSpecifiques,
): readonly ManquementGrille[] {
  const attendues = questionsSpecifiques(type);
  const manquements: ManquementGrille[] = [];
  for (const cle of attendues) {
    if (typeof reponses[cle] !== "boolean") {
      manquements.push({ cle, probleme: "sans_reponse" });
    }
  }
  for (const cle of Object.keys(reponses)) {
    if (!attendues.includes(cle as CleSpecifique)) {
      manquements.push({ cle, probleme: "repondue_alors_que_sans_objet" });
    }
  }
  return manquements;
}
