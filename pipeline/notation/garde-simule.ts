/**
 * Le garde-fou des simulés de la notation : le juge simulé et le fournisseur d'existences simulé ne
 * se branchent jamais sur un répertoire de `runs/`. Un run simulé n'est pas un run (`runs/README.md`,
 * `pnpm run:dry`), et une notation simulée écrite à côté d'un vrai run serait indiscernable d'une
 * vraie à la lecture du volume.
 *
 * Le chemin est comparé après résolution des liens symboliques de sa plus longue partie existante :
 * un lien posé hors de `runs/` qui y mène est refusé comme le chemin direct.
 */

import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

/** `runs/` du dépôt qui porte ce code. */
export const RUNS_DU_DEPOT = resolve(import.meta.dirname, "../../runs");

export class SimuleSousRuns extends Error {
  constructor(chemin: string) {
    super(`${chemin} est sous ${RUNS_DU_DEPOT} : un juge ou un fournisseur simulé ne s'y branche jamais (un run simulé n'est pas un run).`);
    this.name = "SimuleSousRuns";
  }
}

export function estSousRuns(chemin: string): boolean {
  const reel = cheminReel(resolve(chemin));
  const runs = cheminReel(RUNS_DU_DEPOT);
  return reel === runs || reel.startsWith(`${runs}${sep}`);
}

export function exigerHorsDeRuns(chemin: string): void {
  if (estSousRuns(chemin)) throw new SimuleSousRuns(chemin);
}

/** Le chemin réel de la plus longue partie existante, suivi du reste tel quel. */
function cheminReel(absolu: string): string {
  if (existsSync(absolu)) return realpathSync(absolu);
  const parent = dirname(absolu);
  if (parent === absolu) return absolu;
  return join(cheminReel(parent), basename(absolu));
}
