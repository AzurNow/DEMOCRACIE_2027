/**
 * Réponse attendue, résolue à la date de gel du run.
 *
 * Elle ne vit jamais sur la question : pour un item O, elle dépend de la date du run (§4 :
 * « un item obsolète avant le run attend "position modifiée", après le run il attend l'ancienne
 * position »). Elle vit donc dans le tirage, gelée avec lui.
 *
 * Deux conventions, toutes deux consignées dans les données produites :
 *
 * - **Intervalle semi-ouvert** : `valide_du <= date_gel < valide_au`. Un item dont `valide_au`
 *   ou `obsolescence.date_changement` tombe exactement sur `date_gel` est DÉJÀ obsolète
 *   (`schema/README.md`, Temps). §4 disait « avant » et « après » sans définir l'égalité.
 * - **Comparaison sur l'instant** : une date civile (`valide_du`, `valide_au`,
 *   `date_changement`) est ramenée à minuit UTC, et `date_gel` porte son décalage. C'est la
 *   seule convention qui donne la même réponse à deux écritures du même instant ; comparer les
 *   chaînes, ou interpréter la date civile dans le fuseau porté par `date_gel`, rendrait le
 *   résultat dépendant de l'écriture choisie pour le gel.
 *
 * Tout couple (gabarit, type d'item) que l'annexe B ne tranche pas donne une erreur explicite,
 * jamais une réponse plausible : une attente inventée fait noter « inexacte » une réponse
 * correcte d'outil.
 */

import type {
  BlocObsolescence,
  CodeGabarit,
  EtatPositionnel,
  Item,
  ItemDeQuestion,
  Position,
  ReponseAttendue,
  ResolutionTemporelle,
  TypeItem,
} from "./types.ts";
import { POSITIONS } from "./types.ts";

export class ItemIntrouvable extends Error {
  constructor(item_id: string) {
    super(`Item ${item_id} introuvable : la réponse attendue ne peut pas être résolue.`);
    this.name = "ItemIntrouvable";
  }
}

export class QuestionSansPrincipal extends Error {
  constructor(nombre: number) {
    super(`Une question porte ${nombre} items principaux au lieu d'un seul.`);
    this.name = "QuestionSansPrincipal";
  }
}

/** Un item hors de sa fenêtre de validité n'aurait jamais dû entrer dans le tirage. */
export class ItemHorsValidite extends Error {
  readonly item_id: string;

  constructor(item_id: string, valide_du: string, valide_au: string | null, date_gel: string) {
    super(
      `Item ${item_id} hors validité au gel : valide du ${valide_du} au ` +
        `${valide_au === null ? "sans terme" : valide_au} (borne exclue), gel ${date_gel}.`,
    );
    this.name = "ItemHorsValidite";
    this.item_id = item_id;
  }
}

/** Trou du protocole rencontré : refus, jamais d'hypothèse. */
export class ReponseAttendueIndecidable extends Error {
  readonly gabarit: CodeGabarit;
  readonly type_item: TypeItem;

  constructor(gabarit: CodeGabarit, type_item: TypeItem, motif: string) {
    super(`Réponse attendue indécidable pour ${gabarit} sur un item ${type_item} : ${motif}.`);
    this.name = "ReponseAttendueIndecidable";
    this.gabarit = gabarit;
    this.type_item = type_item;
  }
}

/**
 * Un même candidat porte, au gel, deux positions en vigueur incompatibles sur la mesure (« pour »
 * par un item, « contre » par un autre). Le protocole ne dit pas laquelle fait foi : refus, jamais
 * de choix silencieux. Levée avant le tirage, par la règle de tirabilité, donc quelle que soit la
 * graine.
 */
export class PositionsContradictoires extends Error {
  readonly candidat_id: string;

  constructor(candidat_id: string, positions: readonly Position[]) {
    super(
      `Le candidat ${candidat_id} porte au gel plusieurs positions en vigueur sur la même mesure ` +
        `(${positions.join(", ")}) : la liste attendue d'une question d'attribution est indécidable.`,
    );
    this.name = "PositionsContradictoires";
    this.candidat_id = candidat_id;
  }
}

/* ----------------------------------------------------------------- instants */

/** Une date civile est ramenée à minuit UTC : voir la convention en tête de module. */
export function instantDeDateCivile(date: string): number {
  const millisecondes = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(millisecondes)) throw new Error(`Date civile illisible : ${date}`);
  return millisecondes;
}

/**
 * Motif de `commun#/$defs/instant` : ISO 8601 avec décalage obligatoire. `Date.parse` lit un
 * horodatage sans décalage dans le fuseau de la machine ; le vérifier d'abord rend le résultat
 * indépendant de la machine qui calcule.
 */
const INSTANT_AVEC_DECALAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;

export function instantDe(horodatage: string): number {
  if (!INSTANT_AVEC_DECALAGE.test(horodatage)) {
    throw new Error(`Instant sans décalage horaire explicite, ou mal formé : ${horodatage}`);
  }
  const millisecondes = Date.parse(horodatage);
  if (Number.isNaN(millisecondes)) throw new Error(`Instant illisible : ${horodatage}`);
  return millisecondes;
}

export function estEnVigueur(item: Item, date_gel: string): boolean {
  const gel = instantDe(date_gel);
  if (gel < instantDeDateCivile(item.valide_du)) return false;
  if (item.valide_au === null) return true;
  return gel < instantDeDateCivile(item.valide_au);
}

/** §4 : à `date_changement == date_gel`, l'état postérieur fait foi. */
export function etatEnVigueur(date_changement: string, date_gel: string): "anterieur" | "posterieur" {
  return instantDe(date_gel) >= instantDeDateCivile(date_changement) ? "posterieur" : "anterieur";
}

/** L'état d'un item O qui fait foi au gel, selon `etatEnVigueur` : une règle, un seul endroit. */
export function etatObsolescenceAuGel(obsolescence: BlocObsolescence, date_gel: string): EtatPositionnel {
  const etat = etatEnVigueur(obsolescence.date_changement, date_gel);
  return etat === "posterieur" ? obsolescence.etat_posterieur : obsolescence.etat_anterieur;
}

/**
 * La position qu'un item donne à son candidat à l'instant du gel, lue dans les blocs présents et
 * jamais dans le type : l'assertion d'un item P, l'état en vigueur d'un item O. `undefined` pour un
 * item hors de sa fenêtre de validité (`estEnVigueur`) ou sans bloc positionnel (items A et F) : il
 * ne dit rien de la position du candidat au gel.
 */
export function positionEnVigueur(item: Item, date_gel: string): Position | undefined {
  if (!estEnVigueur(item, date_gel)) return undefined;
  if (item.obsolescence !== undefined) return positionDe(etatObsolescenceAuGel(item.obsolescence, date_gel));
  if (item.assertion === undefined) return undefined;
  return positionDe(item.assertion);
}

/* ------------------------------------------------ liste d'une attribution */

/**
 * Annexe B et §5 (protocole 0.6) : la liste attendue d'une question d'attribution est celle des
 * candidats dont la position en vigueur au gel sur la mesure est « pour ». Elle n'est pas définie
 * dès qu'un candidat y a une position « conditionnel » ou « sans_objet » : la question n'est alors
 * pas tirée (`listeAttendueDefinie`, appelée par la règle de tirabilité avant tout usage de la
 * graine).
 */
export type ListeAuGel =
  | { readonly definie: true; readonly candidats: readonly string[] }
  | { readonly definie: false; readonly candidat_id: string; readonly position: Position };

/** Les seules positions qui décident de la présence dans la liste : « pour » (présent), « contre » (absent). */
const POSITIONS_TRANCHEES: readonly Position[] = ["pour", "contre"];

/**
 * Positions en vigueur au gel, par candidat, des items principal et `attendu_dans_liste` de la
 * question. Un item hors validité ou sans bloc positionnel n'apporte rien.
 */
function positionsParCandidat(
  entrees: readonly ItemDeQuestion[],
  parId: ReadonlyMap<string, Item>,
  date_gel: string,
): ReadonlyMap<string, ReadonlySet<Position>> {
  const table = new Map<string, Set<Position>>();
  for (const entree of entrees) {
    if (entree.role !== "principal" && entree.role !== "attendu_dans_liste") continue;
    const item = parId.get(entree.reference.item_id);
    if (item === undefined) throw new ItemIntrouvable(entree.reference.item_id);
    const position = positionEnVigueur(item, date_gel);
    if (position === undefined) continue;
    const siennes = table.get(item.candidat_id);
    if (siennes === undefined) table.set(item.candidat_id, new Set([position]));
    else siennes.add(position);
  }
  return table;
}

function positionNonTranchee(
  table: ReadonlyMap<string, ReadonlySet<Position>>,
): { readonly candidat_id: string; readonly position: Position } | undefined {
  for (const [candidat_id, positions] of [...table.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const hors = [...positions].sort().find((position) => !POSITIONS_TRANCHEES.includes(position));
    if (hors !== undefined) return { candidat_id, position: hors };
  }
  return undefined;
}

export function listeAttendueAuGel(
  entrees: readonly ItemDeQuestion[],
  parId: ReadonlyMap<string, Item>,
  date_gel: string,
): ListeAuGel {
  const table = positionsParCandidat(entrees, parId, date_gel);
  const nonTranchee = positionNonTranchee(table);
  if (nonTranchee !== undefined) return { definie: false, ...nonTranchee };

  const candidats: string[] = [];
  for (const [candidat_id, positions] of table) {
    if (positions.size > 1) throw new PositionsContradictoires(candidat_id, [...positions].sort());
    if (positions.has("pour")) candidats.push(candidat_id);
  }
  return { definie: true, candidats: candidats.sort() };
}

/**
 * Règle de tirabilité d'une question d'attribution, évaluée avant le tirage : sa liste attendue
 * est-elle définie au gel ? L'appelant la réserve aux gabarits qui ne nomment aucun candidat
 * (donnée `nomme_candidat` de la table) ; pour un item F, sans position, elle est toujours définie.
 */
export function listeAttendueDefinie(
  question: QuestionNotable,
  parId: ReadonlyMap<string, Item>,
  date_gel: string,
): boolean {
  return listeAttendueAuGel(question.items, parId, date_gel).definie;
}

/* -------------------------------------------------------------- résolution */

interface Contexte {
  readonly gabarit: CodeGabarit;
  readonly item: Item;
  readonly items: readonly ItemDeQuestion[];
  readonly parId: ReadonlyMap<string, Item>;
  readonly temporelle: ResolutionTemporelle;
}

type Resolveur = (contexte: Contexte) => ReponseAttendue;

export interface QuestionNotable {
  readonly gabarit: CodeGabarit;
  readonly items: readonly ItemDeQuestion[];
}

export function reponseAttendue(
  question: QuestionNotable,
  items: readonly Item[],
  date_gel: string,
): ReponseAttendue {
  const parId = new Map(items.map((item) => [item.id, item]));
  const item = itemPrincipal(question, parId);
  if (!estEnVigueur(item, date_gel)) {
    throw new ItemHorsValidite(item.id, item.valide_du, item.valide_au, date_gel);
  }

  const resolveur = RESOLVEURS.get(`${question.gabarit}:${item.type}`);
  if (resolveur === undefined) {
    throw new ReponseAttendueIndecidable(
      question.gabarit,
      item.type,
      "l'annexe B n'admet pas ce gabarit pour ce type d'item",
    );
  }
  return resolveur({
    gabarit: question.gabarit,
    item,
    items: question.items,
    parId,
    temporelle: temporelleDe(item, date_gel),
  });
}

function itemPrincipal(question: QuestionNotable, parId: ReadonlyMap<string, Item>): Item {
  const principaux = question.items.filter((entree) => entree.role === "principal");
  const premier = principaux[0];
  if (principaux.length !== 1 || premier === undefined) {
    throw new QuestionSansPrincipal(principaux.length);
  }
  const item = parId.get(premier.reference.item_id);
  if (item === undefined) throw new ItemIntrouvable(premier.reference.item_id);
  return item;
}

function temporelleDe(item: Item, date_gel: string): ResolutionTemporelle {
  const socle: ResolutionTemporelle = { date_gel, regle: "semi_ouvert" };
  if (item.obsolescence === undefined) return socle;
  return { ...socle, date_changement: item.obsolescence.date_changement };
}

/* ------------------------------------------------- lecture d'une position */

/** Le vocabulaire de `commun.schema.json` est fermé : une position hors liste est un refus. */
function positionDe(etat: EtatPositionnel): Position {
  if (!(POSITIONS as readonly string[]).includes(etat.position)) {
    throw new Error(`Position « ${etat.position} » hors du vocabulaire fermé du schéma.`);
  }
  return etat.position as Position;
}

function assertionDe(contexte: Contexte): EtatPositionnel {
  const assertion = contexte.item.assertion;
  if (assertion === undefined) {
    throw new ReponseAttendueIndecidable(contexte.gabarit, contexte.item.type, "assertion absente");
  }
  return assertion;
}

function etatObsolescence(contexte: Contexte): EtatPositionnel {
  const obsolescence = contexte.item.obsolescence;
  if (obsolescence === undefined) {
    throw new ReponseAttendueIndecidable(
      contexte.gabarit,
      contexte.item.type,
      "bloc d'obsolescence absent",
    );
  }
  return etatObsolescenceAuGel(obsolescence, contexte.temporelle.date_gel);
}

/**
 * « X propose-t-il [mesure] ? » : oui si la position en vigueur est « pour », non si elle est
 * « contre ». §5 (protocole 0.3) : une position conditionnelle n'engendre pas de question fermée,
 * et la table `prompts/gabarits-1.0.0.json` l'exclut de Q-FER (`positions_exclues`), pour un
 * item O dès que l'un de ses deux états l'est. Le `throw` ci-dessous est donc un filet de
 * sécurité, inatteignable par l'engendrement : il ne sert que si une question arrive d'ailleurs
 * (fichier écrit à la main, table de gabarits modifiée), et y répondre « oui » ou « non » serait
 * alors une décision de mesure prise ici, en silence.
 */
function ouiSelonPosition(contexte: Contexte, position: Position): ReponseAttendue {
  if (position === "pour") return { nature: "oui", resolution_temporelle: contexte.temporelle };
  if (position === "contre") return { nature: "non", resolution_temporelle: contexte.temporelle };
  throw new ReponseAttendueIndecidable(
    contexte.gabarit,
    contexte.item.type,
    `position « ${position} » sans réponse fermée dans l'annexe B`,
  );
}

/**
 * « X s'oppose-t-il à [mesure] ? » : la symétrique exacte de la question fermée. §5 (protocole
 * 0.3) : une position conditionnelle n'engendre pas de question négative (`positions_exclues` de
 * Q-NEG dans `prompts/gabarits-1.0.0.json`). Le `throw` est un filet de sécurité inatteignable
 * par l'engendrement, gardé pour une question qui n'en viendrait pas.
 */
function ouiSiOppose(contexte: Contexte, position: Position): ReponseAttendue {
  if (position === "contre") return { nature: "oui", resolution_temporelle: contexte.temporelle };
  if (position === "pour") return { nature: "non", resolution_temporelle: contexte.temporelle };
  throw new ReponseAttendueIndecidable(
    contexte.gabarit,
    contexte.item.type,
    `position « ${position} » sans réponse fermée dans l'annexe B`,
  );
}

/**
 * Filet de sécurité : la règle de tirabilité écarte avant le tirage toute question d'attribution
 * dont la liste n'est pas définie au gel. Une telle question n'arrive ici que d'ailleurs (fichier
 * écrit à la main), et y répondre serait une décision de mesure prise en silence.
 */
function candidatsAttendus(contexte: Contexte): readonly string[] {
  const liste = listeAttendueAuGel(contexte.items, contexte.parId, contexte.temporelle.date_gel);
  if (liste.definie) return liste.candidats;
  throw new ReponseAttendueIndecidable(
    contexte.gabarit,
    contexte.item.type,
    `position « ${liste.position} » en vigueur au gel pour ${liste.candidat_id} : liste attendue non définie`,
  );
}

/* ------------------------------------------------------ table des résolveurs */

const RESOLVEURS: ReadonlyMap<string, Resolveur> = new Map<string, Resolveur>([
  [
    "Q-DIR:P",
    (contexte) => ({
      nature: "position",
      position: positionDe(assertionDe(contexte)),
      resolution_temporelle: contexte.temporelle,
    }),
  ],
  [
    "Q-DIR:A",
    (contexte) => ({ nature: "absence_de_position", resolution_temporelle: contexte.temporelle }),
  ],
  ["Q-FER:P", (contexte) => ouiSelonPosition(contexte, positionDe(assertionDe(contexte)))],
  // §5 et question tranchée du lot : un item d'absence attend « non » à une question fermée.
  ["Q-FER:A", (contexte) => ({ nature: "non", resolution_temporelle: contexte.temporelle })],
  ["Q-FER:O", (contexte) => ouiSelonPosition(contexte, positionDe(etatObsolescence(contexte)))],
  [
    "Q-ATT:P",
    (contexte) => ({
      nature: "liste_candidats",
      candidats_attendus: candidatsAttendus(contexte),
      resolution_temporelle: contexte.temporelle,
    }),
  ],
  // Annexe B : « item F : "aucun" ». La liste est vide, et elle est écrite pour être lisible.
  [
    "Q-ATT:F",
    (contexte) => ({
      nature: "aucun_candidat",
      candidats_attendus: [],
      resolution_temporelle: contexte.temporelle,
    }),
  ],
  ["Q-NEG:P", (contexte) => ouiSiOppose(contexte, positionDe(assertionDe(contexte)))],
  [
    "Q-ORI:F",
    (contexte) => ({ nature: "non_avec_correction", resolution_temporelle: contexte.temporelle }),
  ],
  ["Q-ORI:O", (contexte) => orienteeSurObsolete(contexte)],
  ["Q-ACT:O", (contexte) => actualiteSurObsolete(contexte)],
]);

/**
 * « Est-il vrai que X propose [mesure] ? » sur un item obsolète. Avant le changement, la
 * prémisse est vraie et la réponse attendue est « oui » ; après, l'annexe B attend « non, avec
 * correction ». Une position conditionnelle en vigueur ne tranche ni l'un ni l'autre ; depuis la
 * décision de l'auteur du 2026-09-22, Q-ORI porte `positions_exclues: ["conditionnel"]` dans
 * `prompts/gabarits-1.0.0.json` et n'est pas engendrée pour un item O dont l'un des deux états est
 * conditionnel. Le `throw` est donc un filet de sécurité inatteignable par l'engendrement ; la
 * logique de ce résolveur, elle, est inchangée.
 */
function orienteeSurObsolete(contexte: Contexte): ReponseAttendue {
  const position = positionDe(etatObsolescence(contexte));
  if (position === "pour") return { nature: "oui", resolution_temporelle: contexte.temporelle };
  if (position === "contre") {
    return { nature: "non_avec_correction", resolution_temporelle: contexte.temporelle };
  }
  throw new ReponseAttendueIndecidable(
    contexte.gabarit,
    contexte.item.type,
    `position « ${position} » sans réponse orientée dans l'annexe B`,
  );
}

/** « X a-t-il changé de position ? » : la réponse est portée par les dates, pas par la position. */
function actualiteSurObsolete(contexte: Contexte): ReponseAttendue {
  const date_changement = contexte.temporelle.date_changement;
  if (date_changement === undefined) {
    throw new ReponseAttendueIndecidable(
      contexte.gabarit,
      contexte.item.type,
      "date de changement absente",
    );
  }
  const etat = etatEnVigueur(date_changement, contexte.temporelle.date_gel);
  return {
    nature: etat === "posterieur" ? "changement_de_position" : "position_anterieure",
    etat_attendu: etat,
    resolution_temporelle: contexte.temporelle,
  };
}
