/**
 * Le registre des relectures de mesure sur disque : `validation/mesures/relectures.json`
 * (décision D53 (1) du 2026-10-16), à côté du registre des corrections de thème
 * (`mesures-fichier.ts`), dont il reprend les propriétés :
 *
 * 1. **Ajout seul.** Ce module ne fait que lire. La commande qui y ajoute une relecture viendra à
 *    part ; aucune fonction ici ne modifie ni ne supprime une entrée. Deux entrées identiques sont
 *    inoffensives.
 * 2. **Une corruption bloque au lieu d'être rattrapée.** Un fichier illisible ou une entrée
 *    malformée arrêtent la commande. Ignorer une ligne fautive pourrait faire tomber une
 *    relecture sans que personne ne le sache ; en tolérer une mal formée pourrait laisser entrer
 *    dans `data/` une mesure que personne n'a relue.
 *
 * Chaque entrée est confrontée à `relecture-mesure.schema.json`, puis à `validerEntreeRelecture`,
 * qui en construit la valeur typée.
 *
 * Un fichier **absent** est un registre vide, et non une erreur : aucune mesure n'a encore été
 * relue. Toute mesure à créer ou à réécrire est alors refusée par la promotion.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
  if (!existsSync(chemin)) return [];
  const brut = analyser(readFileSync(chemin, "utf8"), chemin);
  return brut.map((valeur, index) => validerEntree(valeur, `${chemin}, entrée ${index + 1}`));
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
