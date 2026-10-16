/**
 * Le registre des relectures de mesure sur disque : `validation/mesures/relectures.json`
 * (décision D53 (1) du 2026-10-16), à côté du registre des corrections de thème
 * (`mesures-fichier.ts`), dont il reprend les propriétés :
 *
 * 1. **Ajout seul.** La seule écriture est `ajouterRelecture`, appelée par
 *    `pnpm mesures --relire --ecrire` : elle relit les entrées existantes, les réécrit telles
 *    quelles dans leur ordre et ajoute la nouvelle en fin. Aucune fonction ici ne modifie ni ne
 *    supprime une entrée. Deux entrées identiques sont inoffensives.
 * 2. **Une corruption bloque au lieu d'être rattrapée.** Un fichier illisible ou une entrée
 *    malformée arrêtent la commande. Ignorer une ligne fautive pourrait faire tomber une
 *    relecture sans que personne ne le sache ; en tolérer une mal formée pourrait laisser entrer
 *    dans `data/` une mesure que personne n'a relue.
 *
 * Chaque entrée est confrontée à `relecture-mesure.schema.json`, puis à `validerEntreeRelecture`,
 * qui en construit la valeur typée, à la lecture comme avant l'écriture.
 *
 * L'écriture est atomique (temporaire puis renommage), refusée si le fichier a changé depuis sa
 * lecture, et le registre est relu après la pose (`poserRegistreAjoutSeul`, partagée avec le
 * registre des rattachements, `rattachements-fichier.ts`).
 *
 * Un fichier **absent** est un registre vide, et non une erreur : aucune mesure n'a encore été
 * relue. Toute mesure à créer ou à réécrire est alors refusée par la promotion.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import {
  validerEntreeRelecture,
  type RegistreRelecturesMesure,
  type RelectureMesure,
} from "../domaine/relectures-mesure.ts";

export const NOM_FICHIER_RELECTURES = "relectures.json";

export function cheminRelectures(repertoire: string): string {
  return join(repertoire, NOM_FICHIER_RELECTURES);
}

export class RegistreRelecturesIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(
      `Registre des relectures de mesure illisible : ${chemin}\n${detail}\n` +
        `Rien n'est réparé automatiquement : ce fichier est la trace publiée des relectures de ` +
        `l'auteur, et aucune mesure n'entre dans data/ sans elle.`,
    );
    this.name = "RegistreRelecturesIllisible";
  }
}

export function lireRelectures(repertoire: string): RegistreRelecturesMesure {
  const chemin = cheminRelectures(repertoire);
  const texte = texteDuRegistre(chemin);
  return texte === null ? [] : entreesDe(texte, chemin);
}

function entreesDe(texte: string, chemin: string): RegistreRelecturesMesure {
  return analyser(texte, chemin).map((valeur, index) => validerEntree(valeur, `${chemin}, entrée ${index + 1}`));
}

function validerEntree(valeur: unknown, provenance: string): RelectureMesure {
  return validerEntreeRelecture(valider("relecture-mesure", valeur, provenance), provenance);
}

function analyser(contenu: string, chemin: string): readonly unknown[] {
  const valeur = tenterJson(contenu, chemin);
  if (!Array.isArray(valeur)) throw new RegistreRelecturesIllisible(chemin, "Le registre est un tableau JSON.");
  return valeur;
}

function tenterJson(contenu: string, chemin: string): unknown {
  try {
    return JSON.parse(contenu);
  } catch (erreur) {
    throw new RegistreRelecturesIllisible(chemin, erreur instanceof Error ? erreur.message : String(erreur));
  }
}

/**
 * Ajoute une relecture en fin de registre ; le crée s'il est absent. Les entrées antérieures sont
 * relues, validées et réécrites telles quelles, dans leur ordre : la réécriture n'est qu'un ajout.
 * Rend le registre relu après la pose.
 */
export function ajouterRelecture(repertoire: string, entree: RelectureMesure): RegistreRelecturesMesure {
  const chemin = cheminRelectures(repertoire);
  const validee = validerEntree(entree, `relecture à enregistrer dans ${chemin}`);
  const lu = texteDuRegistre(chemin);
  const registre = [...(lu === null ? [] : entreesDe(lu, chemin)), validee];
  poserRegistreAjoutSeul(chemin, lu, registre);
  const relu = lireRelectures(repertoire);
  if (relu.length !== registre.length) {
    throw new RegistreRelecturesIllisible(chemin, `Relu après écriture : ${relu.length} entrée(s), ${registre.length} attendue(s).`);
  }
  return relu;
}

/* ------------------------------------------------- pose d'un registre en ajout seul */

/** Un registre a changé entre sa lecture et la pose de sa nouvelle version : rien n'est posé. */
export class RegistreModifieDepuisLecture extends Error {
  constructor(chemin: string) {
    super(`${chemin} a changé depuis sa lecture. Rien n'est écrit : relancer la commande, qui relira l'état courant.`);
    this.name = "RegistreModifieDepuisLecture";
  }
}

/** Le texte du registre, ou `null` s'il n'existe pas encore : une absence dite, jamais comblée. */
export function texteDuRegistre(chemin: string): string | null {
  return existsSync(chemin) ? readFileSync(chemin, "utf8") : null;
}

/**
 * Pose `registre` à la place du fichier, s'il porte toujours le texte `lu` (`null` : absent).
 * Atomique : temporaire dans le même répertoire, contrôle au dernier moment, puis renommage.
 */
export function poserRegistreAjoutSeul(chemin: string, lu: string | null, registre: readonly unknown[]): void {
  mkdirSync(dirname(chemin), { recursive: true });
  const tmp = `${chemin}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(registre, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    if (texteDuRegistre(chemin) !== lu) throw new RegistreModifieDepuisLecture(chemin);
    renameSync(tmp, chemin);
  } finally {
    rmSync(tmp, { force: true });
  }
}
