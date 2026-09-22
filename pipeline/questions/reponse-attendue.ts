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

/* ----------------------------------------------------------------- instants */

/** Une date civile est ramenée à minuit UTC : voir la convention en tête de module. */
export function instantDeDateCivile(date: string): number {
  const millisecondes = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(millisecondes)) throw new Error(`Date civile illisible : ${date}`);
  return millisecondes;
}

export function instantDe(horodatage: string): number {
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
  const etat = etatEnVigueur(obsolescence.date_changement, contexte.temporelle.date_gel);
  return etat === "posterieur" ? obsolescence.etat_posterieur : obsolescence.etat_anterieur;
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

function candidatsAttendus(contexte: Contexte): readonly string[] {
  const identifiants = contexte.items
    .filter((entree) => entree.role === "principal" || entree.role === "attendu_dans_liste")
    .map((entree) => {
      const item = contexte.parId.get(entree.reference.item_id);
      if (item === undefined) throw new ItemIntrouvable(entree.reference.item_id);
      return item.candidat_id;
    });
  return [...new Set(identifiants)].sort();
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
