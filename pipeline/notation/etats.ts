/**
 * Les états positionnels d'un item, seuls porteurs d'une paraphrase et d'une citation
 * (`item.schema.json#/$defs/etat_positionnel`) : l'assertion d'un item P, puis l'état antérieur et
 * l'état postérieur d'un item O. Un item A ou F n'en porte aucun.
 */

import type { EtatPositionnel, Item } from "../../validation/domaine/types.ts";

export function etatsPositionnels(item: Item): readonly EtatPositionnel[] {
  const etats = [item.assertion, item.obsolescence?.etat_anterieur, item.obsolescence?.etat_posterieur];
  return etats.filter((etat): etat is EtatPositionnel => etat !== undefined);
}
