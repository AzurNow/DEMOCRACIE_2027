/**
 * Un dépôt Git jetable autour d'un bac d'essai, pour exercer les commandes qui n'écrivent qu'avec
 * `--ecrire` et un arbre propre (`outils/garde-fous-git.ts`). Jamais le dépôt du projet : les
 * commandes reçoivent `--racine=<bac>`.
 */

import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

export const RACINE_PROJET = resolve(import.meta.dirname, "../..");

function git(racine: string, arguments_: readonly string[]): string {
  const resultat = spawnSync(
    "git",
    ["-c", "user.name=Bac", "-c", "user.email=bac@demo.invalid", "-c", "commit.gpgsign=false", ...arguments_],
    { cwd: racine, encoding: "utf8" },
  );
  if (resultat.status !== 0) throw new Error(`git ${arguments_.join(" ")} : ${resultat.stderr}`);
  return resultat.stdout;
}

export function initialiserDepot(racine: string): void {
  git(racine, ["init", "--quiet"]);
  commiterTout(racine, "bac");
}

export function commiterTout(racine: string, message: string): void {
  git(racine, ["add", "--all"]);
  git(racine, ["commit", "--quiet", "--allow-empty", "-m", message]);
}

export function head(racine: string): string {
  return git(racine, ["rev-parse", "HEAD"]).trim();
}

export interface Execution {
  readonly status: number | null;
  readonly sortie: string;
  readonly erreur: string;
}

/** Lance un outil du projet (`outils/<nom>.ts`) avec les arguments donnés. */
export function executerOutil(nom: string, arguments_: readonly string[], env: NodeJS.ProcessEnv = process.env): Execution {
  const resultat = spawnSync(
    process.execPath,
    ["--experimental-strip-types", join(RACINE_PROJET, "outils", nom), ...arguments_],
    { encoding: "utf8", env },
  );
  return { status: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}
