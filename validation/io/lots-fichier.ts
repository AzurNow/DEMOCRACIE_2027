/**
 * Manifestes de lots. Écrits une fois par `pnpm lots`, lus ensuite ; jamais réécrits — un lot
 * dont la composition change après coup rend son kappa incomparable à celui du lot d'avant.
 *
 * Le manifeste est commun aux deux annotateurs : sans items communs, il n'y a pas de kappa.
 * Il ne contient aucune décision, sa lecture ne dit donc rien de ce que l'autre a fait.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Lot } from "../domaine/types.ts";

export function lireLots(repertoire: string): readonly Lot[] {
  if (!existsSync(repertoire)) return [];
  return readdirSync(repertoire)
    .filter((nom) => nom.endsWith(".json"))
    .sort()
    .map((nom) => JSON.parse(readFileSync(join(repertoire, nom), "utf8")) as Lot);
}

export function lireLot(repertoire: string, lot_id: string): Lot | null {
  const chemin = join(repertoire, `${lot_id}.json`);
  if (!existsSync(chemin)) return null;
  return JSON.parse(readFileSync(chemin, "utf8")) as Lot;
}

export class LotDejaExistant extends Error {
  constructor(lot_id: string) {
    super(
      `Le lot ${lot_id} existe déjà. Un manifeste de lot n'est jamais réécrit : sa composition ` +
        `et sa graine sont ce qui rend son kappa reproductible.`,
    );
    this.name = "LotDejaExistant";
  }
}

export function ecrireLot(repertoire: string, lot: Lot): void {
  mkdirSync(repertoire, { recursive: true });
  const chemin = join(repertoire, `${lot.lot_id}.json`);
  if (existsSync(chemin)) throw new LotDejaExistant(lot.lot_id);
  writeFileSync(chemin, `${JSON.stringify(lot, null, 2)}\n`, "utf8");
}
