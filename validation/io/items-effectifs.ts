/**
 * L'état **effectif** d'un item : `data/items/<id>.json` s'il existe, sinon `staging/`.
 *
 * Une contestation ne vise qu'un item publié, et elle s'écrit dans `data/` (`pnpm contester`),
 * jamais dans `staging/`, que seul le pipeline écrit. Tout ce qui lit le statut de contestation —
 * constitution des lots, retrait d'un item de l'écran d'annotation, dénominateur du kappa, promotion
 * — le lit donc ici : lu dans `staging/` seul, un item contesté après sa promotion y paraîtrait
 * encore « aucune », et le kappa de son lot le compterait (§4, 0.8).
 */

import type { Item } from "../domaine/types.ts";
import { lireItemsData } from "./data-items.ts";

export function itemsEffectifs(
  staging: ReadonlyMap<string, Item>,
  data: ReadonlyMap<string, Item>,
): ReadonlyMap<string, Item> {
  const effectifs = new Map(staging);
  for (const [id, item] of data) effectifs.set(id, item);
  return effectifs;
}

/** Les items de `staging/` et de `data/`, l'état publié l'emportant. */
export function chargerItemsEffectifs(staging: ReadonlyMap<string, Item>, repertoire_data: string): ReadonlyMap<string, Item> {
  return itemsEffectifs(staging, lireItemsData(repertoire_data));
}

/** Le statut de contestation effectif d'un item, lu dans `data/` s'il y est publié. */
export function statutContestationEffectif(item: Item, data: ReadonlyMap<string, Item>): Item["statut_contestation"] {
  const publie = data.get(item.id);
  return publie === undefined ? item.statut_contestation : publie.statut_contestation;
}
