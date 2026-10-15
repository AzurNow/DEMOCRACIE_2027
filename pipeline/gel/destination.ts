/**
 * Où le gel écrit (décision D41, `runs/README.md`) : `runs/<date>/` du dépôt lu quand `--sortie`
 * est absent — c'est le gel d'un vrai run, que seul l'auteur lance —, `<sortie>/<date>/` sinon.
 * `<date>` est la date de `date_gel` à Paris (`heure-paris.ts:dateParis`).
 *
 * Deux refus, avant toute écriture :
 * - une `--sortie` sous `runs/` du dépôt : seul le gel sans `--sortie` y écrit, un agent ou un test
 *   gèle toujours ailleurs ;
 * - un répertoire de run qui existe déjà, même vide : un gel s'invalide, il ne se refait pas.
 *
 * Le chemin est comparé après résolution des liens symboliques de sa plus longue partie existante :
 * un lien posé hors de `runs/` qui y mène est refusé comme le chemin direct.
 */

import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

export interface Destination {
  /** Le répertoire qui reçoit le répertoire du run (`runs/` ou la sortie demandée). */
  readonly parent: string;
  /** `AAAA-MM-JJ` à Paris. */
  readonly nom: string;
  readonly chemin: string;
}

export class SortieSousRuns extends Error {
  constructor(sortie: string, runs: string) {
    super(
      `--sortie ${sortie} est sous ${runs} : seul le gel sans --sortie écrit dans runs/, et seul l'auteur ` +
        `le lance (décision D41). Un essai gèle vers un répertoire hors de runs/.`,
    );
    this.name = "SortieSousRuns";
  }
}

export class RunDejaGele extends Error {
  constructor(chemin: string) {
    super(`${chemin} existe déjà : un gel s'invalide, il ne se refait pas (décision D41). Rien n'est écrit.`);
    this.name = "RunDejaGele";
  }
}

/** Le chemin réel de la plus longue partie existante, suivi du reste tel quel. */
function cheminReel(absolu: string): string {
  if (existsSync(absolu)) return realpathSync(absolu);
  const parent = dirname(absolu);
  if (parent === absolu) return absolu;
  return join(cheminReel(parent), basename(absolu));
}

function estSous(chemin: string, repertoire: string): boolean {
  const reel = cheminReel(resolve(chemin));
  const reference = cheminReel(resolve(repertoire));
  return reel === reference || reel.startsWith(`${reference}${sep}`);
}

function parentDemande(racine: string, sortie: string | undefined): string {
  const runs = join(racine, "runs");
  if (sortie === undefined) return runs;
  if (estSous(sortie, runs)) throw new SortieSousRuns(sortie, runs);
  return resolve(sortie);
}

/** Lève `RunDejaGele` si le répertoire existe, quel que soit son contenu. */
export function exigerAbsent(chemin: string): void {
  if (existsSync(chemin)) throw new RunDejaGele(chemin);
}

export function destinationDuRun(racine: string, sortie: string | undefined, date_repertoire: string): Destination {
  const parent = parentDemande(racine, sortie);
  const chemin = join(parent, date_repertoire);
  exigerAbsent(chemin);
  return { parent, nom: date_repertoire, chemin };
}
