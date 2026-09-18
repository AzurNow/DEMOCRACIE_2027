/**
 * Relecture du journal append-only.
 *
 * L'état d'un annotateur n'est stocké nulle part : il se **rejoue** à partir de ses entrées,
 * dans l'ordre où elles ont été écrites. C'est ce qui rend la reprise de session gratuite — il
 * n'y a pas de fichier d'état à garder cohérent avec le journal, donc pas de désynchronisation
 * possible entre les deux — et c'est ce qui rend le journal auditable : la position courante
 * d'un annotateur est une conséquence de ses décisions, pas une donnée qu'on lui fait confiance
 * de tenir à jour.
 *
 * Un changement d'avis n'écrase rien : c'est une nouvelle entrée, et l'ancienne reste.
 */

import type { EntreeDecision, EntreeJournal, ItemDuLot } from "./types.ts";

export interface EtatAnnotateur {
  /** Dernière décision non annulée, par item. */
  readonly decisions: ReadonlyMap<string, EntreeDecision>;
  /** Items sortis du lot parce que contestés (§4, droit de réponse). */
  readonly retires: ReadonlySet<string>;
  /** Nombre de décisions déjà portées sur chaque item, annulées comprises. */
  readonly decomptes: ReadonlyMap<string, number>;
  /** La décision annulable, c'est-à-dire la dernière encore active. `null` s'il n'y en a pas. */
  readonly annulable: EntreeDecision | null;
  readonly entrees: readonly EntreeJournal[];
}

export function rejouer(entrees: readonly EntreeJournal[]): EtatAnnotateur {
  const parItem = new Map<string, EntreeDecision[]>();
  const retires = new Set<string>();
  const annulees = new Set<string>();
  const decomptes = new Map<string, number>();

  for (const entree of entrees) {
    if (entree.type_entree === "decision") {
      empiler(parItem, entree);
      decomptes.set(entree.item_id, (decomptes.get(entree.item_id) ?? 0) + 1);
    } else if (entree.type_entree === "annulation") {
      annulees.add(entree.annule);
    } else {
      retires.add(entree.item_id);
    }
  }

  const decisions = derniersActifs(parItem, annulees);
  return { decisions, retires, decomptes, annulable: derniereActive(entrees, annulees), entrees };
}

function empiler(parItem: Map<string, EntreeDecision[]>, entree: EntreeDecision): void {
  const pile = parItem.get(entree.item_id);
  if (pile === undefined) parItem.set(entree.item_id, [entree]);
  else pile.push(entree);
}

function derniersActifs(
  parItem: ReadonlyMap<string, EntreeDecision[]>,
  annulees: ReadonlySet<string>,
): ReadonlyMap<string, EntreeDecision> {
  const actifs = new Map<string, EntreeDecision>();
  for (const [item_id, pile] of parItem) {
    for (let index = pile.length - 1; index >= 0; index -= 1) {
      const entree = pile[index] as EntreeDecision;
      if (!annulees.has(entree.id)) {
        actifs.set(item_id, entree);
        break;
      }
    }
  }
  return actifs;
}

function derniereActive(
  entrees: readonly EntreeJournal[],
  annulees: ReadonlySet<string>,
): EntreeDecision | null {
  for (let index = entrees.length - 1; index >= 0; index -= 1) {
    const entree = entrees[index] as EntreeJournal;
    if (entree.type_entree === "decision" && !annulees.has(entree.id)) return entree;
  }
  return null;
}

/** Nombre de décisions déjà portées sur un item, plus un : la visite qui commence. */
export function prochaineVisite(etat: EtatAnnotateur, item_id: string): number {
  return (etat.decomptes.get(item_id) ?? 0) + 1;
}

export interface Progression {
  readonly total: number;
  readonly decides: number;
  readonly retires: number;
  readonly restants: number;
  readonly termine: boolean;
}

export function progression(ordre: readonly ItemDuLot[], etat: EtatAnnotateur): Progression {
  let decides = 0;
  let retires = 0;
  for (const entree of ordre) {
    if (etat.retires.has(entree.item_id)) retires += 1;
    else if (etat.decisions.has(entree.item_id)) decides += 1;
  }
  const restants = ordre.length - decides - retires;
  return { total: ordre.length, decides, retires, restants, termine: restants === 0 };
}

/**
 * Premier item de l'ordre qui n'a ni décision active ni retrait. La reprise de session se
 * résume à cette fonction : rouvrir l'interface, c'est rejouer le journal et reprendre ici.
 */
export function itemCourant(ordre: readonly ItemDuLot[], etat: EtatAnnotateur): ItemDuLot | null {
  for (const entree of ordre) {
    if (etat.retires.has(entree.item_id)) continue;
    if (!etat.decisions.has(entree.item_id)) return entree;
  }
  return null;
}
