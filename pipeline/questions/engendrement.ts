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

export function engendrer(
  items: readonly Item[],
  mesures: readonly Mesure[],
): readonly QuestionEngendree[] {
  const referentiel = new Map(mesures.map((mesure) => [mesure.id, mesure]));
  const eligibles = items.filter(itemEngendreDesQuestions);
  const positionsParMesure = grouperPositionsParMesure(eligibles);

  const questions: QuestionEngendree[] = [];
  for (const item of eligibles) {
    const mesure = mesureDe(referentiel, item);
    for (const gabarit of gabaritsPourItem(item)) {
      questions.push(construire(item, mesure, gabarit, positionsParMesure));
    }
  }
  return questions;
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

function grouperPositionsParMesure(items: readonly Item[]): ReadonlyMap<string, readonly Item[]> {
  const parMesure = new Map<string, Item[]>();
  for (const item of items) {
    if (item.type !== "P") continue;
    const groupe = parMesure.get(item.mesure_id);
    if (groupe === undefined) parMesure.set(item.mesure_id, [item]);
    else groupe.push(item);
  }
  return parMesure;
}

function construire(
  item: Item,
  mesure: Mesure,
  gabarit: Gabarit,
  positionsParMesure: ReadonlyMap<string, readonly Item[]>,
): QuestionEngendree {
  const socle = {
    id: identifiantQuestion(item.id, gabarit.code),
    gabarit: gabarit.code,
    items: entreesDItems(item, gabarit, positionsParMesure),
    grappe_id: item.id,
    theme: themeDe(mesure),
    texte_neutre: texteDe(item, mesure, gabarit),
    version_gabarits: VERSION_GABARITS,
  };
  if (!gabarit.nomme_candidat) return socle;
  return { ...socle, candidat_id: item.candidat_id };
}

/**
 * Sans `libelle_lisible`, le remplissage échoue pour les cinq gabarits qui nomment un candidat,
 * et réussit pour Q-ATT, qui ne le nomme pas. Aucun libellé de repli n'est fabriqué.
 */
function texteDe(item: Item, mesure: Mesure, gabarit: Gabarit): string {
  const substitutions = { formulation_mesure: mesure.formulation_canonique };
  if (item.libelle_lisible === undefined) return remplirTexteNeutre(gabarit, substitutions);
  return remplirTexteNeutre(gabarit, { ...substitutions, libelle_candidat: item.libelle_lisible });
}

/**
 * Q-ATT attend « la liste exacte des candidats du périmètre » : les items P vérifiés des AUTRES
 * candidats sur la même mesure y figurent en `attendu_dans_liste`. Pour un item fictif, la
 * liste est vide, ce qui est exactement l'attente « aucun » de l'annexe B.
 */
function entreesDItems(
  item: Item,
  gabarit: Gabarit,
  positionsParMesure: ReadonlyMap<string, readonly Item[]>,
): readonly ItemDeQuestion[] {
  const principal: ItemDeQuestion = { reference: referenceDe(item), role: "principal" };
  if (gabarit.code !== "Q-ATT") return [principal];

  // Une mesure sans aucun item P du périmètre — le cas d'une mesure fictive — n'a pas de groupe.
  const groupe = positionsParMesure.get(item.mesure_id);
  if (groupe === undefined) return [principal];

  const autres = groupe
    .filter((autre) => autre.candidat_id !== item.candidat_id)
    .map((autre): ItemDeQuestion => ({ reference: referenceDe(autre), role: "attendu_dans_liste" }));
  return [principal, ...autres];
}
