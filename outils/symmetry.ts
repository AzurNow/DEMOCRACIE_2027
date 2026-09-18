/**
 * `pnpm symmetry` — contrôle bloquant avant un run.
 *
 * §5 : « le pipeline refuse de lancer un run si l'une de ces conditions échoue ». Cette commande
 * est ce refus : elle sort avec le code 1 dès qu'une condition de symétrie est rouge ou qu'un
 * invariant inter-fichiers est violé, et n'écrit rien.
 *
 *   pnpm symmetry --tirage=runs/2026-12-01/tirage.json \
 *                 --questions=runs/2026-12-01/questions.json \
 *                 --items=data/items.json \
 *                 --run=runs/2026-12-01/run.json
 *
 * Les fichiers de questions et d'items sont des tableaux JSON ; un répertoire n'est pas lu, pour
 * que le fichier contrôlé soit exactement celui qui sera publié.
 */

import { readFileSync } from "node:fs";
import { analyserArguments, obligatoire } from "./arguments.ts";
import {
  grappeSuitItemPrincipal,
  itemsFictifsPointentMesureFictive,
} from "../pipeline/questions/invariants.ts";
import type { PorteurDeGrappe, Violation } from "../pipeline/questions/invariants.ts";
import { verifierSymetrie } from "../pipeline/questions/symetrie.ts";
import type {
  ConditionSymetrie,
  Item,
  Mesure,
  Question,
  RunAuGel,
  Symetrie,
  Tirage,
} from "../pipeline/questions/types.ts";

interface Entrees {
  readonly tirage: Tirage;
  readonly questions: readonly Question[];
  readonly items: readonly Item[];
  /** `undefined` quand `--mesures` n'est pas fourni : l'invariant est alors annoncé non contrôlé. */
  readonly mesures: readonly Mesure[] | undefined;
  readonly run: RunAuGel;
}

function lireJson<T>(chemin: string): T {
  return JSON.parse(readFileSync(chemin, "utf8")) as T;
}

function lireEntrees(): Entrees {
  const table = analyserArguments(process.argv.slice(2));
  const mesures = table.get("mesures");
  return {
    tirage: lireJson<Tirage>(obligatoire(table, "tirage", "le tirage gelé du run")),
    questions: lireJson<readonly Question[]>(
      obligatoire(table, "questions", "les questions publiées du run"),
    ),
    items: lireJson<readonly Item[]>(obligatoire(table, "items", "les items de référence")),
    // Sans référentiel de mesures, l'invariant « item F ⇒ mesure fictive » n'est pas
    // vérifiable. Il est alors annoncé comme non contrôlé, jamais supposé vert et jamais
    // rendu rouge par l'absence même du fichier.
    mesures: mesures === undefined ? undefined : lireJson<readonly Mesure[]>(mesures),
    run: lireJson<RunAuGel>(obligatoire(table, "run", "le périmètre et la date de gel du run")),
  };
}

function porteursDeGrappe(entrees: Entrees): readonly PorteurDeGrappe[] {
  const questions: readonly PorteurDeGrappe[] = entrees.questions;
  const tirage: readonly PorteurDeGrappe[] = entrees.tirage.entrees.map((entree) => ({
    id: entree.question_id,
    grappe_id: entree.grappe_id,
    items: entree.items_au_gel,
  }));
  return [...questions, ...tirage];
}

function violations(entrees: Entrees): readonly Violation[] {
  const grappes = grappeSuitItemPrincipal(porteursDeGrappe(entrees));
  if (entrees.mesures === undefined) return grappes;
  return [...grappes, ...itemsFictifsPointentMesureFictive(entrees.items, entrees.mesures)];
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

function imprimerInvariants(liste: readonly Violation[], entrees: Entrees): void {
  process.stdout.write("Invariants inter-fichiers\n");
  if (entrees.mesures === undefined) {
    process.stdout.write(
      "  non contrôlé : « un item F pointe une mesure fictive » — passer --mesures=<fichier>\n",
    );
  }
  if (liste.length === 0) {
    process.stdout.write("  aucune violation\n\n");
    return;
  }
  for (const violation of liste) {
    process.stderr.write(`  ${violation.invariant} — ${violation.objet} : ${violation.detail}\n`);
  }
  process.stderr.write("\n");
}

function principal(): void {
  const entrees = lireEntrees();
  const symetrie = verifierSymetrie(entrees.tirage, entrees.questions, entrees.items, entrees.run);
  const liste = violations(entrees);

  imprimerSymetrie(symetrie);
  imprimerInvariants(liste, entrees);

  if (symetrie.statut_global === "rouge" || liste.length > 0) {
    process.stderr.write("Le run ne peut pas être lancé : voir ci-dessus (§5).\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Contrôles verts : le run peut être lancé.\n");
}

principal();
