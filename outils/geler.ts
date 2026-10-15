/**
 * `pnpm geler` — gel d'un run (lot gel, PR 1 ; décisions D41, D44).
 *
 *   pnpm geler --type-run=<type> --graines-fixes=<fichier.json> [--sortie=<répertoire>]
 *
 * Écrit, en une fois et tout ou rien, `run.json`, `tirage.json` et `questions.json` du run dans
 * `runs/<date>/` (sans `--sortie`) ou `<sortie>/<date>/`, où `<date>` est la date de `date_gel` à
 * Paris ; au statut `planifie`, à partir de `data/`, de `config/perimetre.yaml`, de `config/gel.json`
 * et du commit courant. Refuse, sans rien écrire et avec le code 1 : un dépôt sale, un répertoire de
 * run qui existe déjà, une `--sortie` sous `runs/`, un `config/gel.json` incomplet, une question sans
 * formulations relues sur son texte neutre et sa position courants, et un run que la barrière de
 * symétrie refuse (`pipeline/gel/barriere.ts`, les contrôles de `pnpm symmetry`).
 *
 * D41 : seul l'auteur gèle un vrai run, c'est-à-dire lance cette commande sans `--sortie`. Un agent
 * ou un test gèle toujours vers un répertoire hors de `runs/`.
 *
 * Graines : la balise drand (D40) est la PR 2. En attendant, `--graines-fixes` est obligatoire : un
 * fichier JSON des cinq valeurs (`schema/config-gel.schema.json#/$defs/graines_fixes`). Rien dans
 * `run.json` ne dit qu'elles viennent d'une balise ; un run gelé ainsi ne remplit pas le §5.
 *
 * `--type-run` : l'une des valeurs de `run.schema.json#/properties/type_run`.
 */

import { resolve } from "node:path";
import { analyserArguments, obligatoire } from "./arguments.ts";
import { validerFragment } from "./schemas/valider.ts";
import { lireJson } from "../pipeline/gel/barriere.ts";
import { geler } from "../pipeline/gel/geler.ts";
import type { ResultatGel } from "../pipeline/gel/geler.ts";
import { ecrireExclusif } from "../pipeline/gel/ecriture.ts";
import { grainesFixes } from "../pipeline/gel/graines.ts";
import { MOTIFS_EXCLUSION } from "../pipeline/questions/types.ts";
import { ulid } from "../validation/domaine/ulid.ts";

const RACINE = resolve(import.meta.dirname, "..");
const OPTIONS: readonly string[] = ["type-run", "graines-fixes", "sortie"];

const AVERTISSEMENT_GRAINES =
  "Graines fixes (--graines-fixes) : l'adaptateur de la balise drand (D40) n'existe pas encore. Un run gelé\n" +
  "ainsi ne remplit pas le §5 (« Nul, l'auteur compris, ne peut connaître une graine avant le gel »).\n";

function imprimer(resultat: ResultatGel): void {
  const exclusions = MOTIFS_EXCLUSION.map((motif) => [motif, resultat.tirage.exclusions.filter((e) => e.motif === motif).length] as const)
    .filter(([, nombre]) => nombre > 0)
    .map(([motif, nombre]) => `${motif} ${nombre}`)
    .join(", ");
  process.stdout.write(
    `Run gelé (statut planifie) — ${resultat.repertoire}\n` +
      `  id ${resultat.run_id}, commit ${resultat.commit}\n` +
      `  ${resultat.questions.length} question(s) engendrée(s) au gel, ${resultat.tirage.entrees.length} tirée(s)\n` +
      `  ${resultat.tirage.exclusions.length} exclue(s) du tirage${exclusions.length === 0 ? "" : ` (${exclusions})`}\n` +
      `  symétrie : ${resultat.symetrie.statut_global}\n`,
  );
}

async function principal(): Promise<void> {
  const table = analyserArguments(process.argv.slice(2), OPTIONS);
  const type_run = validerFragment<string>(
    "run",
    "#/properties/type_run",
    obligatoire(table, "type-run", "le type du run (run.schema.json#/properties/type_run), sans valeur par défaut"),
    "--type-run",
  );
  const chemin_graines = obligatoire(
    table,
    "graines-fixes",
    "les cinq graines du run, tant que l'adaptateur de la balise drand (D40) n'existe pas",
  );
  const source_graines = grainesFixes(lireJson(chemin_graines), chemin_graines);
  process.stderr.write(AVERTISSEMENT_GRAINES);
  const resultat = await geler({
    racine: RACINE,
    sortie: table.get("sortie"),
    type_run,
    source_graines,
    identifiant: () => ulid(),
    ecrire: ecrireExclusif,
  });
  imprimer(resultat);
}

principal().catch((erreur: unknown) => {
  const message = erreur instanceof Error ? `${erreur.name} : ${erreur.message}` : String(erreur);
  process.stderr.write(`${message}\nRien n'est écrit.\n`);
  process.exitCode = 1;
});
