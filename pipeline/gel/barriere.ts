/**
 * La barrière de symétrie (§5, règle 4 de `CLAUDE.md`), une seule fois pour ses deux appelants :
 * `pnpm symmetry` (`outils/symmetry.ts`), qui la rejoue sur les fichiers d'un run, et `pnpm geler`
 * (`outils/geler.ts`), qui la passe avant d'écrire quoi que ce soit. Extraite de `outils/symmetry.ts`
 * sans changer son comportement : mêmes lectures, mêmes contrôles, mêmes refus.
 *
 * Ce qui bloque un run, sans exception ni agrégat permissif :
 * - un refus nommé qui empêche de juger : items ou mesures qui ne sont pas ceux du commit
 *   `versions.donnees_commit` (`outils/items-au-gel.ts`), tirage d'un autre run, jeu de questions
 *   incomplet (`pipeline/questions/completude.ts`) ;
 * - une symétrie dont le statut global est `rouge` ;
 * - une violation d'un invariant inter-fichiers (`pipeline/questions/invariants.ts`).
 *
 * `ecart_tolere` ne bloque pas : l'écart est écrit dans `run.json#/symetrie` (§5, « l'écart est
 * imprimé dans le rapport du run »).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import type { NomSchema } from "../../outils/schemas/noms.ts";
import { exigerItemsDuGel, exigerMesuresDuGel, RepertoireHorsDuGel } from "../../outils/items-au-gel.ts";
import {
  grappeSuitItemPrincipal,
  itemsFictifsPointentMesureFictive,
  premisseFausseSurItemFOuO,
  unSeulItemFictifParMesure,
} from "../questions/invariants.ts";
import type { PorteurDeGrappe, Violation } from "../questions/invariants.ts";
import { JeuDeQuestionsIncomplet, TirageDUnAutreRun } from "../questions/completude.ts";
import { verifierSymetrie } from "../questions/symetrie.ts";
import type { Item, Mesure, Question, RunAuGel, Symetrie, Tirage } from "../questions/types.ts";

/* ------------------------------------------------------------------ lectures */

/** Une erreur de syntaxe nomme le fichier qui la porte : la barrière lit cinq entrées. */
export function lireJson(chemin: string): unknown {
  const contenu = readFileSync(chemin, "utf8");
  try {
    return JSON.parse(contenu);
  } catch (erreur) {
    if (!(erreur instanceof SyntaxError)) throw erreur;
    throw new SyntaxError(`${chemin} : JSON illisible (${erreur.message}).`, { cause: erreur });
  }
}

export function lireObjet<T>(nom: NomSchema, chemin: string): T {
  return valider<T>(nom, lireJson(chemin), chemin);
}

/** Un tableau JSON dont chaque élément est validé, avec son rang dans la provenance. */
export function lireTableau<T>(nom: NomSchema, chemin: string): readonly T[] {
  const brut = lireJson(chemin);
  if (!Array.isArray(brut)) throw new Error(`${chemin} : un tableau JSON de « ${nom} » est attendu.`);
  return brut.map((valeur: unknown, rang) => valider<T>(nom, valeur, `${chemin}, élément ${rang}`));
}

/**
 * Un répertoire d'objets, un fichier par objet, en ordre de nom : l'ordre de lecture ne dépend pas
 * du système de fichiers. Un répertoire absent ou sans objet est une erreur : un contrôle qui ne
 * porte sur rien n'est pas un contrôle vert. `objet` nomme ce qui manque (« d'item », « de mesure »).
 */
export function lireRepertoire<T>(nom: NomSchema, repertoire: string, objet: string): readonly T[] {
  if (!existsSync(repertoire)) {
    throw new Error(`${repertoire} : répertoire absent. Rien à contrôler n'est une erreur.`);
  }
  const fichiers = readdirSync(repertoire)
    .filter((fichier) => fichier.endsWith(".json"))
    .sort();
  if (fichiers.length === 0) {
    throw new Error(`${repertoire} : aucun fichier ${objet} (*.json). Rien à contrôler n'est une erreur.`);
  }
  return fichiers.map((fichier) => lireObjet<T>(nom, join(repertoire, fichier)));
}

/* ------------------------------------------------------------------ jugement */

/** Ce que la barrière lit du run, en plus de ce que la symétrie en lit. */
export interface RunDeLaBarriere extends RunAuGel {
  readonly versions: { readonly donnees_commit?: string };
}

/** Les entrées de la barrière, déjà lues et validées contre leur schéma. */
export interface EntreesBarriere {
  /** Le répertoire des items reçus, recoupé avec lui-même au commit du gel. */
  readonly repertoire_items: string;
  /** Le répertoire des mesures reçues, recoupé de même (dette du 2026-10-15, PR #118). */
  readonly repertoire_mesures: string;
  readonly tirage: Tirage;
  readonly questions: readonly Question[];
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  readonly run: RunDeLaBarriere;
}

/** Un refus nommé : la symétrie n'est pas évaluée. */
export type Refus = JeuDeQuestionsIncomplet | TirageDUnAutreRun | RepertoireHorsDuGel;

export function estUnRefus(erreur: unknown): erreur is Refus {
  return (
    erreur instanceof JeuDeQuestionsIncomplet || erreur instanceof TirageDUnAutreRun || erreur instanceof RepertoireHorsDuGel
  );
}

function porteursDeGrappe(entrees: EntreesBarriere): readonly PorteurDeGrappe[] {
  const questions: readonly PorteurDeGrappe[] = entrees.questions;
  const tirage: readonly PorteurDeGrappe[] = entrees.tirage.entrees.map((entree) => ({
    id: entree.question_id,
    gabarit: entree.gabarit,
    grappe_id: entree.grappe_id,
    items: entree.items_au_gel,
  }));
  return [...questions, ...tirage];
}

export function violations(entrees: EntreesBarriere): readonly Violation[] {
  const grappes = grappeSuitItemPrincipal(porteursDeGrappe(entrees), entrees.items);
  // §5 (protocoles 0.3 et 0.11) : une prémisse fausse hors d'un item F ou O, ou une formulation orientée
  // sur un item O sans position affirmée, fausserait le dénominateur de la confirmation de prémisse (§8).
  const premisses = premisseFausseSurItemFOuO(entrees.questions, entrees.items);
  return [
    ...grappes,
    ...premisses,
    ...itemsFictifsPointentMesureFictive(entrees.items, entrees.mesures),
    ...unSeulItemFictifParMesure(entrees.items),
  ];
}

/**
 * La symétrie, ou le refus nommé d'un jeu qui ne permet pas de la juger : items ou mesures qui ne
 * sont pas ceux du gel, tirage d'un autre run, jeu de questions incomplet (§5, protocole 0.13 ;
 * conformité n° 9). Seuls ces refus-là sont rattrapés, pour que les invariants inter-fichiers
 * soient encore imprimés ; toute autre erreur remonte.
 */
export function evaluerSymetrie(entrees: EntreesBarriere): Symetrie | Refus {
  try {
    exigerItemsDuGel(entrees.repertoire_items, entrees.run.versions.donnees_commit);
    exigerMesuresDuGel(entrees.repertoire_mesures, entrees.run.versions.donnees_commit);
    return verifierSymetrie(entrees.tirage, entrees.questions, entrees.items, entrees.mesures, entrees.run);
  } catch (erreur) {
    if (estUnRefus(erreur)) return erreur;
    throw erreur;
  }
}

/** Le verdict complet de la barrière : la symétrie (ou son refus) et les invariants. */
export interface VerdictBarriere {
  readonly symetrie: Symetrie | Refus;
  readonly violations: readonly Violation[];
  /** Vrai si le run ne peut pas partir : refus, symétrie rouge, ou au moins une violation. */
  readonly bloque: boolean;
}

export function jugerBarriere(entrees: EntreesBarriere): VerdictBarriere {
  const symetrie = evaluerSymetrie(entrees);
  const liste = violations(entrees);
  const bloque = estUnRefus(symetrie) || symetrie.statut_global === "rouge" || liste.length > 0;
  return { symetrie, violations: liste, bloque };
}
