/**
 * Tirage des questions d'un run.
 *
 * §5 : « les questions sont tirées de façon aléatoire stratifiée (candidat × thème × gabarit)
 * avec une graine publiée, ce qui rend le tirage reproductible. 80 % des questions sont reprises
 * du run précédent, 20 % sont neuves. »
 *
 * Ce que le module fixe, tout visible dans le tirage publié :
 *
 * - **La graine.** Le générateur est celui du dépôt (`validation/domaine/alea.ts`, SplitMix64
 *   amorcé par sha256 d'une chaîne). La chaîne d'amorce est construite à partir des seuls champs
 *   publiés de `graine_tirage` et du `run_id` : un tiers qui a le fichier de tirage a tout ce
 *   qu'il faut pour rejouer, ce qu'exige le §9.
 * - **Ce qui entre au tirage** (§5, protocole 0.9). Une question dont un item n'est pas vérifié,
 *   est contesté ou en attente n'est pas tirable. Une question dont la réponse attendue n'est pas
 *   définie au gel — item hors de sa fenêtre de validité, position « sans objet » sur un gabarit
 *   fermé, négatif ou orienté, liste d'attribution non définie — est exclue et inscrite dans
 *   `tirage.exclusions` avec son motif. Les deux règles sont évaluées avant tout usage de la
 *   graine : aucune graine ne fait échouer ni réussir le tirage pour ces motifs.
 * - **La reprise** (§5, protocole 0.9). Une question est reprise si elle a le même identifiant et
 *   les mêmes empreintes de texte qu'au run précédent (`signature.ts`, seule définition, partagée
 *   avec la tendance du §8). Par candidat, et pour les questions d'attribution sur l'ensemble des
 *   thèmes, le budget est `⌊0,8 × questions tirées⌋`, compensations comprises. Il se consomme
 *   strate par strate, dans l'ordre mélangé par la graine ; une strate sans assez de questions
 *   neuves est complétée par des reprises hors budget, et le dépassement est inscrit dans
 *   `tirage.bilan_reprise`.
 * - **La compensation** (§5, protocole 0.9). Pour chaque strate thème × gabarit, la cible d'un
 *   candidat comparé (interrogé, au-dessus du seuil) est `min(quota, max des questions disponibles
 *   parmi les candidats comparés)`. Son déficit est comblé par des questions du MÊME gabarit prises
 *   dans ses autres thèmes, parmi celles que les strates n'ont pas tirées, choisies par la graine
 *   (voir `compenser`). Si le déficit ne peut pas être comblé, rien n'est forcé : le total du
 *   candidat diffère, et `symetrie.ts:nombreQuestionsParCandidat` refuse le run. Chaque
 *   compensation est inscrite dans `tirage.compensations`. Un candidat sous le seuil ou non
 *   interrogé n'est ni cible ni source de cette égalisation.
 *
 * Les deux quotas (par strate candidat × thème × gabarit, et d'attribution par thème) n'ont aucune
 * valeur dans le protocole : ce sont des paramètres obligatoires de l'appel, sans valeur par
 * défaut.
 */

import type { GenerateurAleatoire } from "../../validation/domaine/alea.ts";
import { generateur, graineDepuisTexte, melanger } from "../../validation/domaine/alea.ts";
import { itemEngendreDesQuestions, mesureDe, themeDe } from "./engendrement.ts";
import { decisionPanelAuGel } from "./contestation.ts";
import { ItemHorsValidite, ItemIntrouvable, reponseAttendue, ReponseNonDefinieAuGel } from "./reponse-attendue.ts";
import type { CandidatDuPerimetre } from "./reponse-attendue.ts";
import { signatureQuestion } from "./signature.ts";
import { estCompare } from "./symetrie.ts";
import type {
  BilanReprise,
  CandidatAuGel,
  CodeGabarit,
  CompensationTirage,
  EntreeTirage,
  ExclusionTirage,
  GraineTirage,
  Item,
  ItemAuGel,
  Mesure,
  MotifExclusion,
  Question,
  RunAuGel,
  Theme,
  Tirage,
} from "./types.ts";
import { estStatutValidation } from "./types.ts";

/** §5 : 80 % des questions sont reprises du run précédent, 20 % sont neuves. */
export const PART_REPRISE = 0.8;

export interface ParametresTirage {
  /** Nombre de questions tirées dans chaque strate candidat × thème × gabarit. */
  readonly questions_par_strate: number;
  /** §5 (protocole 0.9) : nombre de questions d'attribution tirées par thème. */
  readonly questions_attribution_par_theme: number;
}

/** Ce que le run précédent dit d'une question : sa signature (§5, 0.9) et son empreinte neutre. */
export interface QuestionPrecedente {
  readonly signature: string;
  /** Recopiée dans `empreinte_texte_precedente` d'une entrée reprise. */
  readonly empreinte_neutre: string;
}

/**
 * Ce qu'il faut savoir du run précédent pour décider d'une reprise : son identifiant, et chaque
 * question tirée alors, telle qu'elle était (signature des trois textes). Une question dont un
 * texte a changé depuis n'est pas reprise.
 */
export interface TiragePrecedent {
  readonly run_id: string;
  readonly questions: ReadonlyMap<string, QuestionPrecedente>;
}

export interface StrateVide {
  /** `null` pour les questions d'attribution, qui ne sont attribuables à aucun candidat. */
  readonly candidat_id: string | null;
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
}

export interface RapportTirage {
  readonly strates_vides: readonly StrateVide[];
  /** §4 : candidats sous 10 items P vérifiés, tirés mais hors des comparaisons inter-candidats. */
  readonly candidats_a_part: readonly string[];
  /** §3 : candidat retiré, conservé dans le jeu de données mais plus interrogé. */
  readonly candidats_non_interroges: readonly string[];
}

export interface ResultatTirage {
  readonly tirage: Tirage;
  readonly rapport: RapportTirage;
}

export interface DemandeTirage {
  readonly questions: readonly Question[];
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  readonly run: RunAuGel;
  readonly graine: GraineTirage;
  readonly parametres: ParametresTirage;
  readonly tirage_precedent?: TiragePrecedent;
}

export {
  ArbitrageSansDecision,
  contestationPermetLeTirage,
  DecisionPanelPosterieureAuGel,
  DecisionsPanelSimultanees,
} from "./contestation.ts";

/**
 * Ce que la tirabilité et la résolution lisent du run : l'instant du gel et le périmètre (qui est
 * interrogé). Les deux viennent du même objet, jamais de deux sources séparées.
 */
export type GelDuRun = Pick<RunAuGel, "date_gel"> & {
  readonly perimetre: { readonly candidats: readonly CandidatDuPerimetre[] };
};

/** Identifiant conventionnel du groupe des questions d'attribution, sans candidat. */
const GROUPE_ATTRIBUTION = "";

/* ------------------------------------------------------------- indexation */

interface Index {
  readonly items: ReadonlyMap<string, Item>;
  readonly mesures: ReadonlyMap<string, Mesure>;
}

function indexer(items: readonly Item[], mesures: readonly Mesure[]): Index {
  return {
    items: new Map(items.map((item) => [item.id, item])),
    mesures: new Map(mesures.map((mesure) => [mesure.id, mesure])),
  };
}

function itemDe(item_id: string, items: ReadonlyMap<string, Item>): Item {
  const item = items.get(item_id);
  if (item === undefined) throw new ItemIntrouvable(item_id);
  return item;
}

/**
 * Le thème d'une question est celui de la mesure de ses items définissants — le principal, ou les
 * `attendu_dans_liste` d'une question d'attribution sans principal (§5, protocole 0.9). Il est lu
 * sur les items, jamais sur `grappe_id`, dont le sens dépend du gabarit. Des items de mesures
 * différentes sont un refus : la strate serait indécidable.
 */
function themeDeQuestion(question: Question, index: Index): Theme {
  const definissants = question.items
    .filter((entree) => entree.role === "principal" || entree.role === "attendu_dans_liste")
    .map((entree) => itemDe(entree.reference.item_id, index.items));
  const mesures = [...new Set(definissants.map((item) => item.mesure_id))];
  const premier = definissants[0];
  if (premier === undefined || mesures.length !== 1) {
    throw new Error(
      `Question ${question.id} : ses items définissants portent ${mesures.length} mesures ; son thème est indécidable.`,
    );
  }
  return themeDe(mesureDe(index.mesures, premier));
}

/* ------------------------------------------------------------ tirabilité */

/**
 * §5 : aucun item contesté ou en attente dans le tirage — sur tous les items de la question, une
 * Q-ATT comprise. La règle par item est celle de l'engendrement (`itemEngendreDesQuestions`), écrite
 * une seule fois. Tous les items sont évalués avant de conclure (`map` puis `every`, jamais `every`
 * seul) : une référence absente ou un arbitrage illisible se signale toujours.
 */
function statutsAdmis(question: Question, items: ReadonlyMap<string, Item>): boolean {
  const verdicts = question.items.map((entree) => itemEngendreDesQuestions(itemDe(entree.reference.item_id, items)));
  return verdicts.every((tirable) => tirable);
}

/**
 * §5 (protocole 0.9) : la réponse attendue est-elle définie au gel ? La règle est celle de
 * `reponseAttendue`, appelée telle quelle : seuls ses deux refus « non défini au gel » deviennent un
 * motif d'exclusion. Tout autre refus (question mal formée, positions contradictoires, référence
 * absente) remonte et arrête le tirage.
 */
function motifDExclusion(
  question: Question,
  items: readonly Item[],
  run: GelDuRun,
): { readonly motif: MotifExclusion; readonly detail: string } | undefined {
  try {
    reponseAttendue(question, items, run.date_gel, run.perimetre.candidats);
    return undefined;
  } catch (erreur) {
    if (erreur instanceof ItemHorsValidite) return { motif: "hors_validite", detail: erreur.message };
    if (erreur instanceof ReponseNonDefinieAuGel) {
      return { motif: "reponse_attendue_indecidable", detail: erreur.message };
    }
    throw erreur;
  }
}

/**
 * Utilitaire public : les questions que la règle de tirabilité admet au gel du run, dans leur ordre.
 * C'est le filtre que `tirer` applique avant tout usage de la graine ; un tirage construit à la main
 * (`entreesPour`) ne contient que des questions qui le passent.
 */
export function questionsTirables(
  questions: readonly Question[],
  items: readonly Item[],
  run: GelDuRun,
): readonly Question[] {
  const parId = new Map(items.map((item) => [item.id, item]));
  return questions.filter(
    (question) => statutsAdmis(question, parId) && motifDExclusion(question, items, run) === undefined,
  );
}

interface Separation {
  readonly tirables: readonly Question[];
  readonly exclusions: readonly ExclusionTirage[];
}

/**
 * Les questions concernées par le run — attribution, ou candidat interrogé — dont les items sont
 * admis, séparées en tirables et exclues. Les exclusions sont triées par identifiant : l'ordre des
 * fichiers lus ne change pas le tirage publié.
 */
function separer(demande: DemandeTirage, index: Index, interroges: ReadonlySet<string>): Separation {
  const tirables: Question[] = [];
  const exclusions: ExclusionTirage[] = [];
  for (const question of demande.questions) {
    if (!concerneLeRun(question, interroges) || !statutsAdmis(question, index.items)) continue;
    const exclusion = motifDExclusion(question, demande.items, demande.run);
    if (exclusion === undefined) tirables.push(question);
    else exclusions.push(exclusionDe(question, index, exclusion));
  }
  return { tirables, exclusions: exclusions.sort((a, b) => comparer(a.question_id, b.question_id)) };
}

function concerneLeRun(question: Question, interroges: ReadonlySet<string>): boolean {
  return question.candidat_id === undefined || interroges.has(question.candidat_id);
}

function exclusionDe(
  question: Question,
  index: Index,
  exclusion: { readonly motif: MotifExclusion; readonly detail: string },
): ExclusionTirage {
  const socle = {
    question_id: question.id,
    theme: themeDeQuestion(question, index),
    gabarit: question.gabarit,
    motif: exclusion.motif,
    detail: exclusion.detail,
  };
  return question.candidat_id === undefined ? socle : { ...socle, candidat_id: question.candidat_id };
}

/* ------------------------------------------------------- entrées de tirage */

export function empreinteNeutre(question: Question): string {
  const neutre = question.formulations.find((formulation) => formulation.registre === "neutre");
  if (neutre === undefined) {
    throw new Error(`La question ${question.id} ne porte aucune formulation neutre.`);
  }
  return neutre.empreinte_texte;
}

/** La question telle que le run précédent l'a posée, si elle est reprise (§5, protocole 0.9). */
function precedenteSiReprise(question: Question, precedent: TiragePrecedent | undefined): QuestionPrecedente | undefined {
  const avant = precedent?.questions.get(question.id);
  if (avant === undefined || avant.signature !== signatureQuestion(question)) return undefined;
  return avant;
}

/**
 * Frontière de sortie : le statut écrit dans le tirage appartient à l'énumération du schéma. Pour
 * un item arbitré, la dernière décision du panel est figée avec sa date : la symétrie du tirage
 * publié se juge sur elle, et non sur l'état des items au moment où l'on revérifie.
 */
function itemAuGel(entree: Question["items"][number], index: Index, date_gel: string): ItemAuGel {
  const item = itemDe(entree.reference.item_id, index.items);
  if (!estStatutValidation(item.statut_validation)) {
    throw new Error(
      `Statut de validation « ${item.statut_validation} » de l'item ${item.id} hors de ` +
        `l'énumération du schéma.`,
    );
  }
  const socle = {
    reference: entree.reference,
    role: entree.role,
    statut_validation_au_gel: item.statut_validation,
    statut_contestation_au_gel: item.statut_contestation,
  };
  if (item.statut_contestation !== "arbitree") return socle;
  return { ...socle, decision_panel_au_gel: decisionPanelAuGel(item, date_gel) };
}

function entreeDe(
  question: Question,
  index: Index,
  run: GelDuRun,
  precedent: TiragePrecedent | undefined,
): EntreeTirage {
  const items = [...index.items.values()];
  const socle = {
    question_id: question.id,
    theme: themeDeQuestion(question, index),
    gabarit: question.gabarit,
    grappe_id: question.grappe_id,
    items_au_gel: question.items.map((entree) => itemAuGel(entree, index, run.date_gel)),
    reponse_attendue: reponseAttendue(question, items, run.date_gel, run.perimetre.candidats),
    ...(question.candidat_id === undefined ? {} : { candidat_id: question.candidat_id }),
  };

  const avant = precedenteSiReprise(question, precedent);
  if (precedent === undefined || avant === undefined) return { ...socle, reprise: false };
  return {
    ...socle,
    reprise: true,
    run_origine_id: precedent.run_id,
    empreinte_texte_precedente: avant.empreinte_neutre,
  };
}

/**
 * Utilitaire public : construit les entrées d'un ensemble de questions déjà choisi, au gel du run
 * (sa date et son périmètre : une seule source pour les deux).
 */
export function entreesPour(
  questions: readonly Question[],
  items: readonly Item[],
  mesures: readonly Mesure[],
  run: GelDuRun,
  precedent?: TiragePrecedent,
): readonly EntreeTirage[] {
  const index = indexer(items, mesures);
  return questions.map((question) => entreeDe(question, index, run, precedent));
}

/** Le run précédent, à partir des questions qu'il a tirées, telles qu'elles étaient alors. */
export function tiragePrecedentDe(run_id: string, questions: readonly Question[]): TiragePrecedent {
  return {
    run_id,
    questions: new Map(
      questions.map((question) => [
        question.id,
        { signature: signatureQuestion(question), empreinte_neutre: empreinteNeutre(question) },
      ]),
    ),
  };
}

/** Reconstruit l'entrée du run suivant à partir d'un tirage publié et de ses questions. */
export function tiragePrecedentDepuis(
  tirage: Tirage,
  questions: readonly Question[],
): TiragePrecedent {
  const parId = new Map(questions.map((question) => [question.id, question]));
  const tirees = tirage.entrees.map((entree) => {
    const question = parId.get(entree.question_id);
    if (question === undefined) {
      throw new Error(`Question ${entree.question_id} du tirage ${tirage.run_id} introuvable.`);
    }
    return question;
  });
  return tiragePrecedentDe(tirage.run_id, tirees);
}

/* ------------------------------------------------------------- strates */

interface Couple {
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
}

interface Strate extends Couple {
  readonly cle: string;
  readonly questions: readonly Question[];
}

function cleStrate(theme: Theme, gabarit: CodeGabarit): string {
  return `${theme}|${gabarit}`;
}

function comparer(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Univers des strates : tous les couples thème × gabarit observés dans le groupe, tous candidats
 * confondus. Une strate absente chez un candidat mais présente chez un autre est donc une strate
 * VIDE rapportée, et non une strate qui n'existe pas.
 */
function universDesStrates(questions: readonly Question[], index: Index): readonly Couple[] {
  const couples = new Map<string, Couple>();
  for (const question of questions) {
    const theme = themeDeQuestion(question, index);
    couples.set(cleStrate(theme, question.gabarit), { theme, gabarit: question.gabarit });
  }
  // Les clés sont triées avant tout tirage : l'ordre d'itération d'une Map suit l'ordre
  // d'insertion, donc l'ordre des fichiers lus, ce qui rendrait le tirage non reproductible.
  return [...couples.entries()].sort(([a], [b]) => comparer(a, b)).map(([, couple]) => couple);
}

function strates(univers: readonly Couple[], questions: readonly Question[], index: Index): readonly Strate[] {
  const parCle = new Map<string, Question[]>();
  for (const question of questions) {
    const cle = cleStrate(themeDeQuestion(question, index), question.gabarit);
    const groupe = parCle.get(cle);
    if (groupe === undefined) parCle.set(cle, [question]);
    else groupe.push(question);
  }
  return univers.map((couple) => {
    const cle = cleStrate(couple.theme, couple.gabarit);
    const trouvees = parCle.get(cle);
    return { cle, ...couple, questions: trouvees === undefined ? [] : [...trouvees].sort(parIdentifiant) };
  });
}

function parIdentifiant(a: Question, b: Question): number {
  return comparer(a.id, b.id);
}

/**
 * §5 (protocole 0.9) : « au regard de ce que les autres candidats comparés y reçoivent ». Par
 * strate, la cible d'un candidat comparé est `min(quota, max des questions disponibles parmi les
 * candidats comparés)`. Seuls les candidats comparés comptent : un candidat sous le seuil ou non
 * interrogé n'élève la cible de personne.
 */
function ciblesDesCompares(
  groupes: ReadonlyMap<string, readonly Question[]>,
  compares: readonly CandidatAuGel[],
  quota: number,
  index: Index,
): ReadonlyMap<string, number> {
  const cibles = new Map<string, number>();
  for (const candidat of compares) {
    for (const [cle, nombre] of disponiblesParStrate(questionsDuGroupe(groupes, candidat.candidat_id), index)) {
      const courante = cibles.get(cle);
      const cible = Math.min(quota, nombre);
      cibles.set(cle, courante === undefined ? cible : Math.max(courante, cible));
    }
  }
  return cibles;
}

function disponiblesParStrate(questions: readonly Question[], index: Index): ReadonlyMap<string, number> {
  const nombres = new Map<string, number>();
  for (const question of questions) {
    const cle = cleStrate(themeDeQuestion(question, index), question.gabarit);
    const courant = nombres.get(cle);
    nombres.set(cle, courant === undefined ? 1 : courant + 1);
  }
  return nombres;
}

/* --------------------------------------------------------- tirage d'un groupe */

interface DemandeGroupe {
  readonly identifiant: string;
  readonly questions: readonly Question[];
  readonly univers: readonly Couple[];
  readonly quota: number;
  /** Cibles par strate d'un candidat comparé ; `undefined` : aucune compensation. */
  readonly cibles: ReadonlyMap<string, number> | undefined;
  readonly eligible_a_la_reprise: boolean;
  readonly index: Index;
  readonly rng: GenerateurAleatoire;
  readonly precedent: TiragePrecedent | undefined;
}

interface ResultatGroupe {
  readonly choisies: readonly Question[];
  readonly strates_vides: readonly StrateVide[];
  readonly compensations: readonly CompensationTirage[];
  readonly cible: number;
  readonly budget_reprise: number;
}

/** Une strate du groupe, ce qu'elle tire d'elle-même et ce qui lui manque pour atteindre sa cible. */
interface Plan {
  readonly strate: Strate;
  readonly propre: number;
  readonly deficit: number;
}

function planifier(strate: Strate, demande: DemandeGroupe): Plan {
  const propre = Math.min(demande.quota, strate.questions.length);
  const cible = demande.cibles?.get(strate.cle);
  const deficit = cible === undefined ? 0 : Math.max(0, cible - propre);
  return { strate, propre, deficit };
}

/**
 * Par gabarit, ce que la compensation peut effectivement apporter : le déficit total du gabarit,
 * borné par les questions de ce gabarit que les strates laissent. Connu avant tout tirage, il fixe
 * la cible du groupe, donc le budget de reprise (§5 : le budget porte sur le total tiré).
 */
function compensable(plans: readonly Plan[]): number {
  const parGabarit = new Map<CodeGabarit, { deficit: number; surplus: number }>();
  for (const plan of plans) {
    const courant = parGabarit.get(plan.strate.gabarit);
    const surplus = plan.strate.questions.length - plan.propre;
    if (courant === undefined) parGabarit.set(plan.strate.gabarit, { deficit: plan.deficit, surplus });
    else parGabarit.set(plan.strate.gabarit, { deficit: courant.deficit + plan.deficit, surplus: courant.surplus + surplus });
  }
  return [...parGabarit.values()].reduce((total, { deficit, surplus }) => total + Math.min(deficit, surplus), 0);
}

function tirerGroupe(demande: DemandeGroupe): ResultatGroupe {
  const plans = strates(demande.univers, demande.questions, demande.index).map((strate) => planifier(strate, demande));
  const cible = plans.reduce((total, plan) => total + plan.propre, 0) + compensable(plans);
  // Arrondi par le bas, par groupe : voir l'en-tête du module.
  const budget = demande.eligible_a_la_reprise ? Math.floor(PART_REPRISE * cible) : 0;

  const vides: StrateVide[] = [];
  const choisies: Question[] = [];
  let restant = budget;
  for (const plan of melanger(plans, demande.rng)) {
    if (plan.strate.questions.length === 0) vides.push(strateVide(plan.strate, demande));
    const tirees = tirerParmi(plan.strate.questions, plan.propre, demande, restant);
    restant -= tirees.reprises_budgetees;
    choisies.push(...tirees.questions);
  }
  const compensation = compenser(plans, new Set(choisies), demande, restant);
  return {
    choisies: [...choisies, ...compensation.questions],
    strates_vides: vides,
    compensations: compensation.inscrites,
    cible,
    budget_reprise: budget,
  };
}

function strateVide(strate: Strate, demande: DemandeGroupe): StrateVide {
  const candidat_id = demande.identifiant === GROUPE_ATTRIBUTION ? null : demande.identifiant;
  return { candidat_id, theme: strate.theme, gabarit: strate.gabarit };
}

interface Compensation {
  readonly questions: readonly Question[];
  readonly inscrites: readonly CompensationTirage[];
}

/**
 * §5 (protocole 0.9) : le déficit d'une strate est comblé par des questions du même gabarit prises
 * dans les autres thèmes du candidat, parmi celles qu'aucune strate n'a tirées. Ordre déterministe,
 * documenté : les strates déficitaires sont servies dans l'ordre de leur clé `thème|gabarit`, après
 * le tirage de toutes les strates ; pour chacune, le réservoir restant de son gabarit (trié par
 * identifiant) est tiré par `tirerParmi`, avec le générateur du groupe et le budget de reprise
 * restant. Quand le réservoir ne suffit pas à tous les déficits d'un gabarit, les premières strates
 * dans cet ordre sont servies d'abord. Une strate déficitaire a déjà tiré toutes ses questions : le
 * réservoir ne contient que d'autres thèmes.
 */
function compenser(
  plans: readonly Plan[],
  dejaTirees: ReadonlySet<Question>,
  demande: DemandeGroupe,
  budget: number,
): Compensation {
  const questions: Question[] = [];
  const inscrites: CompensationTirage[] = [];
  let restant = budget;
  const deficitaires = plans.filter((plan) => plan.deficit > 0);
  const reservoirs = reservoirsParGabarit(plans, dejaTirees);
  for (const plan of deficitaires) {
    const reservoir = reservoirs.get(plan.strate.gabarit);
    if (reservoir === undefined) continue;
    const tirees = tirerParmi(reservoir, Math.min(plan.deficit, reservoir.length), demande, restant);
    restant -= tirees.reprises_budgetees;
    reservoirs.set(plan.strate.gabarit, reservoir.filter((question) => !tirees.questions.includes(question)));
    questions.push(...tirees.questions);
    inscrites.push(...tirees.questions.map((question) => inscrire(question, plan.strate, demande)));
  }
  return { questions, inscrites };
}

/** Par gabarit, les questions que les strates n'ont pas tirées, triées par identifiant. */
function reservoirsParGabarit(
  plans: readonly Plan[],
  dejaTirees: ReadonlySet<Question>,
): Map<CodeGabarit, readonly Question[]> {
  const reservoirs = new Map<CodeGabarit, Question[]>();
  for (const plan of plans) {
    const restantes = plan.strate.questions.filter((question) => !dejaTirees.has(question));
    const courant = reservoirs.get(plan.strate.gabarit);
    if (courant === undefined) reservoirs.set(plan.strate.gabarit, [...restantes]);
    else courant.push(...restantes);
  }
  for (const reservoir of reservoirs.values()) reservoir.sort(parIdentifiant);
  return reservoirs;
}

function inscrire(question: Question, deficitaire: Strate, demande: DemandeGroupe): CompensationTirage {
  return {
    candidat_id: demande.identifiant,
    gabarit: deficitaire.gabarit,
    theme_deficitaire: deficitaire.theme,
    question_id: question.id,
    theme_origine: themeDeQuestion(question, demande.index),
  };
}

interface TirageStrate {
  readonly questions: readonly Question[];
  /** Reprises imputées au budget du groupe. Le complément de secours n'y est pas compté. */
  readonly reprises_budgetees: number;
}

/**
 * Parmi des questions (une strate, ou le réservoir d'une compensation), les reprises passent
 * d'abord, tant que le budget du groupe n'est pas épuisé ; le complément vient des questions
 * neuves. Si les neuves ne suffisent pas, on complète par des reprises plutôt que de rendre la
 * strate incomplète : la symétrie du §5 compte les questions, pas leur fraîcheur. Ce complément est
 * le dépassement que `bilan_reprise` publie.
 */
function tirerParmi(
  questions: readonly Question[],
  aTirer: number,
  demande: DemandeGroupe,
  budget: number,
): TirageStrate {
  const estReprise = (question: Question): boolean => precedenteSiReprise(question, demande.precedent) !== undefined;

  const reprises = melanger(questions.filter(estReprise), demande.rng);
  const neuves = melanger(
    questions.filter((question) => !estReprise(question)),
    demande.rng,
  );

  const nombreReprises = Math.max(0, Math.min(aTirer, budget, reprises.length));
  const choisies = [...reprises.slice(0, nombreReprises)];
  choisies.push(...neuves.slice(0, aTirer - nombreReprises));
  const complement = reprises.slice(nombreReprises, nombreReprises + (aTirer - choisies.length));
  return { questions: [...choisies, ...complement], reprises_budgetees: nombreReprises };
}

/* ------------------------------------------------------------------ tirage */

/** Un quota est un entier ≥ 1, fourni par l'appelant : le protocole n'en fixe aucun. */
function verifierQuota(valeur: unknown, nom: keyof ParametresTirage, libelle: string): void {
  if (typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 1) return;
  throw new Error(
    `Quota ${libelle} (${nom}) invalide : ${String(valeur)}. ` +
      `Le protocole n'en fixe aucun ; il est fourni par l'appelant, jamais deviné.`,
  );
}

export function tirer(demande: DemandeTirage): ResultatTirage {
  verifierQuota(demande.parametres.questions_par_strate, "questions_par_strate", "par strate");
  verifierQuota(
    demande.parametres.questions_attribution_par_theme,
    "questions_attribution_par_theme",
    "d'attribution par thème",
  );

  const index = indexer(demande.items, demande.mesures);
  const interroges = demande.run.perimetre.candidats.filter((candidat) => candidat.interroge);
  const separation = separer(demande, index, new Set(interroges.map((candidat) => candidat.candidat_id)));
  const groupes = grouperParCandidat(separation.tirables, interroges);
  const contexte: ContexteTirage = {
    demande,
    index,
    groupes,
    univers: universDesStrates(questionsNommantUnCandidat(groupes), index),
    cibles: ciblesDesCompares(groupes, interroges.filter(estCompare), demande.parametres.questions_par_strate, index),
  };

  const resultats = [
    ...interroges.map((candidat) => tirerGroupeCandidat(contexte, candidat)),
    tirerGroupeAttribution(contexte),
  ];
  return {
    tirage: {
      run_id: demande.run.id,
      date_gel: demande.run.date_gel,
      graine_tirage: demande.graine,
      entrees: resultats.flatMap((resultat) => resultat.entrees),
      exclusions: separation.exclusions,
      bilan_reprise: resultats.map((resultat) => resultat.bilan),
      compensations: resultats.flatMap((resultat) => resultat.compensations),
    },
    rapport: {
      strates_vides: resultats.flatMap((resultat) => resultat.strates_vides),
      candidats_a_part: interroges.filter((c) => c.sous_seuil).map((c) => c.candidat_id),
      candidats_non_interroges: demande.run.perimetre.candidats
        .filter((candidat) => !candidat.interroge)
        .map((candidat) => candidat.candidat_id),
    },
  };
}

interface ContexteTirage {
  readonly demande: DemandeTirage;
  readonly index: Index;
  readonly groupes: ReadonlyMap<string, readonly Question[]>;
  /** Strates thème × gabarit observées chez les candidats interrogés. */
  readonly univers: readonly Couple[];
  /** Cibles des candidats comparés, par strate (`ciblesDesCompares`). */
  readonly cibles: ReadonlyMap<string, number>;
}

function grouperParCandidat(
  questions: readonly Question[],
  interroges: readonly CandidatAuGel[],
): ReadonlyMap<string, readonly Question[]> {
  const groupes = new Map<string, Question[]>();
  groupes.set(GROUPE_ATTRIBUTION, []);
  for (const candidat of interroges) groupes.set(candidat.candidat_id, []);

  for (const question of questions) {
    const cle = question.candidat_id === undefined ? GROUPE_ATTRIBUTION : question.candidat_id;
    const groupe = groupes.get(cle);
    if (groupe !== undefined) groupe.push(question);
  }
  return groupes;
}

function questionsDuGroupe(
  groupes: ReadonlyMap<string, readonly Question[]>,
  identifiant: string,
): readonly Question[] {
  const groupe = groupes.get(identifiant);
  return groupe === undefined ? [] : groupe;
}

function questionsNommantUnCandidat(groupes: ReadonlyMap<string, readonly Question[]>): readonly Question[] {
  return [...groupes.keys()]
    .filter((cle) => cle !== GROUPE_ATTRIBUTION)
    .flatMap((cle) => questionsDuGroupe(groupes, cle));
}

interface ResultatPublie {
  readonly entrees: readonly EntreeTirage[];
  readonly strates_vides: readonly StrateVide[];
  readonly compensations: readonly CompensationTirage[];
  readonly bilan: BilanReprise;
}

function tirerGroupeCandidat(contexte: ContexteTirage, candidat: CandidatAuGel): ResultatPublie {
  const { demande } = contexte;
  const resultat = tirerGroupe({
    identifiant: candidat.candidat_id,
    questions: questionsDuGroupe(contexte.groupes, candidat.candidat_id),
    univers: contexte.univers,
    quota: demande.parametres.questions_par_strate,
    cibles: estCompare(candidat) ? contexte.cibles : undefined,
    // §5 et schema/README.md : un candidat « nouveau » est hors du calcul du ratio 80/20.
    eligible_a_la_reprise: demande.tirage_precedent !== undefined && candidat.statut_au_gel !== "nouveau",
    index: contexte.index,
    rng: generateur(amorce(demande, candidat.candidat_id)),
    precedent: demande.tirage_precedent,
  });
  return publier(contexte, resultat, { candidat_id: candidat.candidat_id });
}

/**
 * Les questions d'attribution forment leur propre groupe : §5 interdit de les attribuer à un
 * candidat, elles ne peuvent donc pas entrer dans une strate candidat × thème × gabarit. Leur
 * strate est le thème seul, leur quota le leur (§5, protocole 0.9), et le budget de reprise porte
 * sur l'ensemble du groupe. Aucune compensation : aucun candidat n'y est comparé.
 */
function tirerGroupeAttribution(contexte: ContexteTirage): ResultatPublie {
  const { demande } = contexte;
  const attributions = questionsDuGroupe(contexte.groupes, GROUPE_ATTRIBUTION);
  const resultat = tirerGroupe({
    identifiant: GROUPE_ATTRIBUTION,
    questions: attributions,
    univers: universDesStrates(attributions, contexte.index),
    quota: demande.parametres.questions_attribution_par_theme,
    cibles: undefined,
    eligible_a_la_reprise: demande.tirage_precedent !== undefined,
    index: contexte.index,
    rng: generateur(amorce(demande, "attribution")),
    precedent: demande.tirage_precedent,
  });
  return publier(contexte, resultat, {});
}

function publier(
  contexte: ContexteTirage,
  resultat: ResultatGroupe,
  groupe: { readonly candidat_id?: string },
): ResultatPublie {
  const { demande } = contexte;
  const entrees = resultat.choisies.map((question) =>
    entreeDe(question, contexte.index, demande.run, demande.tirage_precedent),
  );
  const reprises = entrees.filter((entree) => entree.reprise).length;
  return {
    entrees,
    strates_vides: resultat.strates_vides,
    compensations: resultat.compensations,
    bilan: {
      ...groupe,
      cible: resultat.cible,
      budget_reprise: resultat.budget_reprise,
      reprises,
      depassement: Math.max(0, reprises - resultat.budget_reprise),
    },
  };
}

/**
 * Amorce textuelle du générateur, bâtie sur les seuls champs publiés : un tiers qui a le fichier
 * de tirage rejoue le tirage sans rien d'autre.
 */
function amorce(demande: DemandeTirage, groupe: string): bigint {
  return graineDepuisTexte(
    String(demande.graine.valeur),
    demande.graine.algorithme,
    demande.run.id,
    groupe,
  );
}
