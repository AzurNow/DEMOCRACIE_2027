/**
 * Engendrement des questions à partir des items vérifiés.
 *
 * §5 : « Les questions sont engendrées mécaniquement à partir des items, jamais rédigées à la
 * main : c'est ce qui rend la symétrie vérifiable par un test plutôt que par une promesse. »
 *
 * Ce module produit la formulation NEUTRE et rien d'autre. Les formulations familière et
 * orientée supposent un modèle et un prompt versionné (§5) : elles complèteront plus tard ces
 * objets pour en faire des `question` conformes au schéma, qui en exige trois.
 *
 * Deux statuts arrêtent l'engendrement, et aucun autre : un item dont la validation n'est pas
 * acquise — dont les items T3, « conservés avec le statut à confirmer », qui « n'engendrent
 * aucune question » (§4) — et un item contesté, que §5 interdit dans le tirage. Un item arbitré
 * n'engendre que si la dernière décision du panel le réintègre (maintien ou correction).
 *
 * Pour un item qui engendre, le choix des gabarits appartient à la table de `prompts/` : types
 * admis, et `positions_exclues` (§5, protocole 0.3 : la position conditionnelle). Ce module ne
 * teste jamais un code de gabarit pour en décider.
 */

import { sha256 } from "../../validation/domaine/empreinte.ts";
import { contestationPermetLeTirage } from "./contestation.ts";
import { gabaritsPourType, remplirTexteNeutre, VERSION_GABARITS } from "./gabarits.ts";
import type { Gabarit } from "./gabarits.ts";
import type {
  CandidatNomme,
  Item,
  ItemDeQuestion,
  Mesure,
  QuestionEngendree,
  ReferenceItem,
  Theme,
} from "./types.ts";
import { estTheme } from "./types.ts";

export class MesureIntrouvable extends Error {
  readonly item_id: string;
  readonly mesure_id: string;

  constructor(item_id: string, mesure_id: string) {
    super(`Mesure ${mesure_id} introuvable pour l'item ${item_id} : référentiel incomplet.`);
    this.name = "MesureIntrouvable";
    this.item_id = item_id;
    this.mesure_id = mesure_id;
  }
}

/**
 * §3 : « Une position hors de ces thèmes est enregistrée mais n'entre pas dans le tirage. » Le
 * schéma rend un onzième thème impossible ; y arriver quand même signale un fichier écrit hors
 * de la chaîne de validation, ce qui se refuse au lieu de se contourner.
 */
export class ThemeHorsPerimetre extends Error {
  readonly mesure_id: string;
  readonly theme: string;

  constructor(mesure_id: string, theme: string) {
    super(`Thème « ${theme} » de la mesure ${mesure_id} hors des dix thèmes du §3.`);
    this.name = "ThemeHorsPerimetre";
    this.mesure_id = mesure_id;
    this.theme = theme;
  }
}

/**
 * §4 et §5 : seul un item vérifié et admis au tirage engendre des questions. Pour la contestation,
 * la règle est celle du tirage (`contestationPermetLeTirage`) : non contesté, ou arbitré avec une
 * dernière décision de maintien ou de correction (§5, protocole 0.3 ; annexe E, point 6). Elle est
 * évaluée même quand la validation exclut déjà l'item : un arbitrage illisible se signale toujours.
 */
export function itemEngendreDesQuestions(item: Item): boolean {
  const contestationAdmise = contestationPermetLeTirage(item);
  return item.statut_validation === "verifie" && contestationAdmise;
}

export function referenceDe(item: Item): ReferenceItem {
  return { item_id: item.id, item_version: item.version, item_empreinte: item.empreinte };
}

/** Dérivé de (item principal, gabarit) et de rien d'autre : l'identité survit à une correction. */
export function identifiantQuestion(item_id: string, gabarit: string): string {
  return `q_${sha256(`${item_id}|${gabarit}`).slice(0, 32)}`;
}

/**
 * `candidats` : le périmètre du run (`run.perimetre.candidats`), seul domicile du nom d'un
 * candidat. Son `libelle` remplit `[candidat]` ; `item.libelle_lisible`, étiquette de l'item, n'y
 * sert plus.
 */
export function engendrer(
  items: readonly Item[],
  mesures: readonly Mesure[],
  candidats: readonly CandidatNomme[],
): readonly QuestionEngendree[] {
  const referentiel = new Map(mesures.map((mesure) => [mesure.id, mesure]));
  const libelles = new Map(candidats.map((candidat) => [candidat.candidat_id, candidat.libelle]));
  const eligibles = items.filter(itemEngendreDesQuestions);
  const positionsParMesure = grouperPositionsParMesure(eligibles);

  const questions: QuestionEngendree[] = [];
  for (const item of eligibles) {
    const contexte = { mesure: mesureDe(referentiel, item), libelles, positionsParMesure };
    for (const gabarit of gabaritsPourItem(item)) {
      questions.push(construire(item, gabarit, contexte));
    }
  }
  return questions;
}

interface ContexteItem {
  readonly mesure: Mesure;
  readonly libelles: ReadonlyMap<string, string>;
  readonly positionsParMesure: ReadonlyMap<string, readonly Item[]>;
}

/**
 * Toutes les positions que l'item porte, quel que soit l'instant : l'assertion d'un item P, les
 * DEUX états d'un item O. L'engendrement ne connaît pas la date du run, donc pas l'état qui sera
 * en vigueur au gel (décision de l'auteur du 2026-09-22). Un item A ou F n'en porte aucune.
 * La lecture suit les blocs présents, jamais le type : aucun cas particulier n'est codé ici.
 */
export function positionsPortees(item: Item): readonly string[] {
  const etats = [
    item.assertion,
    item.obsolescence?.etat_anterieur,
    item.obsolescence?.etat_posterieur,
  ];
  return etats.flatMap((etat) => (etat === undefined ? [] : [etat.position]));
}

/**
 * §5 (protocole 0.3) : les gabarits admis pour le type, moins ceux dont `positions_exclues`
 * contient une position portée par l'item. La règle est lue dans la table, en données.
 */
export function gabaritsPourItem(item: Item): readonly Gabarit[] {
  const portees = positionsPortees(item);
  return gabaritsPourType(item.type).filter(
    (gabarit) => !gabarit.positions_exclues.some((exclue) => portees.includes(exclue)),
  );
}

export function mesureDe(referentiel: ReadonlyMap<string, Mesure>, item: Item): Mesure {
  const mesure = referentiel.get(item.mesure_id);
  if (mesure === undefined) throw new MesureIntrouvable(item.id, item.mesure_id);
  themeDe(mesure);
  return mesure;
}

/** Le thème des dix, ou un refus. Jamais un thème de repli : une strate fausse fausse le tirage. */
export function themeDe(mesure: Mesure): Theme {
  if (!estTheme(mesure.theme)) throw new ThemeHorsPerimetre(mesure.id, mesure.theme);
  return mesure.theme;
}

/**
 * Les items qui portent une position sur leur mesure — assertion d'un item P, états d'un item O —
 * lus aux blocs présents (`positionsPortees`), jamais au type. Lequel compte, et dans quel sens, se
 * décide au gel (`reponse-attendue.ts:listeAttendueAuGel`) : l'engendrement ne connaît pas la date.
 */
function grouperPositionsParMesure(items: readonly Item[]): ReadonlyMap<string, readonly Item[]> {
  const parMesure = new Map<string, Item[]>();
  for (const item of items) {
    if (positionsPortees(item).length === 0) continue;
    const groupe = parMesure.get(item.mesure_id);
    if (groupe === undefined) parMesure.set(item.mesure_id, [item]);
    else groupe.push(item);
  }
  return parMesure;
}

function construire(item: Item, gabarit: Gabarit, contexte: ContexteItem): QuestionEngendree {
  const socle = {
    id: identifiantQuestion(item.id, gabarit.code),
    gabarit: gabarit.code,
    items: entreesDItems(item, gabarit, contexte.positionsParMesure),
    grappe_id: item.id,
    theme: themeDe(contexte.mesure),
    texte_neutre: texteDe(item, gabarit, contexte),
    version_gabarits: VERSION_GABARITS,
  };
  if (!gabarit.nomme_candidat) return socle;
  return { ...socle, candidat_id: item.candidat_id };
}

/**
 * `[candidat]` reçoit le `libelle` du candidat dans le périmètre du run. Un candidat absent du
 * périmètre fait échouer le remplissage des cinq gabarits qui le nomment (`LibelleCandidatAbsent`),
 * et réussir celui de Q-ATT, qui ne le nomme pas. Aucun libellé de repli n'est fabriqué.
 */
function texteDe(item: Item, gabarit: Gabarit, contexte: ContexteItem): string {
  const substitutions = { formulation_mesure: contexte.mesure.formulation_canonique };
  const libelle = contexte.libelles.get(item.candidat_id);
  if (libelle === undefined) return remplirTexteNeutre(gabarit, substitutions);
  return remplirTexteNeutre(gabarit, { ...substitutions, libelle_candidat: libelle });
}

/**
 * Q-ATT attend « la liste exacte des candidats du périmètre dont la position en vigueur à la date
 * du run est « pour » » (annexe B, protocole 0.6). L'engendrement ne connaît pas cette date : il
 * inscrit en `attendu_dans_liste` TOUS les autres items vérifiés qui portent une position sur la
 * mesure (P et O, de tout candidat, y compris celui de l'item principal), et la liste se résout au
 * gel sur leurs positions en vigueur (`reponse-attendue.ts:listeAttendueAuGel`). Qu'un item y
 * figure ne dit donc pas que son candidat est attendu. Pour un item fictif, la liste est vide, ce
 * qui est exactement l'attente « aucun » de l'annexe B.
 *
 * Le gabarit d'attribution se reconnaît à sa donnée `nomme_candidat`, jamais à son code : dans
 * la table, seul le gabarit qui ne nomme aucun candidat attend une liste de candidats, et le
 * chargeur de `gabarits.ts` lie `nomme_candidat` à la présence de `[candidat]` dans le texte.
 */
function entreesDItems(
  item: Item,
  gabarit: Gabarit,
  positionsParMesure: ReadonlyMap<string, readonly Item[]>,
): readonly ItemDeQuestion[] {
  const principal: ItemDeQuestion = { reference: referenceDe(item), role: "principal" };
  if (gabarit.nomme_candidat) return [principal];

  // Une mesure sans aucun item P du périmètre — le cas d'une mesure fictive — n'a pas de groupe.
  const groupe = positionsParMesure.get(item.mesure_id);
  if (groupe === undefined) return [principal];

  const autres = groupe
    .filter((autre) => autre.id !== item.id)
    .map((autre): ItemDeQuestion => ({ reference: referenceDe(autre), role: "attendu_dans_liste" }));
  return [principal, ...autres];
}
