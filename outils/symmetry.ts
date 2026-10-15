/**
 * `pnpm symmetry` — contrôle bloquant avant un run.
 *
 * §5 : « le pipeline refuse de lancer un run si l'une de ces conditions échoue ». Cette commande
 * est ce refus : elle sort avec le code 1 dès qu'une condition de symétrie est rouge, qu'un
 * invariant inter-fichiers est violé ou qu'un fichier lu n'est pas conforme à son schéma, et
 * n'écrit rien.
 *
 *   pnpm symmetry --tirage=runs/2026-12-01/tirage.json \
 *                 --questions=runs/2026-12-01/questions.json \
 *                 --items=data/items \
 *                 --mesures=data/mesures \
 *                 --run=runs/2026-12-01/run.json
 *
 * Les cinq options sont obligatoires. `--items` et `--mesures` désignent chacun un répertoire, un
 * fichier JSON par objet : c'est la disposition de `data/items/` et de `data/mesures/` (décision D38,
 * une mesure validée par fichier, dans sa version courante), lue en ordre de nom de fichier. Un
 * répertoire absent ou sans fichier `*.json` arrête la commande. Les questions sont un tableau JSON.
 * `--mesures` n'est pas facultatif : sans lui, l'invariant « un item F pointe une mesure fictive »
 * ne serait pas contrôlé, et la règle 4 de CLAUDE.md interdit qu'un contrôle de la barrière se saute.
 *
 * `--questions` est le jeu complet des questions engendrées au gel, publié avec le run, et non les
 * seules questions tirées ; `--items`, les items au gel. Ce répertoire est recoupé, fichier par
 * fichier, avec lui-même au commit `versions.donnees_commit` du run (conformité n° 9, décision de
 * l'auteur du 2026-10-01) : un run sans ce commit, un item en plus, en moins ou modifié depuis le gel
 * arrête la commande avec le code 1 (`outils/items-au-gel.ts`). `--mesures` est recoupé de même
 * (dette du 2026-10-15, PR #118) : une mesure en plus, en moins ou modifiée depuis le gel arrête la
 * commande avec `MesuresHorsDuGel`. Le tirage doit aussi être celui du
 * run, même `run_id`, même `date_gel` (`TirageDUnAutreRun`). §5
 * (protocole 0.13) : « un jeu incomplet est refusé ». S'il manque au jeu une question citée par le
 * tirage (entrées ou exclusions) ou engendrée sur ces items pour une mesure ou un candidat interrogé,
 * la symétrie n'est pas évaluée : `JeuDeQuestionsIncomplet` est imprimé avec les questions manquantes
 * et la commande sort avec le code 1 (`pipeline/questions/completude.ts`).
 *
 * Chaque objet lu — tirage, questions, items, mesures, run — est confronté à son JSON Schema
 * avant tout contrôle : une entrée non conforme arrête la commande avec le code 1.
 *
 * Les lectures et les contrôles vivent dans `pipeline/gel/barriere.ts`, que `pnpm geler` appelle
 * aussi avant d'écrire un run : la barrière n'est écrite qu'une fois.
 */

import { analyserArguments, obligatoire } from "./arguments.ts";
import { estUnRefus, jugerBarriere, lireObjet, lireRepertoire, lireTableau } from "../pipeline/gel/barriere.ts";
import type { EntreesBarriere, Refus, RunDeLaBarriere } from "../pipeline/gel/barriere.ts";
import type { Violation } from "../pipeline/questions/invariants.ts";
import type { ConditionSymetrie, Item, Mesure, Question, Symetrie, Tirage } from "../pipeline/questions/types.ts";

const OPTIONS: readonly string[] = ["tirage", "questions", "items", "mesures", "run"];

function lireEntrees(): EntreesBarriere {
  const table = analyserArguments(process.argv.slice(2), OPTIONS);
  const chemins = {
    tirage: obligatoire(table, "tirage", "le tirage gelé du run"),
    questions: obligatoire(table, "questions", "le jeu complet des questions engendrées au gel, publié avec le run"),
    items: obligatoire(table, "items", "le répertoire des items de référence, un fichier par item"),
    mesures: obligatoire(
      table,
      "mesures",
      "le répertoire des mesures validées, un fichier par mesure, sans lequel l'invariant « item F ⇒ mesure fictive » n'est pas contrôlé",
    ),
    run: obligatoire(table, "run", "le périmètre et la date de gel du run"),
  };
  return {
    repertoire_items: chemins.items,
    repertoire_mesures: chemins.mesures,
    tirage: lireObjet<Tirage>("tirage", chemins.tirage),
    questions: lireTableau<Question>("question", chemins.questions),
    items: lireRepertoire<Item>("item", chemins.items, "d'item"),
    mesures: lireRepertoire<Mesure>("mesure", chemins.mesures, "de mesure"),
    run: lireObjet<RunDeLaBarriere>("run", chemins.run),
  };
}

function ligneDeCondition(condition: ConditionSymetrie): string {
  const mesure = condition.mesure === undefined ? "" : ` mesure=${condition.mesure}`;
  const seuil = condition.seuil === undefined ? "" : ` seuil=${condition.seuil}`;
  const commentaire = condition.commentaire === undefined ? "" : `\n      ${condition.commentaire}`;
  return `  ${condition.statut.padEnd(13)} ${condition.code}${mesure}${seuil}${commentaire}`;
}

function imprimerSymetrie(symetrie: Symetrie): void {
  process.stdout.write("Symétrie (§5)\n");
  for (const condition of symetrie.conditions) {
    process.stdout.write(`${ligneDeCondition(condition)}\n`);
  }
  process.stdout.write(`  statut global : ${symetrie.statut_global}\n\n`);
}

function imprimerInvariants(liste: readonly Violation[]): void {
  process.stdout.write("Invariants inter-fichiers\n");
  if (liste.length === 0) {
    process.stdout.write("  aucune violation\n\n");
    return;
  }
  for (const violation of liste) {
    process.stderr.write(`  ${violation.invariant} — ${violation.objet} : ${violation.detail}\n`);
  }
  process.stderr.write("\n");
}

function imprimerRefus(refus: Refus): void {
  process.stderr.write(`Symétrie (§5) non évaluée — ${refus.name} :\n  ${refus.message}\n\n`);
}

function principal(): void {
  const { symetrie, violations: liste, bloque } = jugerBarriere(lireEntrees());

  if (estUnRefus(symetrie)) imprimerRefus(symetrie);
  else imprimerSymetrie(symetrie);
  imprimerInvariants(liste);

  if (bloque) {
    process.stderr.write("Le run ne peut pas être lancé : voir ci-dessus (§5).\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Contrôles verts : le run peut être lancé.\n");
}

principal();
