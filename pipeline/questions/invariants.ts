/**
 * Les six invariants inter-fichiers que JSON Schema ne peut pas exprimer.
 *
 * `docs/DETTE.md`, entrée « JSON Schema », point 1 : JSON Schema valide un fichier à la fois.
 * Une divergence sur `grappe_id` fausse les grappes du bootstrap du §8, donc tous les
 * intervalles de confiance publiés, sans qu'aucune validation n'échoue. Un `contexte` mal
 * recopié fait entrer une réponse contrefactuelle dans une métrique primaire.
 *
 * Chaque fonction rend la LISTE des violations, jamais un booléen : un contrôle qui dit
 * seulement « non » oblige à relire tout le corpus pour trouver l'objet fautif.
 */

import { fictifsEnDouble, type ItemFictifCandidat } from "../../validation/domaine/fictif-unique.ts";
import { gabaritParCode } from "./gabarits.ts";
import type { CodeGabarit, Item, Mesure } from "./types.ts";

export interface Violation {
  readonly invariant: string;
  /** Identifiant de l'objet fautif, tel qu'il figure dans le fichier. */
  readonly objet: string;
  readonly detail: string;
}

/* ------------------------------------------------- 1. grappe et principal */

export interface PorteurDeGrappe {
  readonly id: string;
  readonly gabarit: CodeGabarit;
  readonly grappe_id: string;
  readonly items: readonly {
    readonly reference: { readonly item_id: string };
    readonly role: string;
  }[];
}

/** Ce que l'invariant lit d'un item : sa mesure, grappe d'une question d'attribution. */
export interface ItemDeMesure {
  readonly id: string;
  readonly mesure_id: string;
}

const INVARIANT_GRAPPE = "grappe_id est l'item principal, ou la mesure d'une question d'attribution";

/**
 * Vaut pour `question.items[]` comme pour `tirage.entrees[].items_au_gel[]`. §5 et §8 (protocole
 * 0.9) : la grappe d'une question qui nomme un candidat est son item principal, unique ; celle
 * d'une question d'attribution (donnée `nomme_candidat` de la table, jamais le code) est la mesure
 * commune de ses items, avec au plus un item principal (l'item F d'une mesure fictive).
 */
export function grappeSuitItemPrincipal(
  porteurs: readonly PorteurDeGrappe[],
  items: readonly ItemDeMesure[],
): readonly Violation[] {
  const mesures = new Map(items.map((item) => [item.id, item.mesure_id]));
  return porteurs.flatMap((porteur) =>
    gabaritParCode(porteur.gabarit).nomme_candidat
      ? violationDeGrappe(porteur)
      : violationDeGrappeAttribution(porteur, mesures),
  );
}

function violationDeGrappeAttribution(
  porteur: PorteurDeGrappe,
  mesures: ReadonlyMap<string, string>,
): readonly Violation[] {
  const violation = (detail: string): readonly Violation[] => [{ invariant: INVARIANT_GRAPPE, objet: porteur.id, detail }];
  const principaux = porteur.items.filter((entree) => entree.role === "principal").length;
  if (principaux > 1) return violation(`${principaux} items principaux sur une question d'attribution, au plus un.`);
  const definissants = porteur.items.filter((entree) => entree.role === "principal" || entree.role === "attendu_dans_liste");
  const introuvable = definissants.find((entree) => !mesures.has(entree.reference.item_id));
  if (introuvable !== undefined) {
    return violation(`item ${introuvable.reference.item_id} introuvable : la mesure de la grappe n'est pas vérifiable.`);
  }
  const trouvees = [...new Set(definissants.map((entree) => mesures.get(entree.reference.item_id)))];
  if (trouvees.length === 1 && trouvees[0] === porteur.grappe_id) return [];
  return violation(`grappe_id ${porteur.grappe_id} alors que les items portent les mesures ${trouvees.join(", ")}.`);
}

function violationDeGrappe(porteur: PorteurDeGrappe): readonly Violation[] {
  const principaux = porteur.items.filter((entree) => entree.role === "principal");
  const premier = principaux[0];
  if (principaux.length !== 1 || premier === undefined) {
    return [
      {
        invariant: INVARIANT_GRAPPE,
        objet: porteur.id,
        detail: `${principaux.length} items principaux au lieu d'un seul.`,
      },
    ];
  }
  if (premier.reference.item_id === porteur.grappe_id) return [];
  return [
    {
      invariant: INVARIANT_GRAPPE,
      objet: porteur.id,
      detail: `grappe_id ${porteur.grappe_id} alors que l'item principal est ${premier.reference.item_id}.`,
    },
  ];
}

/* ---------------------------------------------- 2. contexte de la notation */

export interface ObjetNote {
  readonly id: string;
  readonly contexte: string;
}

export interface ObjetNotant {
  readonly id: string;
  readonly contexte: string;
  readonly objet_note: { readonly type: string; readonly id: string };
}

const INVARIANT_CONTEXTE = "le contexte suit celui de l'objet noté";

/** Vaut pour `notation` comme pour `verdict` : tous deux recopient le contexte de l'objet noté. */
export function contexteSuitObjetNote(
  notants: readonly ObjetNotant[],
  objets: readonly ObjetNote[],
): readonly Violation[] {
  const parId = new Map(objets.map((objet) => [objet.id, objet]));
  return notants.flatMap((notant) => violationDeContexte(notant, parId));
}

function violationDeContexte(
  notant: ObjetNotant,
  parId: ReadonlyMap<string, ObjetNote>,
): readonly Violation[] {
  const objet = parId.get(notant.objet_note.id);
  if (objet === undefined) {
    return [
      {
        invariant: INVARIANT_CONTEXTE,
        objet: notant.id,
        detail: `objet noté ${notant.objet_note.id} introuvable : le contexte n'est pas vérifiable.`,
      },
    ];
  }
  if (objet.contexte === notant.contexte) return [];
  return [
    {
      invariant: INVARIANT_CONTEXTE,
      objet: notant.id,
      detail: `contexte ${notant.contexte} alors que l'objet noté ${objet.id} porte ${objet.contexte}.`,
    },
  ];
}

/* --------------------------------------------- 3. item fictif et mesure */

const INVARIANT_FICTIF = "un item F pointe une mesure fictive";

export function itemsFictifsPointentMesureFictive(
  items: readonly Item[],
  mesures: readonly Mesure[],
): readonly Violation[] {
  const parId = new Map(mesures.map((mesure) => [mesure.id, mesure]));
  return items
    .filter((item) => item.type === "F")
    .flatMap((item) => violationDeFictivite(item, parId));
}

function violationDeFictivite(
  item: Item,
  parId: ReadonlyMap<string, Mesure>,
): readonly Violation[] {
  const mesure = parId.get(item.mesure_id);
  if (mesure === undefined) {
    return [
      {
        invariant: INVARIANT_FICTIF,
        objet: item.id,
        detail: `mesure ${item.mesure_id} introuvable : la fictivité n'est pas vérifiable.`,
      },
    ];
  }
  if (mesure.fictive) return [];
  return [
    {
      invariant: INVARIANT_FICTIF,
      objet: item.id,
      detail: `mesure ${mesure.id} déclarée fictive=false alors que l'item est de type F.`,
    },
  ];
}

/* ------------------------------------ 3 bis. un seul item F par mesure fictive */

const INVARIANT_FICTIF_UNIQUE = "une mesure fictive porte un seul item fictif";

/**
 * §5 (protocole 0.9) : « Une mesure fictive porte un seul item fictif. » La règle est celle de la
 * promotion (`validation/domaine/fictif-unique.ts`), lue ici sur le corpus entier, comme contrôle
 * a posteriori. Une violation par mesure fautive, qui nomme ses items.
 */
export function unSeulItemFictifParMesure(items: readonly ItemFictifCandidat[]): readonly Violation[] {
  return [...fictifsEnDouble(items)].map(([mesure_id, item_ids]) => ({
    invariant: INVARIANT_FICTIF_UNIQUE,
    objet: mesure_id,
    detail: `${item_ids.length} items fictifs vérifiés : ${item_ids.join(", ")}.`,
  }));
}

/* ------------------------------------ 4. versions des deux validations */

export interface DecisionValidation {
  readonly id: string;
  readonly item_id: string;
  readonly annotateur_id: string;
  readonly decision: string;
  readonly item_version: number;
  readonly item_empreinte: string;
}

const INVARIANT_VERSION = "les deux validations concordantes portent la même version";

/**
 * §4, règle de concordance : « un item est vérifié seulement avec deux décisions concordantes
 * portant sur la même version de l'item ; deux décisions sur des versions différentes partent en
 * arbitrage ». Seules les décisions qui peuvent vérifier un item — accepter et corriger —
 * entrent dans le contrôle : un rejet ne promeut rien.
 *
 * Le contrôle est ici post-hoc, sur le journal d'un corpus déjà promu. La même règle garde
 * l'entrée du pipeline dans `validation/domaine/promotion.ts`, au moment de la promotion.
 */
export function validationsConcordantesMemeVersion(
  decisions: readonly DecisionValidation[],
): readonly Violation[] {
  const retenues = decisions.filter(
    (decision) => decision.decision === "accepter" || decision.decision === "corriger",
  );
  const parItem = new Map<string, DecisionValidation[]>();
  for (const decision of retenues) {
    const groupe = parItem.get(decision.item_id);
    if (groupe === undefined) parItem.set(decision.item_id, [decision]);
    else groupe.push(decision);
  }
  return [...parItem.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([item_id, groupe]) => violationDeVersion(item_id, groupe));
}

function violationDeVersion(
  item_id: string,
  groupe: readonly DecisionValidation[],
): readonly Violation[] {
  const empreintes = new Set(
    groupe.map((decision) => `${decision.item_version}|${decision.item_empreinte}`),
  );
  if (groupe.length < 2 || empreintes.size === 1) return [];
  return [
    {
      invariant: INVARIANT_VERSION,
      objet: item_id,
      detail: `décisions retenues portant ${empreintes.size} versions différentes : ${[...empreintes].join(", ")}.`,
    },
  ];
}

/* ---------------------------------------- 5. prémisse fausse sur F ou O */

export interface PorteurDePremisse {
  readonly id: string;
  readonly items: readonly {
    readonly reference: { readonly item_id: string };
    readonly role: string;
  }[];
  readonly formulations: readonly { readonly id: string; readonly premisse_fausse?: boolean }[];
}

export interface ItemType {
  readonly id: string;
  readonly type: string;
}

const INVARIANT_PREMISSE = "une prémisse fausse ne porte que sur un item F ou O";

/** §5 (protocole 0.3) : les seuls types dont la prémisse orientée peut être fausse. */
const TYPES_A_PREMISSE_FAUSSE: ReadonlySet<string> = new Set(["F", "O"]);

/**
 * §5 (protocole 0.3) : « Une formulation orientée ne porte une prémisse fausse que sur un item F
 * ou O […] Le dénominateur de la confirmation de prémisse (section 8) est donc exactement
 * l'ensemble de ces formulations. » Un drapeau `premisse_fausse: true` sur une question dont
 * l'item principal est d'un autre type ferait entrer dans ce dénominateur une formulation dont la
 * prémisse est vraie par construction. Seules les questions portant au moins un drapeau `true`
 * sont contrôlées ; `false` ou l'absence du champ n'affirment aucune prémisse fausse.
 */
export function premisseFausseSurItemFOuO(
  questions: readonly PorteurDePremisse[],
  items: readonly ItemType[],
): readonly Violation[] {
  const parId = new Map(items.map((item) => [item.id, item]));
  return questions
    .flatMap((question) => violationDePremisse(question, parId))
    .sort((a, b) => (a.objet < b.objet ? -1 : a.objet > b.objet ? 1 : 0));
}

function violationDePremisse(
  question: PorteurDePremisse,
  parId: ReadonlyMap<string, ItemType>,
): readonly Violation[] {
  const drapees = question.formulations.filter((formulation) => formulation.premisse_fausse === true);
  if (drapees.length === 0) return [];
  const identifiants = drapees.map((formulation) => formulation.id).join(", ");
  const principaux = question.items.filter((entree) => entree.role === "principal");
  const premier = principaux[0];
  if (principaux.length !== 1 || premier === undefined) {
    return [
      {
        invariant: INVARIANT_PREMISSE,
        objet: question.id,
        detail: `${principaux.length} items principaux : le type portant la prémisse fausse de ${identifiants} n'est pas vérifiable.`,
      },
    ];
  }
  return violationDeType(question.id, premier.reference.item_id, identifiants, parId);
}

function violationDeType(
  question_id: string,
  item_id: string,
  identifiants: string,
  parId: ReadonlyMap<string, ItemType>,
): readonly Violation[] {
  const item = parId.get(item_id);
  if (item === undefined) {
    return [
      {
        invariant: INVARIANT_PREMISSE,
        objet: question_id,
        detail: `item principal ${item_id} introuvable : le type portant la prémisse fausse de ${identifiants} n'est pas vérifiable.`,
      },
    ];
  }
  if (TYPES_A_PREMISSE_FAUSSE.has(item.type)) return [];
  return [
    {
      invariant: INVARIANT_PREMISSE,
      objet: question_id,
      detail: `formulation(s) ${identifiants} à prémisse fausse sur l'item principal ${item_id}, de type ${item.type}.`,
    },
  ];
}
