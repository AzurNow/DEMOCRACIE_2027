/**
 * Items tels que `data/items/` les contient : promus par la vraie règle de promotion, jamais
 * fabriqués à la main dans un état que `pnpm promote` n'aurait pas produit.
 */

import { evaluerPromotion } from "../../validation/domaine/promotion.ts";
import type { Item } from "../../validation/domaine/types.ts";
import { decision, itemP, mesure, OPTIONS_PROMOTION } from "./fabriques.ts";

export function itemPromu(surcharges: Partial<Item> = {}): Item {
  const item = itemP(surcharges);
  const issue = evaluerPromotion(
    {
      item,
      mesure: mesure({ id: item.mesure_id, version: item.mesure_version }),
      lot_id: "lot-001",
      lot_nature: "reel",
      decisions: ["a1", "a2"].map((annotateur_id) => decision({ annotateur_id, item, decision: "accepter" })),
      registre_corrections_mesure: [],
    },
    OPTIONS_PROMOTION,
  );
  if (issue.sort !== "promouvoir") throw new Error("L'item de départ aurait dû être promu.");
  return issue.item;
}

/** Une entrée d'historique, comme toute réécriture doit en ajouter une. */
export function entreeHistorique(version_resultante: number, changement = "contestation reçue") {
  return {
    date: "2026-10-01T10:00:00+02:00",
    changement,
    commit: "c".repeat(40),
    version_resultante,
  };
}

/** Une contestation conforme à `item.schema.json`, sans décision du panel. */
export function contestationRecue(id = "01JBANCESSA1C0NTESTAT10N01") {
  return {
    id,
    date_reception: "2026-10-01T09:00:00+02:00",
    texte: "La source ne dit pas cela.",
    contestataire_type: "campagne",
  };
}

/** L'item tel qu'une contestation le laisse : statut, contestation, entrée d'historique. */
export function itemConteste(item: Item): Item {
  if (item.contestations === undefined || item.historique === undefined) throw new Error("item non conforme");
  return {
    ...item,
    statut_contestation: "contestee",
    contestations: [...item.contestations, contestationRecue()],
    historique: [...item.historique, entreeHistorique(item.version)],
  };
}
