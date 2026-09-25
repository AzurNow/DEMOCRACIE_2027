/**
 * Manifestes de lots. Écrits une fois par `pnpm lots`, lus ensuite ; jamais réécrits — un lot
 * dont la composition change après coup rend son kappa incomparable à celui du lot d'avant.
 *
 * Le manifeste est commun aux deux annotateurs : sans items communs, il n'y a pas de kappa.
 * Il ne contient aucune décision, sa lecture ne dit donc rien de ce que l'autre a fait.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Lot, NatureLot } from "../domaine/types.ts";

const NATURES_CONNUES: readonly NatureLot[] = ["entrainement", "reel", "reannotation"];

/**
 * Un manifeste de lot dont `nature` est inconnue, ou dont une réannotation ne porte pas
 * `reannote` ou `date_calibration`. Ni l'un ni l'autre n'est un lot ordinaire lisible tel quel :
 * sans `date_calibration`, le kappa du lot n'est pas interprétable (§4, réannotation après
 * calibration), et un `nature` hors des trois valeurs connues signale un manifeste écrit par un
 * outil désynchronisé du domaine plutôt qu'un cas particulier à tolérer.
 */
export class ManifesteLotInvalide extends Error {
  constructor(chemin: string, detail: string) {
    super(`Manifeste de lot invalide (${chemin}) : ${detail}`);
    this.name = "ManifesteLotInvalide";
  }
}

function estNatureConnue(valeur: unknown): valeur is NatureLot {
  return typeof valeur === "string" && (NATURES_CONNUES as readonly string[]).includes(valeur);
}

function validerNature(lot: Lot, chemin: string): void {
  if (!estNatureConnue(lot.nature)) {
    throw new ManifesteLotInvalide(
      chemin,
      `nature "${String(lot.nature)}" inconnue (attendu : ${NATURES_CONNUES.join(", ")}).`,
    );
  }
}

function validerReannotation(lot: Lot, chemin: string): void {
  if (lot.nature !== "reannotation") return;
  if (lot.reannote === undefined) {
    throw new ManifesteLotInvalide(
      chemin,
      "nature=reannotation sans reannote : impossible de savoir quel lot d'origine ce lot supersède.",
    );
  }
  if (lot.date_calibration === undefined) {
    throw new ManifesteLotInvalide(
      chemin,
      "nature=reannotation sans date_calibration : le kappa de ce lot n'est pas interprétable sans " +
        "la date de la séance de calibration qui l'a déclenché (§4).",
    );
  }
}

function lireEtValiderLot(chemin: string): Lot {
  const lot = JSON.parse(readFileSync(chemin, "utf8")) as Lot;
  validerNature(lot, chemin);
  validerReannotation(lot, chemin);
  return lot;
}

export function lireLots(repertoire: string): readonly Lot[] {
  if (!existsSync(repertoire)) return [];
  return readdirSync(repertoire)
    .filter((nom) => nom.endsWith(".json"))
    .sort()
    .map((nom) => lireEtValiderLot(join(repertoire, nom)));
}

export function lireLot(repertoire: string, lot_id: string): Lot | null {
  const chemin = join(repertoire, `${lot_id}.json`);
  if (!existsSync(chemin)) return null;
  return lireEtValiderLot(chemin);
}

export class LotDejaExistant extends Error {
  constructor(lot_id: string) {
    super(
      `Le lot ${lot_id} existe déjà. Un manifeste de lot n'est jamais réécrit : sa composition ` +
        `et sa graine sont ce qui rend son kappa reproductible.`,
    );
    this.name = "LotDejaExistant";
  }
}

export function ecrireLot(repertoire: string, lot: Lot): void {
  ecrireLots(repertoire, [lot]);
}

/**
 * Écrit une composition **tout ou rien** : chaque identifiant et chaque chemin sont vérifiés
 * avant la première écriture. Une collision découverte au troisième lot laisserait sinon deux
 * manifestes orphelins, dont les items ne seraient plus disponibles pour la composition suivante.
 */
export function ecrireLots(repertoire: string, lots: readonly Lot[]): void {
  const chemins = verifierAvantEcriture(repertoire, lots);
  mkdirSync(repertoire, { recursive: true });
  lots.forEach((lot, index) => {
    writeFileSync(chemins[index] as string, `${JSON.stringify(lot, null, 2)}\n`, "utf8");
  });
}

function verifierAvantEcriture(repertoire: string, lots: readonly Lot[]): readonly string[] {
  const vus = new Set<string>();
  return lots.map((lot) => {
    if (vus.has(lot.lot_id)) {
      throw new Error(
        `Composition refusée : l'identifiant ${lot.lot_id} y figure deux fois. Aucun manifeste écrit.`,
      );
    }
    vus.add(lot.lot_id);
    const chemin = join(repertoire, `${lot.lot_id}.json`);
    if (existsSync(chemin)) throw new LotDejaExistant(lot.lot_id);
    return chemin;
  });
}
