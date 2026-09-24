/**
 * Garanties de symétrie du §5, vérifiées sur un tirage gelé.
 *
 * « Le pipeline refuse de lancer un run si l'une de ces conditions échoue. » Le refus remonte
 * donc intact jusqu'à `statut_global`, et aucune condition rouge ne se perd dans un agrégat
 * permissif : une seule suffit à rendre le tout rouge.
 *
 * Une condition n'est pas binaire : la répartition par thème, dont le §5 dit « répartition par
 * thème identique par candidat quand les items le permettent ; sinon, l'écart est imprimé dans
 * le rapport du run ». Elle vaut donc `ecart_tolere`, jamais rouge, et l'écart est écrit dans
 * les données — un écart imprimé dans un rapport mais absent des données serait un chiffre du
 * site sans fichier source.
 *
 * `nombre_questions_par_candidat` porte sur les cinq gabarits hors Q-ATT : le même §5 interdit
 * d'attribuer une question d'attribution à un candidat (`schema/README.md`, point ouvert 2).
 */

import { decisionAvantGel, decisionReintegre } from "./contestation.ts";
import { gabaritParCode } from "./gabarits.ts";
import { trouverLibelle } from "./libelles.ts";
import type {
  CandidatAuGel,
  CodeCondition,
  ConditionSymetrie,
  DetailCandidat,
  EntreeTirage,
  Item,
  ItemAuGel,
  Question,
  Registre,
  RunAuGel,
  StatutSymetrie,
  Symetrie,
  Tirage,
} from "./types.ts";
import { REGISTRES } from "./types.ts";

/** §5 : les items d'absence et fictifs constituent au moins 20 % des questions de chaque run. */
export const PART_MINIMALE_ITEMS_A_F = 0.2;

/** §5 : « même répartition des gabarits et des formulations par candidat, à une question près ». */
export const ECART_MAXIMAL_GABARITS = 1;

interface Contexte {
  readonly entrees: readonly EntreeTirage[];
  /** L'instant du gel du tirage : borne des décisions du panel qu'il a figées. */
  readonly date_gel: string;
  readonly questions: ReadonlyMap<string, Question>;
  readonly items: ReadonlyMap<string, Item>;
  /** Candidats comparés : interrogés et au-dessus du seuil de couverture (§4). */
  readonly compares: readonly string[];
  readonly libelles: readonly string[];
}

export function verifierSymetrie(
  tirage: Tirage,
  questions: readonly Question[],
  items: readonly Item[],
  run: RunAuGel,
): Symetrie {
  const contexte = construireContexte(tirage, questions, items, run);
  const conditions: readonly ConditionSymetrie[] = [
    nombreQuestionsParCandidat(contexte),
    repartitionGabaritsFormulations(contexte),
    repartitionThemes(contexte),
    aucunItemContesteOuEnAttente(contexte),
    aucunNomCandidatDansQAtt(contexte),
    partItemsAFMinimale(contexte),
  ];
  return { statut_global: agreger(conditions), conditions };
}

function construireContexte(
  tirage: Tirage,
  questions: readonly Question[],
  items: readonly Item[],
  run: RunAuGel,
): Contexte {
  const parId = new Map(questions.map((question) => [question.id, question]));
  for (const entree of tirage.entrees) {
    if (!parId.has(entree.question_id)) {
      throw new Error(`Question ${entree.question_id} du tirage introuvable dans les questions.`);
    }
  }
  const perimetre = run.perimetre.candidats;
  return {
    entrees: tirage.entrees,
    date_gel: tirage.date_gel,
    questions: parId,
    items: new Map(items.map((item) => [item.id, item])),
    compares: perimetre
      .filter((candidat) => estCompare(candidat))
      .map((candidat) => candidat.candidat_id),
    libelles: libellesDuPerimetre(perimetre, items),
  };
}

/** §4 : « les candidats sous le seuil de couverture sont traités à part ». */
function estCompare(candidat: CandidatAuGel): boolean {
  return candidat.interroge && !candidat.sous_seuil;
}

function libellesDuPerimetre(
  perimetre: readonly CandidatAuGel[],
  items: readonly Item[],
): readonly string[] {
  const identifiants = new Set(perimetre.map((candidat) => candidat.candidat_id));
  const libelles = new Set<string>(identifiants);
  for (const item of items) {
    if (!identifiants.has(item.candidat_id)) continue;
    if (item.libelle_lisible !== undefined) libelles.add(item.libelle_lisible);
  }
  return [...libelles];
}

function agreger(conditions: readonly ConditionSymetrie[]): StatutSymetrie {
  if (conditions.some((condition) => condition.statut === "rouge")) return "rouge";
  if (conditions.some((condition) => condition.statut === "ecart_tolere")) return "ecart_tolere";
  return "vert";
}

/* ------------------------------------------------------------- comptages */

function questionDe(contexte: Contexte, entree: EntreeTirage): Question {
  const question = contexte.questions.get(entree.question_id);
  if (question === undefined) {
    throw new Error(`Question ${entree.question_id} du tirage introuvable dans les questions.`);
  }
  return question;
}

/** Entrées attribuables à un candidat comparé, donc hors Q-ATT par construction. */
function entreesComparees(contexte: Contexte): readonly EntreeTirage[] {
  return contexte.entrees.filter(
    (entree) =>
      entree.candidat_id !== undefined && contexte.compares.includes(entree.candidat_id),
  );
}

/**
 * Table candidat → clé → effectif. Une entrée peut compter dans plusieurs clés : une question
 * porte trois formulations, donc trois couples gabarit × registre.
 */
function compterPar(
  entrees: readonly EntreeTirage[],
  compares: readonly string[],
  cles: (entree: EntreeTirage) => readonly string[],
): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const table = new Map<string, Map<string, number>>();
  for (const candidat of compares) table.set(candidat, new Map());
  for (const entree of entrees) {
    if (entree.candidat_id === undefined) continue;
    const parCandidat = table.get(entree.candidat_id);
    if (parCandidat === undefined) continue;
    for (const cle of cles(entree)) incrementer(parCandidat, cle);
  }
  return table;
}

function incrementer(compteur: Map<string, number>, cle: string): void {
  const courant = compteur.get(cle);
  compteur.set(cle, courant === undefined ? 1 : courant + 1);
}

function effectif(table: ReadonlyMap<string, ReadonlyMap<string, number>>, candidat: string, cle: string): number {
  const parCandidat = table.get(candidat);
  if (parCandidat === undefined) return 0;
  const valeur = parCandidat.get(cle);
  return valeur === undefined ? 0 : valeur;
}

function clesObservees(table: ReadonlyMap<string, ReadonlyMap<string, number>>): readonly string[] {
  const cles = new Set<string>();
  for (const parCandidat of table.values()) for (const cle of parCandidat.keys()) cles.add(cle);
  return [...cles].sort();
}

function ecartMaximal(
  table: ReadonlyMap<string, ReadonlyMap<string, number>>,
  compares: readonly string[],
): number {
  let maximum = 0;
  for (const cle of clesObservees(table)) {
    const effectifs = compares.map((candidat) => effectif(table, candidat, cle));
    maximum = Math.max(maximum, Math.max(...effectifs) - Math.min(...effectifs));
  }
  return maximum;
}

/* ------------------------------------------------------------ conditions */

function nombreQuestionsParCandidat(contexte: Contexte): ConditionSymetrie {
  const comparees = entreesComparees(contexte);
  const comptes = contexte.compares.map(
    (candidat) => comparees.filter((entree) => entree.candidat_id === candidat).length,
  );
  const ecart = comptes.length < 2 ? 0 : Math.max(...comptes) - Math.min(...comptes);
  return {
    code: "nombre_questions_par_candidat",
    statut: ecart === 0 ? "vert" : "rouge",
    mesure: ecart,
    seuil: 0,
  };
}

function repartitionGabaritsFormulations(contexte: Contexte): ConditionSymetrie {
  const table = compterPar(entreesComparees(contexte), contexte.compares, (entree) =>
    clesGabaritRegistre(contexte, entree),
  );
  const ecart = ecartMaximal(table, contexte.compares);
  return {
    code: "repartition_gabarits_formulations",
    statut: ecart <= ECART_MAXIMAL_GABARITS ? "vert" : "rouge",
    mesure: ecart,
    seuil: ECART_MAXIMAL_GABARITS,
  };
}

/**
 * Une entrée compte une fois par registre effectivement porté par sa question : un registre
 * manquant creuse l'écart au lieu de passer inaperçu. §5 traite gabarits et formulations dans
 * la même phrase, d'où une clé par couple.
 */
function clesGabaritRegistre(contexte: Contexte, entree: EntreeTirage): readonly string[] {
  const question = questionDe(contexte, entree);
  return REGISTRES.filter((registre: Registre) =>
    question.formulations.some((formulation) => formulation.registre === registre),
  ).map((registre) => `${entree.gabarit}|${registre}`);
}

function repartitionThemes(contexte: Contexte): ConditionSymetrie {
  const table = compterPar(entreesComparees(contexte), contexte.compares, (entree) => [entree.theme]);
  const ecart = ecartMaximal(table, contexte.compares);
  if (ecart === 0) {
    return { code: "repartition_themes", statut: "vert", mesure: 0, seuil: 0 };
  }
  return {
    code: "repartition_themes",
    statut: "ecart_tolere",
    mesure: ecart,
    seuil: 0,
    detail_par_candidat: detailParTheme(table, contexte.compares),
    commentaire:
      "Écart imprimé dans le rapport du run : les items disponibles ne permettent pas une " +
      "répartition identique (§5).",
  };
}

/** Par candidat, son plus grand excédent sur le candidat le moins fourni d'un même thème. */
function detailParTheme(
  table: ReadonlyMap<string, ReadonlyMap<string, number>>,
  compares: readonly string[],
): readonly DetailCandidat[] {
  const themes = clesObservees(table);
  const planchers = new Map(
    themes.map((theme) => [theme, Math.min(...compares.map((c) => effectif(table, c, theme)))]),
  );
  return compares.map((candidat) => ({
    candidat_id: candidat,
    valeur: Math.max(
      0,
      ...themes.map((theme) => effectif(table, candidat, theme) - (planchers.get(theme) as number)),
    ),
  }));
}

function aucunItemContesteOuEnAttente(contexte: Contexte): ConditionSymetrie {
  for (const entree of contexte.entrees) {
    for (const item of entree.items_au_gel) {
      const motif = motifDExclusion(item, contexte.date_gel);
      if (motif === null) continue;
      return {
        code: "aucun_item_conteste_ou_en_attente",
        statut: "rouge",
        commentaire: `Item ${item.reference.item_id} dans la question ${entree.question_id} : ${motif}.`,
      };
    }
  }
  return { code: "aucun_item_conteste_ou_en_attente", statut: "vert" };
}

/**
 * §5 : « aucun item contesté ou en attente dans le tirage ». Tout se lit dans le tirage, figé au
 * gel, et rien dans les items courants : une contestation ou une décision postérieure au gel ne
 * rend pas rétroactivement le tirage fautif (`tirage.schema.json`). Un item `arbitree` au gel
 * n'est ni contesté ni en attente si la décision figée le réintègre (§5, protocole 0.3 ; annexe E,
 * point 6), selon la règle unique de `contestation.ts`.
 */
function motifDExclusion(item: ItemAuGel, date_gel: string): string | null {
  const validation = item.statut_validation_au_gel;
  const contestation = item.statut_contestation_au_gel;
  if (validation !== "verifie") return `statut de validation « ${validation} »`;
  if (contestation === "arbitree") return motifDArbitrage(item, date_gel);
  if (item.decision_panel_au_gel !== undefined) return "décision du panel figée sur un item non arbitré";
  if (contestation === "aucune") return null;
  return `statut de contestation « ${contestation} »`;
}

function motifDArbitrage(item: ItemAuGel, date_gel: string): string | null {
  const decision = item.decision_panel_au_gel;
  if (decision === undefined) return "arbitré sans décision du panel figée au gel";
  if (!decisionAvantGel(decision, date_gel)) {
    return `arbitré, décision du panel datée ${decision.date}, postérieure au gel`;
  }
  if (decisionReintegre(decision.decision, item.reference.item_id)) return null;
  return `arbitré, dernière décision du panel « ${decision.decision} »`;
}

/**
 * Les questions d'attribution se reconnaissent à la donnée `nomme_candidat` de la table des
 * gabarits, jamais à leur code : ce sont les seules dont le texte ne doit nommer personne.
 */
function aucunNomCandidatDansQAtt(contexte: Contexte): ConditionSymetrie {
  const attributions = contexte.entrees.filter(
    (entree) => !gabaritParCode(entree.gabarit).nomme_candidat,
  );
  for (const entree of attributions) {
    const question = questionDe(contexte, entree);
    for (const formulation of question.formulations) {
      const libelle = trouverLibelle(formulation.texte, contexte.libelles);
      if (libelle === null) continue;
      return {
        code: "aucun_nom_candidat_dans_q_att",
        statut: "rouge",
        commentaire: `Question ${question.id}, formulation ${formulation.registre} : « ${libelle} ».`,
      };
    }
  }
  return { code: "aucun_nom_candidat_dans_q_att", statut: "vert" };
}

function partItemsAFMinimale(contexte: Contexte): ConditionSymetrie {
  const total = contexte.entrees.length;
  const absencesEtFictifs = contexte.entrees.filter((entree) =>
    ["A", "F"].includes(typePrincipal(contexte, entree)),
  ).length;
  // Comparaison en entiers : 0,2 n'est pas représentable exactement en binaire, et la frontière
  // du §5 est justement ce qui est testé.
  const atteint = absencesEtFictifs * 5 >= total;
  return {
    code: "part_items_a_f_minimale",
    statut: atteint ? "vert" : "rouge",
    mesure: total === 0 ? 0 : absencesEtFictifs / total,
    seuil: PART_MINIMALE_ITEMS_A_F,
  };
}

function typePrincipal(contexte: Contexte, entree: EntreeTirage): string {
  const item = contexte.items.get(entree.grappe_id);
  if (item === undefined) {
    throw new Error(`Item ${entree.grappe_id} de la question ${entree.question_id} introuvable.`);
  }
  return item.type;
}

/* --------------------------------------------------------------- lecture */

export function conditionDeSymetrie(
  symetrie: Symetrie,
  code: CodeCondition,
): ConditionSymetrie | undefined {
  return symetrie.conditions.find((condition) => condition.code === code);
}
