/**
 * Le filtre du §8, et l'assemblage des unités d'analyse.
 *
 * `contexte == "run"` est « la seule barrière » entre les réponses permutées du test
 * contrefactuel (§7) et un chiffre publié (schema/README.md). Elle vit ici, une fois.
 *
 * Aucune métrique ne lit un verdict ou une réponse : elles lisent des `UniteAnalyse`, et le seul
 * constructeur d'`UniteAnalyse` est `assembler`, qui applique le filtre. La barrière est donc
 * portée par le type, pas par la discipline de l'appelant.
 *
 * Tout ce qui ne peut pas être résolu lève : réponse introuvable, question introuvable, verdict
 * du run portant sur une réponse hors run, note portée sur une réponse manquante. Une donnée
 * absente reste absente et visible — jamais un enregistrement ignoré en silence.
 */

import type {
  Canal,
  CategorieRetenue,
  ContexteMesure,
  Drapeau,
  EntreeTirage,
  Formulation,
  Gabarit,
  IdentifiantCourt,
  Item,
  ItemDeQuestion,
  Mode,
  Question,
  Registre,
  Reponse,
  Run,
  SourcageRetenu,
  Theme,
  TypeItem,
  Ulid,
  Verdict,
} from "./types.ts";

/**
 * Une réponse du run, notée, avec tout ce dont les métriques du §8 ont besoin — et rien d'autre.
 * Les champs à `null` disent une absence réelle : un thème non tiré, une Q-ATT sans candidat
 * (§5), une réponse du canal application qui n'a pas de mode (§6).
 */
export interface UniteAnalyse {
  readonly verdict_id: Ulid;
  readonly reponse_id: Ulid;
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode | null;
  readonly canal: Canal;
  readonly question_id: string;
  /** §8 : la grappe du bootstrap, « la grappe étant l'item ». Lue, jamais recalculée. */
  readonly grappe_id: Ulid;
  readonly item_principal_id: Ulid;
  readonly type_item_principal: TypeItem;
  readonly gabarit: Gabarit;
  readonly candidat_id: IdentifiantCourt | null;
  readonly theme: Theme | null;
  readonly registre: Registre;
  readonly premisse_fausse: boolean | null;
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  readonly obsolescence_fraiche: boolean | null;
  readonly sourcage: SourcageRetenu;
  readonly dans_echantillon_humain: boolean;
  readonly tronquee: boolean;
}

export interface EntreesAnalyse {
  readonly run: Run;
  readonly entrees_tirage: readonly EntreeTirage[];
  readonly questions: readonly Question[];
  readonly items: readonly Item[];
  readonly reponses: readonly Reponse[];
  readonly verdicts: readonly Verdict[];
  /**
   * §6 et schema/README.md, point ouvert 4 : l'entrée des réponses tronquées dans les métriques
   * primaires n'est pas tranchée par le protocole. Aucun défaut n'est donc proposé ici :
   * l'appelant dit ce qu'il fait, et le dit dans le fichier de run.
   */
  readonly inclure_tronquees: boolean;
}

export function estDuRun(objet: { readonly contexte: ContexteMesure }): boolean {
  return objet.contexte === "run";
}

export function filtrerContexteRun<T extends { readonly contexte: ContexteMesure }>(
  objets: readonly T[],
): T[] {
  return objets.filter(estDuRun);
}

interface IndexEntrees {
  readonly reponses: ReadonlyMap<string, Reponse>;
  readonly questions: ReadonlyMap<string, Question>;
  readonly tirage: ReadonlyMap<string, EntreeTirage>;
  readonly items: ReadonlyMap<string, Item>;
}

export function assembler(entrees: EntreesAnalyse): UniteAnalyse[] {
  const index = indexer(entrees);
  const unites: UniteAnalyse[] = [];
  for (const verdict of filtrerContexteRun(entrees.verdicts)) {
    if (verdict.objet_note.type !== "reponse") continue;
    const unite = uniteDepuis(verdict, index, entrees.inclure_tronquees);
    if (unite !== null) unites.push(unite);
  }
  return unites;
}

function indexer(entrees: EntreesAnalyse): IndexEntrees {
  return {
    reponses: new Map(entrees.reponses.map((r) => [r.id, r])),
    questions: new Map(entrees.questions.map((q) => [q.id, q])),
    tirage: new Map(entrees.entrees_tirage.map((e) => [e.question_id, e])),
    items: new Map(entrees.items.map((i) => [i.id, i])),
  };
}

function uniteDepuis(
  verdict: Verdict,
  index: IndexEntrees,
  inclureTronquees: boolean,
): UniteAnalyse | null {
  const reponse = reponseNotee(verdict, index);
  const tronquee = projection(reponse).troncature;
  if (tronquee && !inclureTronquees) return null;
  return composer(verdict, reponse, contexteQuestion(reponse, index), tronquee);
}

/** La réponse que ce verdict note, ou une erreur disant laquelle des trois règles est violée. */
function reponseNotee(verdict: Verdict, index: IndexEntrees): Reponse {
  const reponse = exiger(index.reponses, verdict.objet_note.id, "réponse notée");
  if (!estDuRun(reponse)) {
    throw new Error(
      `Verdict ${verdict.id} du run portant sur une réponse de contexte ${reponse.contexte} : incohérence.`,
    );
  }
  if (reponse.statut_reponse !== "obtenue") {
    throw new Error(`Verdict ${verdict.id} portant sur une réponse manquante ${reponse.id} (§6).`);
  }
  return reponse;
}

function projection(reponse: Reponse): { readonly troncature: boolean } {
  if (reponse.normalise === undefined) {
    throw new Error(`Réponse obtenue ${reponse.id} sans projection normalisée.`);
  }
  return reponse.normalise;
}

interface ContexteQuestion {
  readonly question: Question;
  readonly entree: EntreeTirage;
  readonly formulation: Formulation;
  readonly item: Item;
}

function contexteQuestion(reponse: Reponse, index: IndexEntrees): ContexteQuestion {
  const question = exiger(index.questions, reponse.question_id, "question");
  const entree = exiger(index.tirage, reponse.question_id, "entrée de tirage de la question");
  verifierCoherenceTirage(question, entree);
  const formulation = question.formulations.find((f) => f.id === reponse.formulation_id);
  if (formulation === undefined) {
    throw new Error(`Formulation ${reponse.formulation_id} absente de la question ${question.id}.`);
  }
  return { question, entree, formulation, item: itemPrincipal(question, index) };
}

function itemPrincipal(question: Question, index: IndexEntrees): Item {
  const principal = question.items.find((i: ItemDeQuestion) => i.role === "principal");
  if (principal === undefined) {
    throw new Error(`Question ${question.id} sans item principal.`);
  }
  return exiger(index.items, principal.reference.item_id, "item principal");
}

function verifierCoherenceTirage(question: Question, entree: EntreeTirage): void {
  if (question.gabarit !== entree.gabarit) {
    throw new Error(`Gabarit divergent pour ${question.id} : ${question.gabarit} / ${entree.gabarit}.`);
  }
  if (question.candidat_id !== entree.candidat_id) {
    throw new Error(`Candidat divergent pour la question ${question.id} entre question et tirage.`);
  }
}

function composer(
  verdict: Verdict,
  reponse: Reponse,
  contexte: ContexteQuestion,
  tronquee: boolean,
): UniteAnalyse {
  const { question, entree, formulation, item } = contexte;
  return {
    verdict_id: verdict.id,
    reponse_id: reponse.id,
    outil_id: reponse.outil_id,
    mode: reponse.mode === undefined ? null : reponse.mode,
    canal: reponse.canal,
    question_id: question.id,
    grappe_id: question.grappe_id,
    item_principal_id: item.id,
    type_item_principal: item.type,
    gabarit: question.gabarit,
    candidat_id: question.candidat_id === undefined ? null : question.candidat_id,
    theme: entree.theme === undefined ? null : entree.theme,
    registre: formulation.registre,
    premisse_fausse: formulation.premisse_fausse === undefined ? null : formulation.premisse_fausse,
    categorie: verdict.categorie_retenue,
    drapeaux: verdict.drapeaux_retenus,
    obsolescence_fraiche: verdict.obsolescence_fraiche === undefined ? null : verdict.obsolescence_fraiche,
    sourcage: verdict.sourcage_retenu,
    dans_echantillon_humain: verdict.dans_echantillon_humain,
    tronquee,
  };
}

function exiger<T>(index: ReadonlyMap<string, T>, cle: string, quoi: string): T {
  const valeur = index.get(cle);
  if (valeur === undefined) throw new Error(`${quoi} introuvable : ${cle}`);
  return valeur;
}
