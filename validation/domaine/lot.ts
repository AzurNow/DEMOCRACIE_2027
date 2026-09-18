/**
 * Composition des lots et ordre d'affichage.
 *
 * Deux exigences se croisent ici. Le §4 impose des lots de 50 items communs aux deux
 * annotateurs — sans items communs, aucun kappa. Et l'ordre d'affichage doit être aléatoire,
 * à graine enregistrée, **sans jamais enchaîner deux items du même candidat** : si la fatigue
 * de fin de lot tombe toujours sur le même candidat, l'erreur de mesure devient une asymétrie
 * entre candidats, exactement ce que le projet prétend mesurer chez les autres.
 *
 * L'ordre est propre à chaque annotateur (graine dérivée de son identifiant), ce qui supprime
 * en plus tout effet d'ordre partagé. Il n'est pas stocké : il se recalcule à partir de la
 * graine maîtresse du lot, qui, elle, est enregistrée.
 */

import type { GenerateurAleatoire } from "./alea.ts";
import { ALGORITHME_ALEA, generateur, graineDepuisTexte, melanger } from "./alea.ts";
import type { ItemDuLot, Lot } from "./types.ts";

export const ALGORITHME_ORDRE = `ordre-annotateur-v1(${ALGORITHME_ALEA})`;

export const TAILLE_LOT_REEL = 50;
export const TAILLE_LOT_ENTRAINEMENT = 30;

/**
 * Levée quand aucun ordre ne peut respecter la contrainte d'adjacence : c'est le cas si et
 * seulement si un candidat occupe plus de la moitié (arrondie au supérieur) du lot. Une
 * dégradation silencieuse — « on fait au mieux » — produirait des séries invisibles.
 */
export class OrdreImpossible extends Error {
  readonly candidat_id: string;
  readonly effectif: number;
  readonly taille: number;

  constructor(candidat_id: string, effectif: number, taille: number) {
    super(
      `Ordre impossible : le candidat ${candidat_id} occupe ${effectif} des ${taille} items du lot, ` +
        `soit plus de la moitié. Aucune disposition n'évite deux items consécutifs du même candidat.`,
    );
    this.name = "OrdreImpossible";
    this.candidat_id = candidat_id;
    this.effectif = effectif;
    this.taille = taille;
  }
}

/**
 * Ordre d'affichage d'un lot pour un annotateur donné.
 *
 * Méthode : les items sont groupés par candidat et mélangés à l'intérieur de chaque groupe,
 * les groupes sont ordonnés du plus fourni au moins fourni (à effectif égal, l'ordre est tiré),
 * puis la suite obtenue est distribuée sur les positions paires, puis sur les impaires. Deux
 * items voisins viennent alors nécessairement de deux groupes différents, sauf si un groupe
 * dépasse la moitié du lot — cas où l'on lève.
 */
export function ordreAffichage(lot: Lot, annotateur_id: string): readonly ItemDuLot[] {
  const rng = generateur(graineDepuisTexte(lot.graine_maitresse, lot.lot_id, annotateur_id));
  const groupes = grouperParCandidat(lot.items, rng);
  verifierFaisabilite(groupes, lot.items.length);

  const suite = groupes.flatMap((groupe) => groupe.items);
  return distribuerEnAlternance(suite);
}

interface GroupeCandidat {
  readonly candidat_id: string;
  readonly items: readonly ItemDuLot[];
  readonly cle_tri: number;
}

function grouperParCandidat(
  items: readonly ItemDuLot[],
  rng: GenerateurAleatoire,
): readonly GroupeCandidat[] {
  const parCandidat = new Map<string, ItemDuLot[]>();
  for (const item of items) {
    const groupe = parCandidat.get(item.candidat_id);
    if (groupe === undefined) parCandidat.set(item.candidat_id, [item]);
    else groupe.push(item);
  }

  const groupes: GroupeCandidat[] = [];
  // Les clés sont triées avant tout tirage : l'ordre d'itération d'une Map dépend de l'ordre
  // d'insertion, donc du fichier lu, ce qui rendrait le résultat non reproductible.
  for (const candidat_id of [...parCandidat.keys()].sort()) {
    groupes.push({
      candidat_id,
      items: melanger(parCandidat.get(candidat_id) as ItemDuLot[], rng),
      cle_tri: rng.flottant(),
    });
  }

  return [...groupes].sort(comparerGroupes);
}

function comparerGroupes(a: GroupeCandidat, b: GroupeCandidat): number {
  if (a.items.length !== b.items.length) return b.items.length - a.items.length;
  return a.cle_tri - b.cle_tri;
}

function verifierFaisabilite(groupes: readonly GroupeCandidat[], taille: number): void {
  const plusGros = groupes[0];
  if (plusGros === undefined) return;
  if (plusGros.items.length > Math.ceil(taille / 2)) {
    throw new OrdreImpossible(plusGros.candidat_id, plusGros.items.length, taille);
  }
}

function distribuerEnAlternance(suite: readonly ItemDuLot[]): readonly ItemDuLot[] {
  const resultat = new Array<ItemDuLot>(suite.length);
  let position = 0;
  for (const item of suite) {
    resultat[position] = item;
    position += 2;
    if (position >= suite.length) position = 1;
  }
  return resultat;
}

/* ------------------------------------------------------------- composition */

/**
 * Découpe une réserve d'items en lots de taille fixe. L'affectation aux lots est elle aussi
 * tirée : composer les lots dans l'ordre du répertoire regrouperait les items d'un même
 * candidat dans un même lot, ce qui rendrait la contrainte d'adjacence infaisable et, surtout,
 * ferait porter le kappa d'un lot sur un seul candidat.
 */
export function composerLots(
  items: readonly ItemDuLot[],
  taille: number,
  graine_maitresse: string,
): readonly (readonly ItemDuLot[])[] {
  if (taille < 1) throw new Error(`Taille de lot invalide : ${taille}`);
  const rng = generateur(graineDepuisTexte(graine_maitresse, "composition"));
  const melanges = melanger([...items].sort(comparerParIdentifiant), rng);

  const lots: ItemDuLot[][] = [];
  for (let debut = 0; debut < melanges.length; debut += taille) {
    lots.push(melanges.slice(debut, debut + taille));
  }
  return lots;
}

function comparerParIdentifiant(a: ItemDuLot, b: ItemDuLot): number {
  return a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0;
}

/** Vrai si aucun item n'est immédiatement suivi d'un item du même candidat. */
export function adjacenceRespectee(ordre: readonly ItemDuLot[]): boolean {
  for (let i = 1; i < ordre.length; i += 1) {
    if ((ordre[i] as ItemDuLot).candidat_id === (ordre[i - 1] as ItemDuLot).candidat_id) {
      return false;
    }
  }
  return true;
}
