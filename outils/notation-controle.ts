/**
 * `pnpm notation:controle <repertoire_run>` — le contrôle croisé n° 18 (§7 ; D13) sur un run
 * enregistré.
 *
 *   pnpm notation:controle runs/2026-12-01
 *
 * Lit `run.json`, les réponses du volume (`volume/reponses/`, dont les réponses obtenues de contexte
 * `run` forment la population de l'échantillon humain), les notations individuelles
 * (`volume/notations/`, avec les réponses contrefactuelles, validées au passage) et les verdicts
 * (`verdicts/`), chaque fichier validé contre son schéma (`analysis/lecture-run.ts`), puis lance
 * `pipeline/notation/controle-croise.ts:controleCroise` et imprime chaque violation.
 *
 * Codes de sortie : 0, aucune violation ; 1, au moins une violation ; 2, le run n'a pas pu être lu
 * ou contrôlé (répertoire illisible, volume non reconstitué, fichier non conforme, run incohérent),
 * ou la commande est mal appelée. Rien n'est écrit.
 */

import { estDuRun } from "../analysis/filtre.ts";
import { lireNotationsDuRun, lireReponses, lireRunJson, lireVerdicts, runDeNotationDe } from "../analysis/lecture-run.ts";
import { controleCroise, type EntreeControleCroise, type Violation } from "../pipeline/notation/controle-croise.ts";
import { analyserArguments } from "./arguments.ts";

const USAGE = "usage : pnpm notation:controle <repertoire_run>";

/** Un seul argument positionnel, le répertoire du run ; aucune option n'est reconnue. */
function repertoireDemande(bruts: readonly string[]): string {
  const options = analyserArguments(bruts);
  if (options.size > 0) throw new Error(`option(s) inconnue(s) : ${[...options.keys()].map((cle) => `--${cle}`).join(", ")}. ${USAGE}`);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire] = positionnels;
  if (repertoire === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  return repertoire;
}

function lireEntree(repertoire_run: string): EntreeControleCroise {
  const run = lireRunJson(repertoire_run);
  const reponses = lireReponses(repertoire_run, run.id);
  const { notations } = lireNotationsDuRun(repertoire_run, run.id);
  return {
    run: runDeNotationDe(run),
    reponses_obtenues: reponses.filter((r) => estDuRun(r) && r.statut_reponse === "obtenue").map((r) => r.id),
    notations,
    verdicts: lireVerdicts(repertoire_run, run.id),
  };
}

function ligne(violation: Violation): string {
  const verdict = violation.verdict_id === undefined ? "run" : `verdict ${violation.verdict_id}`;
  return `  ${violation.code} — ${verdict} : ${violation.detail}\n`;
}

function controler(bruts: readonly string[]): readonly Violation[] | Error {
  try {
    const repertoire = repertoireDemande(bruts);
    return controleCroise(lireEntree(repertoire));
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw erreur;
  }
}

function principal(): void {
  const resultat = controler(process.argv.slice(2));
  if (resultat instanceof Error) {
    process.stderr.write(`Contrôle croisé (n° 18) non exécuté — ${resultat.name} :\n  ${resultat.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (resultat.length === 0) {
    process.stdout.write("Contrôle croisé (n° 18) : aucune violation.\n");
    return;
  }
  process.stderr.write(`Contrôle croisé (n° 18) : ${resultat.length} violation(s).\n`);
  for (const violation of resultat) process.stderr.write(ligne(violation));
  process.exitCode = 1;
}

principal();
