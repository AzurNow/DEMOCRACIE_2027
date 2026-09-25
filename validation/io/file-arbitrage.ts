/**
 * `validation/arbitrage/file.json` : instantané des items en arbitrage, réécrit à chaque
 * `pnpm promote --ecrire`. Un rapport dérivé, recalculable à tout moment depuis les lots, les
 * journaux et `staging/` : **aucune décision ne s'y inscrit**. Les décisions d'arbitrage vivent dans
 * leur registre en ajout seul (`validation/arbitrage/decisions.json`).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface EntreeFileArbitrage {
  readonly item_id: string;
  readonly lot_id: string;
  readonly motif: string;
}

export function ecrireFileArbitrage(repertoire: string, date: string, entrees: readonly EntreeFileArbitrage[]): void {
  mkdirSync(repertoire, { recursive: true });
  writeFileSync(join(repertoire, "file.json"), `${JSON.stringify({ date, entrees }, null, 2)}\n`, "utf8");
}
