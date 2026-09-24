/**
 * Tirage des questions d'un run.
 *
 * §5 : « les questions sont tirées de façon aléatoire stratifiée (candidat × thème × gabarit)
 * avec une graine publiée, ce qui rend le tirage reproductible. 80 % des questions sont reprises
 * du run précédent, 20 % sont neuves. »
 *
 * Trois choix, tous visibles dans les données produites :
 *
 * - **La graine.** Le générateur est celui du dépôt (`validation/domaine/alea.ts`, SplitMix64
 *   amorcé par sha256 d'une chaîne). La chaîne d'amorce est construite à partir des seuls champs
 *   publiés de `graine_tirage` et du `run_id` : un tiers qui a le fichier de tirage a tout ce
 *   qu'il faut pour rejouer, ce qu'exige le §9.
 * - **L'arrondi de la reprise.** `Math.floor(0,8 × cible)` par candidat. Arrondir au supérieur
 *   ferait dépasser la cible du §5 sur les petits effectifs ; arrondir « au plus proche » rendrait
 *   le nombre de questions neuves dépendant de la parité de la cible.
 * - **Les strates vides.** Une strate sans question est rapportée telle quelle, jamais comblée
 *   par une autre strate : combler ferait passer une lacune de couverture pour une symétrie.
 *
 * Le quota par strate n'a aucune valeur dans le protocole : il est un paramètre obligatoire de
 * l'appel, sans valeur par défaut.
 */

import type { GenerateurAleatoire } from "../../validation/domaine/alea.ts";
import { generateur, graineDepuisTexte, melanger } from "../../validation/domaine/alea.ts";
import { itemEngendreDesQuestions, mesureDe, themeDe } from "./engendrement.ts";
import { decisionPanelAuGel } from "./contestation.ts";
import { gabaritParCode } from "./gabarits.ts";
import { listeAttendueDefinie, reponseAttendue } from "./reponse-attendue.ts";
import type { CandidatDuPerimetre } from "./reponse-attendue.ts";
import { ItemIntrouvable } from "./reponse-attendue.ts";
import type {
  CandidatAuGel,
  CodeGabarit,
  EntreeTirage,
  GraineTirage,
  Item,
  ItemAuGel,
  Mesure,
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
}

/**
 * Ce qu'il faut savoir du run précédent pour décider d'une reprise : son identifiant, et
 * l'empreinte du texte de chaque question telle qu'elle était alors. L'empreinte vient des
 * questions du run précédent, pas de son tirage, qui ne la stocke pas — et « question commune
 * aux deux runs » (§8) exige même identifiant ET même empreinte.
 */
export interface TiragePrecedent {
  readonly run_id: string;
  readonly empreintes_texte: ReadonlyMap<string, string>;
}

export interface StrateVide {
  /** `null` pour les questions d'attribution, qui ne sont attribuables à aucun candidat. */
  readonly candidat_id: string | null;
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
}

export interface ResumeReprise {
  readonly candidat_id: string;
  readonly cible: number;
  readonly budget_reprise: number;
  readonly reprises: number;
}

export interface RapportTirage {
  readonly strates_vides: readonly StrateVide[];
  /** §4 : candidats sous 10 items P vérifiés, tirés mais hors des comparaisons inter-candidats. */
  readonly candidats_a_part: readonly string[];
  /** §3 : candidat retiré, conservé dans le jeu de données mais plus interrogé. */
  readonly candidats_non_interroges: readonly string[];
  readonly reprises_par_candidat: readonly ResumeReprise[];
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

function indexer(demande: DemandeTirage): Index {
  return {
    items: new Map(demande.items.map((item) => [item.id, item])),
    mesures: new Map(demande.mesures.map((mesure) => [mesure.id, mesure])),
  };
}

function itemPrincipalDe(question: Question, index: Index): Item {
  const item = index.items.get(question.grappe_id);
  if (item === undefined) throw new ItemIntrouvable(question.grappe_id);
  return item;
}

function themeDeQuestion(question: Question, index: Index): Theme {
  return themeDe(mesureDe(index.mesures, itemPrincipalDe(question, index)));
}

/**
 * Règle de tirabilité, évaluée sur toutes les questions AVANT que la graine ne serve : une question
 * écartée ici l'est quelle que soit la graine.
 *
 * - §5 : aucun item contesté ou en attente dans le tirage — sur tous les items de la question. La
 *   règle par item est celle de l'engendrement (`itemEngendreDesQuestions`), écrite une seule fois.
 *   Tous les items sont évalués avant de conclure (`map` puis `every`, jamais `every` seul) : une
 *   référence absente ou un arbitrage illisible se signale toujours, il ne se cache pas derrière un
 *   autre motif d'exclusion.
 * - §5 et annexe B (protocole 0.6) : une question qui ne nomme aucun candidat (donnée
 *   `nomme_candidat` de la table, jamais son code) n'est pas tirée si sa liste attendue n'est pas
 *   définie au gel, c'est-à-dire si un candidat y a une position en vigueur « conditionnel » ou
 *   « sans_objet » (`reponse-attendue.ts:listeAttendueDefinie`).
 */
function questionTirable(question: Question, items: ReadonlyMap<string, Item>, run: GelDuRun): boolean {
  const verdicts = question.items.map((entree) => {
    const item = items.get(entree.reference.item_id);
    if (item === undefined) throw new ItemIntrouvable(entree.reference.item_id);
    return itemEngendreDesQuestions(item);
  });
  if (!verdicts.every((tirable) => tirable)) return false;
  if (gabaritParCode(question.gabarit).nomme_candidat) return true;
  return listeAttendueDefinie(question, items, run.date_gel, run.perimetre.candidats);
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
  return questions.filter((question) => questionTirable(question, parId, run));
}

/* ------------------------------------------------------- entrées de tirage */

export function empreinteNeutre(question: Question): string {
  const neutre = question.formulations.find((formulation) => formulation.registre === "neutre");
  if (neutre === undefined) {
    throw new Error(`La question ${question.id} ne porte aucune formulation neutre.`);
  }
  return neutre.empreinte_texte;
}

/**
 * Frontière de sortie : le statut écrit dans le tirage appartient à l'énumération du schéma. Pour
 * un item arbitré, la dernière décision du panel est figée avec sa date : la symétrie du tirage
 * publié se juge sur elle, et non sur l'état des items au moment où l'on revérifie.
 */
function itemAuGel(entree: Question["items"][number], index: Index, date_gel: string): ItemAuGel {
  const item = index.items.get(entree.reference.item_id);
  if (item === undefined) throw new ItemIntrouvable(entree.reference.item_id);
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

  const empreinte = precedent?.empreintes_texte.get(question.id);
  if (precedent === undefined || empreinte === undefined) return { ...socle, reprise: false };
  return {
    ...socle,
    reprise: true,
    run_origine_id: precedent.run_id,
    empreinte_texte_precedente: empreinte,
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
  const index: Index = {
    items: new Map(items.map((item) => [item.id, item])),
    mesures: new Map(mesures.map((mesure) => [mesure.id, mesure])),
  };
  return questions.map((question) => entreeDe(question, index, run, precedent));
}

/** Reconstruit l'entrée du run suivant à partir d'un tirage publié et de ses questions. */
export function tiragePrecedentDepuis(
  tirage: Tirage,
  questions: readonly Question[],
): TiragePrecedent {
  const parId = new Map(questions.map((question) => [question.id, question]));
  const empreintes = new Map<string, string>();
  for (const entree of tirage.entrees) {
    const question = parId.get(entree.question_id);
    if (question === undefined) {
      throw new Error(`Question ${entree.question_id} du tirage ${tirage.run_id} introuvable.`);
    }
    empreintes.set(entree.question_id, empreinteNeutre(question));
  }
  return { run_id: tirage.run_id, empreintes_texte: empreintes };
}

/* ------------------------------------------------------------- strates */

interface Strate {
  readonly cle: string;
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
  readonly questions: readonly Question[];
}

function cleStrate(theme: Theme, gabarit: CodeGabarit): string {
  return `${theme}|${gabarit}`;
}

/**
 * Univers des strates : tous les couples thème × gabarit observés dans le groupe, tous candidats
 * confondus. Une strate absente chez un candidat mais présente chez un autre est donc une strate
 * VIDE rapportée, et non une strate qui n'existe pas.
 */
function universDesStrates(
  questions: readonly Question[],
  index: Index,
): readonly { theme: Theme; gabarit: CodeGabarit }[] {
  const couples = new Map<string, { theme: Theme; gabarit: CodeGabarit }>();
  for (const question of questions) {
    const theme = themeDeQuestion(question, index);
    couples.set(cleStrate(theme, question.gabarit), { theme, gabarit: question.gabarit });
  }
  // Les clés sont triées avant tout tirage : l'ordre d'itération d'une Map suit l'ordre
  // d'insertion, donc l'ordre des fichiers lus, ce qui rendrait le tirage non reproductible.
  return [...couples.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, couple]) => couple);
}

function strates(
  univers: readonly { theme: Theme; gabarit: CodeGabarit }[],
  questions: readonly Question[],
  index: Index,
): readonly Strate[] {
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
    return {
      cle,
      theme: couple.theme,
      gabarit: couple.gabarit,
      questions: trouvees === undefined ? [] : [...trouvees].sort(parIdentifiant),
    };
  });
}

function parIdentifiant(a: Question, b: Question): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* --------------------------------------------------------- tirage d'un groupe */

interface DemandeGroupe {
  readonly identifiant: string;
  readonly questions: readonly Question[];
  readonly univers: readonly { theme: Theme; gabarit: CodeGabarit }[];
  readonly quota: number;
  readonly eligible_a_la_reprise: boolean;
  readonly index: Index;
  readonly rng: GenerateurAleatoire;
  readonly precedent: TiragePrecedent | undefined;
}

interface ResultatGroupe {
  readonly choisies: readonly Question[];
  readonly strates_vides: readonly StrateVide[];
  readonly cible: number;
  readonly budget_reprise: number;
}

function tirerGroupe(demande: DemandeGroupe): ResultatGroupe {
  const decoupage = strates(demande.univers, demande.questions, demande.index);
  const cible = decoupage.reduce(
    (total, strate) => total + Math.min(demande.quota, strate.questions.length),
    0,
  );
  // Arrondi par le bas, par groupe : voir l'en-tête du module.
  const budget = demande.eligible_a_la_reprise ? Math.floor(PART_REPRISE * cible) : 0;

  const vides: StrateVide[] = [];
  const choisies: Question[] = [];
  let restant = budget;
  for (const strate of melanger(decoupage, demande.rng)) {
    if (strate.questions.length === 0) {
      vides.push({
        candidat_id: demande.identifiant === GROUPE_ATTRIBUTION ? null : demande.identifiant,
        theme: strate.theme,
        gabarit: strate.gabarit,
      });
      continue;
    }
    const tirees = tirerStrate(strate, demande, restant);
    restant -= tirees.reprises_budgetees;
    choisies.push(...tirees.questions);
  }
  return { choisies, strates_vides: vides, cible, budget_reprise: budget };
}

interface TirageStrate {
  readonly questions: readonly Question[];
  /** Reprises imputées au budget du groupe. Le complément de secours n'y est pas compté. */
  readonly reprises_budgetees: number;
}

/**
 * Dans une strate, les reprises passent d'abord, tant que le budget du groupe n'est pas épuisé ;
 * le complément vient des questions neuves. Si les neuves ne suffisent pas, on complète par des
 * reprises plutôt que de rendre une strate incomplète : la symétrie du §5 compte les questions,
 * pas leur fraîcheur.
 */
function tirerStrate(strate: Strate, demande: DemandeGroupe, budget: number): TirageStrate {
  const aTirer = Math.min(demande.quota, strate.questions.length);
  const estReprise = (question: Question): boolean =>
    demande.precedent !== undefined && demande.precedent.empreintes_texte.has(question.id);

  const reprises = melanger(strate.questions.filter(estReprise), demande.rng);
  const neuves = melanger(
    strate.questions.filter((question) => !estReprise(question)),
    demande.rng,
  );

  const nombreReprises = Math.max(0, Math.min(aTirer, budget, reprises.length));
  const choisies = [...reprises.slice(0, nombreReprises)];
  choisies.push(...neuves.slice(0, aTirer - nombreReprises));
  const complement = reprises.slice(nombreReprises, nombreReprises + (aTirer - choisies.length));
  return { questions: [...choisies, ...complement], reprises_budgetees: nombreReprises };
}

/* ------------------------------------------------------------------ tirage */

export function tirer(demande: DemandeTirage): ResultatTirage {
  if (!Number.isInteger(demande.parametres.questions_par_strate) || demande.parametres.questions_par_strate < 1) {
    throw new Error(
      `Quota par strate invalide : ${demande.parametres.questions_par_strate}. ` +
        `Le protocole n'en fixe aucun ; il est fourni par l'appelant, jamais deviné.`,
    );
  }

  const index = indexer(demande);
  const tirables = demande.questions.filter((question) =>
    questionTirable(question, index.items, demande.run),
  );
  const interroges = demande.run.perimetre.candidats.filter((candidat) => candidat.interroge);
  const groupes = grouperParCandidat(tirables, interroges);

  const entrees: EntreeTirage[] = [];
  const vides: StrateVide[] = [];
  const resumes: ResumeReprise[] = [];

  for (const candidat of interroges) {
    const resultat = tirerGroupeCandidat(demande, index, groupes, candidat);
    entrees.push(...resultat.entrees);
    vides.push(...resultat.strates_vides);
    resumes.push(resultat.resume);
  }
  const attribution = tirerGroupeAttribution(demande, index, groupes);
  entrees.push(...attribution.entrees);
  vides.push(...attribution.strates_vides);

  return {
    tirage: {
      run_id: demande.run.id,
      date_gel: demande.run.date_gel,
      graine_tirage: demande.graine,
      entrees,
    },
    rapport: {
      strates_vides: vides,
      candidats_a_part: interroges.filter((c) => c.sous_seuil).map((c) => c.candidat_id),
      candidats_non_interroges: demande.run.perimetre.candidats
        .filter((candidat) => !candidat.interroge)
        .map((candidat) => candidat.candidat_id),
      reprises_par_candidat: resumes,
    },
  };
}

function grouperParCandidat(
  questions: readonly Question[],
  interroges: readonly CandidatAuGel[],
): ReadonlyMap<string, readonly Question[]> {
  const retenus = new Set(interroges.map((candidat) => candidat.candidat_id));
  const groupes = new Map<string, Question[]>();
  groupes.set(GROUPE_ATTRIBUTION, []);
  for (const candidat of retenus) groupes.set(candidat, []);

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

interface ResultatCandidat {
  readonly entrees: readonly EntreeTirage[];
  readonly strates_vides: readonly StrateVide[];
  readonly resume: ResumeReprise;
}

function tirerGroupeCandidat(
  demande: DemandeTirage,
  index: Index,
  groupes: ReadonlyMap<string, readonly Question[]>,
  candidat: CandidatAuGel,
): ResultatCandidat {
  const siennes = questionsDuGroupe(groupes, candidat.candidat_id);
  const univers = universDesStrates(
    [...groupes.keys()]
      .filter((cle) => cle !== GROUPE_ATTRIBUTION)
      .flatMap((cle) => questionsDuGroupe(groupes, cle)),
    index,
  );
  const resultat = tirerGroupe({
    identifiant: candidat.candidat_id,
    questions: siennes,
    univers,
    quota: demande.parametres.questions_par_strate,
    // §5 et schema/README.md : un candidat « nouveau » est hors du calcul du ratio 80/20.
    eligible_a_la_reprise:
      demande.tirage_precedent !== undefined && candidat.statut_au_gel !== "nouveau",
    index,
    rng: generateur(amorce(demande, candidat.candidat_id)),
    precedent: demande.tirage_precedent,
  });
  const entrees = resultat.choisies.map((question) =>
    entreeDe(question, index, demande.run, demande.tirage_precedent),
  );
  return {
    entrees,
    strates_vides: resultat.strates_vides,
    resume: {
      candidat_id: candidat.candidat_id,
      cible: resultat.cible,
      budget_reprise: resultat.budget_reprise,
      reprises: entrees.filter((entree) => entree.reprise).length,
    },
  };
}

/**
 * Les questions d'attribution forment leur propre groupe : §5 interdit de les attribuer à un
 * candidat, elles ne peuvent donc pas entrer dans une strate candidat × thème × gabarit. Leur
 * strate est le thème seul, et le ratio de reprise s'y applique comme ailleurs.
 */
function tirerGroupeAttribution(
  demande: DemandeTirage,
  index: Index,
  groupes: ReadonlyMap<string, readonly Question[]>,
): { readonly entrees: readonly EntreeTirage[]; readonly strates_vides: readonly StrateVide[] } {
  const attributions = questionsDuGroupe(groupes, GROUPE_ATTRIBUTION);
  const resultat = tirerGroupe({
    identifiant: GROUPE_ATTRIBUTION,
    questions: attributions,
    univers: universDesStrates(attributions, index),
    quota: demande.parametres.questions_par_strate,
    eligible_a_la_reprise: demande.tirage_precedent !== undefined,
    index,
    rng: generateur(amorce(demande, "attribution")),
    precedent: demande.tirage_precedent,
  });
  return {
    entrees: resultat.choisies.map((question) =>
      entreeDe(question, index, demande.run, demande.tirage_precedent),
    ),
    strates_vides: resultat.strates_vides,
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
