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
 * §5 (protocole 0.9) : l'identité d'une question d'attribution est celle de sa mesure. Dérivé de
 * (mesure, gabarit) et de rien d'autre : l'identifiant survit à la correction ou au retrait d'un
 * item de la mesure. La chaîne hachée porte le préfixe `mesure|`, qu'aucune chaîne de
 * `identifiantQuestion` ne peut porter (un ULID est en majuscules de Crockford, sans `|`) : les
 * deux espaces d'identifiants sont disjoints, même si un item et une mesure partageaient un ULID.
 */
export function identifiantAttribution(mesure_id: string, gabarit: string): string {
  return `q_${sha256(`mesure|${mesure_id}|${gabarit}`).slice(0, 32)}`;
}

/**
 * Deux items F sur la même mesure fictive : la Q-ATT de la mesure aurait deux candidats au rôle
 * principal. Aucun n'est choisi (décision de l'auteur du 2026-09-25 : pas de principal désigné
 * arbitrairement) ; le cas est refusé et remonte à l'auteur.
 */
export class AttributionFictiveAmbigue extends Error {
  readonly mesure_id: string;
  readonly item_ids: readonly string[];

  constructor(mesure_id: string, item_ids: readonly string[]) {
    super(
      `Mesure fictive ${mesure_id} portée par ${item_ids.length} items sans position (${item_ids.join(", ")}) : ` +
        `sa question d'attribution n'a pas d'item principal désignable sans choix arbitraire.`,
    );
    this.name = "AttributionFictiveAmbigue";
    this.mesure_id = mesure_id;
    this.item_ids = item_ids;
  }
}

/**
 * `candidats` : le périmètre du run (`run.perimetre.candidats`), seul domicile du nom d'un
 * candidat. Son `libelle` remplit `[candidat]` ; `item.libelle_lisible`, étiquette de l'item, n'y
 * sert plus.
 *
 * Un gabarit qui nomme un candidat engendre une question par item. Un gabarit qui n'en nomme aucun
 * (donnée `nomme_candidat` de la table, jamais le code) engendre une question par mesure (§5,
 * protocole 0.9), quel que soit le nombre d'items de la mesure qui l'admettent : les items sont
 * d'abord regroupés, la question construite ensuite.
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
  const attributions = new Map<string, Attribution>();
  for (const item of eligibles) {
    const contexte = { mesure: mesureDe(referentiel, item), libelles };
    for (const gabarit of gabaritsPourItem(item)) {
      if (gabarit.nomme_candidat) questions.push(construire(item, gabarit, contexte));
      else noterAttribution(attributions, contexte.mesure, gabarit, item);
    }
  }
  for (const attribution of attributions.values()) {
    questions.push(construireAttribution(attribution, positionsParMesure));
  }
  return questions;
}

interface ContexteItem {
  readonly mesure: Mesure;
  readonly libelles: ReadonlyMap<string, string>;
}

/** Une mesure, un gabarit qui ne nomme personne, et les items éligibles qui l'admettent. */
interface Attribution {
  readonly mesure: Mesure;
  readonly gabarit: Gabarit;
  readonly porteurs: Item[];
}

function noterAttribution(
  attributions: Map<string, Attribution>,
  mesure: Mesure,
  gabarit: Gabarit,
  item: Item,
): void {
  const cle = `${mesure.id}|${gabarit.code}`;
  const existante = attributions.get(cle);
  if (existante === undefined) attributions.set(cle, { mesure, gabarit, porteurs: [item] });
  else existante.porteurs.push(item);
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

/** Une question qui nomme le candidat de l'item : un seul item, principal, qui est aussi la grappe. */
function construire(item: Item, gabarit: Gabarit, contexte: ContexteItem): QuestionEngendree {
  return {
    id: identifiantQuestion(item.id, gabarit.code),
    gabarit: gabarit.code,
    candidat_id: item.candidat_id,
    items: [{ reference: referenceDe(item), role: "principal" }],
    grappe_id: item.id,
    theme: themeDe(contexte.mesure),
    texte_neutre: texteDe(item, gabarit, contexte),
    version_gabarits: VERSION_GABARITS,
  };
}

/**
 * `[candidat]` reçoit le `libelle` du candidat dans le périmètre du run. Un candidat absent du
 * périmètre fait échouer le remplissage des cinq gabarits qui le nomment (`LibelleCandidatAbsent`).
 * Aucun libellé de repli n'est fabriqué.
 */
function texteDe(item: Item, gabarit: Gabarit, contexte: ContexteItem): string {
  const substitutions = { formulation_mesure: contexte.mesure.formulation_canonique };
  const libelle = contexte.libelles.get(item.candidat_id);
  if (libelle === undefined) return remplirTexteNeutre(gabarit, substitutions);
  return remplirTexteNeutre(gabarit, { ...substitutions, libelle_candidat: libelle });
}

/**
 * La question d'attribution d'une mesure (§5, protocole 0.9) : son identité et sa grappe sont
 * celles de la mesure, son thème celui de la mesure, et elle ne nomme personne.
 *
 * Elle attend « la liste exacte des candidats du périmètre interrogés au run dont la position en
 * vigueur à la date du run est « pour » » (annexe B). L'engendrement ne connaît pas cette date : il
 * inscrit en `attendu_dans_liste` TOUS les items vérifiés qui portent une position sur la mesure
 * (P et O, de tout candidat), et la liste se résout au gel sur leurs positions en vigueur
 * (`reponse-attendue.ts:listeAttendueAuGel`). Qu'un item y figure ne dit donc pas que son candidat
 * est attendu. Aucun de ces items n'est principal : la question ne porte sur aucun d'eux en
 * particulier (décision de l'auteur du 2026-09-25).
 *
 * Un item qui admet le gabarit sans porter de position — l'item F d'une mesure fictive, lu aux blocs
 * présents et jamais au type — reste principal : c'est lui que la question met à l'épreuve, et la
 * liste vide qu'il attend est l'attente « aucun » de l'annexe B. Deux tels items sur une mesure
 * lèvent `AttributionFictiveAmbigue`.
 */
function construireAttribution(
  attribution: Attribution,
  positionsParMesure: ReadonlyMap<string, readonly Item[]>,
): QuestionEngendree {
  const { mesure, gabarit } = attribution;
  const sansPosition = attribution.porteurs.filter((item) => positionsPortees(item).length === 0);
  if (sansPosition.length > 1) {
    throw new AttributionFictiveAmbigue(mesure.id, sansPosition.map((item) => item.id));
  }
  // Une mesure sans aucun item positionnel — le cas d'une mesure fictive — n'a pas de groupe.
  const groupe = positionsParMesure.get(mesure.id);
  const positionnels = groupe === undefined ? [] : groupe;
  return {
    id: identifiantAttribution(mesure.id, gabarit.code),
    gabarit: gabarit.code,
    items: [
      ...sansPosition.map((item): ItemDeQuestion => ({ reference: referenceDe(item), role: "principal" })),
      ...positionnels.map((item): ItemDeQuestion => ({ reference: referenceDe(item), role: "attendu_dans_liste" })),
    ],
    grappe_id: mesure.id,
    theme: themeDe(mesure),
    texte_neutre: remplirTexteNeutre(gabarit, { formulation_mesure: mesure.formulation_canonique }),
    version_gabarits: VERSION_GABARITS,
  };
}
