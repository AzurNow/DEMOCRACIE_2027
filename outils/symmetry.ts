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
 *                 --mesures=runs/2026-12-01/mesures.json \
 *                 --run=runs/2026-12-01/run.json
 *
 * Les cinq options sont obligatoires. `--items` désigne un répertoire, un fichier JSON par item :
 * c'est la disposition de `data/items/`, lue en ordre de nom de fichier. Les questions et les
 * mesures sont des tableaux JSON. `--mesures` n'est pas facultatif : sans lui, l'invariant
 * « un item F pointe une mesure fictive » ne serait pas contrôlé, et la règle 4 de CLAUDE.md
 * interdit qu'un contrôle de la barrière se saute.
 *
 * Chaque objet lu — tirage, questions, items, mesures, run — est confronté à son JSON Schema
 * avant tout contrôle : une entrée non conforme arrête la commande avec le code 1.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyserArguments, obligatoire } from "./arguments.ts";
import { valider } from "./schemas/valider.ts";
import type { NomSchema } from "./schemas/noms.ts";
import {
  grappeSuitItemPrincipal,
  itemsFictifsPointentMesureFictive,
  premisseFausseSurItemFOuO,
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
  readonly mesures: readonly Mesure[];
  readonly run: RunAuGel;
}

function lireJson(chemin: string): unknown {
  return JSON.parse(readFileSync(chemin, "utf8"));
}

function lireObjet<T>(nom: NomSchema, chemin: string): T {
  return valider<T>(nom, lireJson(chemin), chemin);
}

/** Un tableau JSON dont chaque élément est validé, avec son rang dans la provenance. */
function lireTableau<T>(nom: NomSchema, chemin: string): readonly T[] {
  const brut = lireJson(chemin);
  if (!Array.isArray(brut)) throw new Error(`${chemin} : un tableau JSON de « ${nom} » est attendu.`);
  return brut.map((valeur: unknown, rang) => valider<T>(nom, valeur, `${chemin}, élément ${rang}`));
}

/**
 * Un répertoire d'items, un fichier par item, en ordre de nom : l'ordre de lecture ne dépend pas
 * du système de fichiers. Un répertoire sans item est une erreur : un contrôle qui ne porte sur
 * rien n'est pas un contrôle vert.
 */
function lireRepertoireItems(repertoire: string): readonly Item[] {
  const fichiers = readdirSync(repertoire)
    .filter((nom) => nom.endsWith(".json"))
    .sort();
  if (fichiers.length === 0) {
    throw new Error(`${repertoire} : aucun fichier d'item (*.json). Rien à contrôler n'est une erreur.`);
  }
  return fichiers.map((nom) => lireObjet<Item>("item", join(repertoire, nom)));
}

function lireEntrees(): Entrees {
  const table = analyserArguments(process.argv.slice(2));
  const chemins = {
    tirage: obligatoire(table, "tirage", "le tirage gelé du run"),
    questions: obligatoire(table, "questions", "les questions publiées du run"),
    items: obligatoire(table, "items", "le répertoire des items de référence, un fichier par item"),
    mesures: obligatoire(
      table,
      "mesures",
      "le référentiel des mesures, sans lequel l'invariant « item F ⇒ mesure fictive » n'est pas contrôlé",
    ),
    run: obligatoire(table, "run", "le périmètre et la date de gel du run"),
  };
  return {
    tirage: lireObjet<Tirage>("tirage", chemins.tirage),
    questions: lireTableau<Question>("question", chemins.questions),
    items: lireRepertoireItems(chemins.items),
    mesures: lireTableau<Mesure>("mesure", chemins.mesures),
    run: lireObjet<RunAuGel>("run", chemins.run),
  };
}

function porteursDeGrappe(entrees: Entrees): readonly PorteurDeGrappe[] {
  const questions: readonly PorteurDeGrappe[] = entrees.questions;
  const tirage: readonly PorteurDeGrappe[] = entrees.tirage.entrees.map((entree) => ({
    id: entree.question_id,
    gabarit: entree.gabarit,
    grappe_id: entree.grappe_id,
    items: entree.items_au_gel,
  }));
  return [...questions, ...tirage];
}

function violations(entrees: Entrees): readonly Violation[] {
  const grappes = grappeSuitItemPrincipal(porteursDeGrappe(entrees), entrees.items);
  // §5 (protocole 0.3) : une prémisse fausse hors d'un item F ou O fausserait le dénominateur de
  // la confirmation de prémisse (§8). Les questions et les items suffisent à le vérifier.
  const premisses = premisseFausseSurItemFOuO(entrees.questions, entrees.items);
  return [
    ...grappes,
    ...premisses,
    ...itemsFictifsPointentMesureFictive(entrees.items, entrees.mesures),
  ];
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

function principal(): void {
  const entrees = lireEntrees();
  const symetrie = verifierSymetrie(entrees.tirage, entrees.questions, entrees.items, entrees.run);
  const liste = violations(entrees);

  imprimerSymetrie(symetrie);
  imprimerInvariants(liste);

  if (symetrie.statut_global === "rouge" || liste.length > 0) {
    process.stderr.write("Le run ne peut pas être lancé : voir ci-dessus (§5).\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Contrôles verts : le run peut être lancé.\n");
}

principal();
