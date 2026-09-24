/**
 * `pnpm proprete` — relève les signaux de propreté de tous les fichiers TypeScript et Python suivis
 * par Git, et imprime un rapport Markdown. Ne bloque jamais : c'est la matière première de la
 * compétence `revue-de-code`, qui copie ses comptes dans `docs/revues/<date>.md`.
 *
 *   pnpm proprete            comptes, et détail de la production
 *   pnpm proprete --tout     détail des tests en plus
 *
 * Seuls les fichiers suivis sont lus : ni `node_modules`, ni `scratch/`, ni sortie de build.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyserArguments, drapeau } from "./arguments.ts";
import { estAnalysable, rapport, type FichierSource } from "./proprete/rapport.ts";

const RACINE = resolve(import.meta.dirname, "..");

function fichiersSuivis(): string[] {
  const sortie = spawnSync("git", ["ls-files", "-z"], { cwd: RACINE, encoding: "utf8" });
  if (sortie.status !== 0) throw new Error(`git ls-files a échoué : ${sortie.stderr}`);
  return sortie.stdout.split("\0").filter((chemin) => chemin !== "" && !chemin.startsWith("scratch/"));
}

function principal(): void {
  const options = analyserArguments(process.argv.slice(2));
  const sources: FichierSource[] = fichiersSuivis()
    .filter(estAnalysable)
    .sort()
    .map((chemin) => ({ chemin, contenu: readFileSync(join(RACINE, chemin), "utf8") }));
  process.stdout.write(rapport(sources, drapeau(options, "tout")));
}

principal();
