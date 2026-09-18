/**
 * Les quatre invariants inter-fichiers que JSON Schema ne peut pas exprimer.
 *
 * `docs/DETTE.md`, entrée « JSON Schema », point 1 : JSON Schema valide un fichier à la fois.
 * Une divergence sur `grappe_id` fausse les grappes du bootstrap du §8, donc tous les
 * intervalles de confiance publiés, sans qu'aucune validation n'échoue. Un `contexte` mal
 * recopié fait entrer une réponse contrefactuelle dans une métrique primaire.
 *
 * Chaque fonction rend la LISTE des violations, jamais un booléen : un contrôle qui dit
 * seulement « non » oblige à relire tout le corpus pour trouver l'objet fautif.
 */

import type { Item, Mesure } from "./types.ts";

export interface Violation {
  readonly invariant: string;
  /** Identifiant de l'objet fautif, tel qu'il figure dans le fichier. */
  readonly objet: string;
  readonly detail: string;
}

/* ------------------------------------------------- 1. grappe et principal */

export interface PorteurDeGrappe {
  readonly id: string;
  readonly grappe_id: string;
  readonly items: readonly {
    readonly reference: { readonly item_id: string };
    readonly role: string;
  }[];
}

const INVARIANT_GRAPPE = "grappe_id est l'item principal";

/** Vaut pour `question.items[]` comme pour `tirage.entrees[].items_au_gel[]`. */
export function grappeSuitItemPrincipal(
  porteurs: readonly PorteurDeGrappe[],
): readonly Violation[] {
  return porteurs.flatMap((porteur) => violationDeGrappe(porteur));
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
