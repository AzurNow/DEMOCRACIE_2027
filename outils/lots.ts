/**
 * `pnpm lots` — composition des lots de validation.
 *
 * Les lots sont **communs aux deux annotateurs** : sans items communs, il n'y a pas de kappa.
 * L'affectation des items aux lots est tirée à partir d'une graine enregistrée dans le
 * manifeste, comme l'exige le §5 pour tout tirage, et un manifeste n'est jamais réécrit.
 *
 * L'ordre d'affichage, lui, n'est pas stocké : il se recalcule pour chaque annotateur à partir
 * de la même graine. La commande le vérifie tout de même à la composition, pour qu'un lot
 * impossible à ordonner soit connu maintenant et non au milieu d'une séance d'annotation.
 *
 *   pnpm lots --nature=entrainement --taille=30 --annotateurs=a1,a2 --graine=lot-ent-2026-11
 *   pnpm lots --nature=reel --taille=50 --annotateurs=a1,a2 --graine=lots-2026-11
 *
 * Réannotation (§4) : un lot dont le kappa tombe strictement sous 0,80 est rejugé après une
 * séance de calibration, dont la date est exigée — sans elle, le kappa du nouveau lot n'est pas
 * interprétable. Le lot produit reprend les items du lot d'origine et le supersède.
 *
 *   pnpm lots --reannote=lot-003 --calibration=2026-11-24 --graine=reannotation-2026-11
 */

import { resolve } from "node:path";
import { analyserArguments, drapeau, entier, obligatoire, texte, type Arguments } from "./arguments.ts";
import {
  adjacenceRespectee,
  composerLots,
  ordreAffichage,
  OrdreImpossible,
  preparerReannotation,
} from "../validation/domaine/lot.ts";
import type { ItemDuLot, Lot, NatureLot } from "../validation/domaine/types.ts";
import { lireLots, ecrireLot } from "../validation/io/lots-fichier.ts";
import { chargerStaging } from "../validation/io/staging.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";

interface Options {
  readonly nature: NatureLot;
  readonly taille: number;
  readonly annotateurs: readonly string[];
  readonly graine: string;
  readonly prefixe: string;
  readonly ecrire: boolean;
  readonly racine: string;
  readonly staging: string;
  readonly lots: string;
  /** Lot d'origine à réannoter. Chaîne vide : composition ordinaire. */
  readonly reannote: string;
  /** Date civile de la séance de calibration. `null` hors réannotation. */
  readonly calibration: string | null;
}

const DATE_CIVILE = /^\d{4}-\d{2}-\d{2}$/;

function lireOptions(bruts: readonly string[]): Options {
  const table = analyserArguments(bruts);
  const racine = resolve(import.meta.dirname, "..");
  const nature = texte(table, "nature", "reel") as NatureLot;
  const entrainement = nature === "entrainement";
  const reannote = texte(table, "reannote", "");

  return {
    nature,
    // §4 : trente items d'entraînement, cinquante par lot réel.
    taille: entier(table, "taille", entrainement ? 30 : 50),
    annotateurs: texte(table, "annotateurs", "").split(",").filter((nom) => nom.length > 0),
    graine: obligatoire(table, "graine", "c'est elle qui rend la composition reproductible."),
    prefixe: texte(table, "prefixe", entrainement ? "ent" : "lot"),
    ecrire: drapeau(table, "ecrire"),
    racine,
    staging: texte(table, "staging", resolve(racine, "staging")),
    lots: texte(table, "lots", resolve(racine, "validation/lots")),
    reannote,
    calibration: reannote.length === 0 ? null : dateDeCalibration(table),
  };
}

/** Sans date de séance, le kappa d'un lot de réannotation n'est pas interprétable (§4). */
function dateDeCalibration(table: Arguments): string {
  const valeur = obligatoire(
    table,
    "calibration",
    "un lot de réannotation porte la date de la séance de calibration, sans laquelle son kappa " +
      "n'est pas interprétable (§4).",
  );
  if (!DATE_CIVILE.test(valeur)) {
    throw new Error(`--calibration attend une date civile AAAA-MM-JJ : ${JSON.stringify(valeur)}`);
  }
  return valeur;
}

function itemsDisponibles(options: Options): readonly ItemDuLot[] {
  const staging = chargerStaging(options.staging);
  const dejaPris = new Set<string>();
  for (const lot of lireLots(options.lots)) {
    for (const entree of lot.items) dejaPris.add(entree.item_id);
  }

  const disponibles: ItemDuLot[] = [];
  for (const item of staging.items.values()) {
    if (dejaPris.has(item.id)) continue;
    if (item.statut_validation !== "en_attente") continue;
    if (item.statut_contestation !== "aucune") continue;
    disponibles.push({
      item_id: item.id,
      item_version: item.version,
      item_empreinte: item.empreinte,
      candidat_id: item.candidat_id,
    });
  }
  return disponibles;
}

function construireLots(options: Options, disponibles: readonly ItemDuLot[]): readonly Lot[] {
  const paquets = composerLots(disponibles, options.taille, options.graine);
  const date = instantLocal(new Date());
  return paquets.map((items, index) => ({
    lot_id: `${options.prefixe}-${String(index + 1).padStart(3, "0")}`,
    nature: options.nature,
    graine_maitresse: options.graine,
    algorithme_ordre: "ordre-annotateur-v1",
    date_creation: date,
    annotateurs: options.annotateurs,
    items,
  }));
}

/** Un lot impossible à ordonner doit être connu maintenant, pas au milieu d'une séance. */
function verifierOrdres(lot: Lot): void {
  for (const annotateur of lot.annotateurs) {
    const ordre = ordreAffichage(lot, annotateur);
    if (!adjacenceRespectee(ordre)) {
      throw new Error(`Lot ${lot.lot_id} : ordre invalide pour ${annotateur}`);
    }
  }
}

/**
 * Un lot de réannotation reprend les items du lot d'origine **sans passer par la réserve** : ces
 * items appartiennent déjà à un lot, et ce sont précisément eux qu'il faut rejuger. Ses
 * annotateurs sont ceux du lot d'origine, sans quoi son kappa ne remplacerait pas le leur.
 */
function principalReannotation(options: Options): void {
  if (options.annotateurs.length > 0) {
    throw new Error(
      "--annotateurs ne s'emploie pas avec --reannote : un lot de réannotation reprend les " +
        "annotateurs du lot d'origine, faute de quoi son kappa ne remplacerait pas le leur (§4).",
    );
  }

  const lot = preparerReannotation(lireLots(options.lots), {
    origine_id: options.reannote,
    graine_maitresse: options.graine,
    date_calibration: options.calibration as string,
    date_creation: instantLocal(new Date()),
  });
  verifierOrdres(lot);

  process.stdout.write(
    `${lot.lot_id} : réannotation de ${lot.reannote}, ${lot.items.length} item(s) repris,\n` +
      `  séance de calibration du ${lot.date_calibration}, annotateurs ${lot.annotateurs.join(", ")},\n` +
      `  ordre vérifié. Le lot d'origine reste publié ; ses décisions ne comptent plus pour ces items.\n`,
  );

  if (!options.ecrire) {
    process.stdout.write("\nSimulation. Ajouter --ecrire pour écrire le manifeste.\n");
    return;
  }
  ecrireLot(options.lots, lot);
  process.stdout.write(`\nManifeste écrit dans ${options.lots}\n`);
}

function principal(): void {
  const options = lireOptions(process.argv.slice(2));
  if (options.reannote.length > 0) {
    principalReannotation(options);
    return;
  }
  if (options.annotateurs.length !== 2) {
    throw new Error("--annotateurs attend exactement deux identifiants, séparés par une virgule.");
  }

  const disponibles = itemsDisponibles(options);
  const lots = construireLots(options, disponibles);

  process.stdout.write(
    `${disponibles.length} item(s) disponible(s) → ${lots.length} lot(s) de ${options.taille}\n`,
  );

  for (const lot of lots) {
    try {
      verifierOrdres(lot);
    } catch (erreur) {
      if (erreur instanceof OrdreImpossible) {
        process.stdout.write(`  ${lot.lot_id} : ${erreur.message}\n`);
        process.exitCode = 1;
        return;
      }
      throw erreur;
    }
    process.stdout.write(`  ${lot.lot_id} : ${lot.items.length} items, ordre vérifié\n`);
  }

  if (!options.ecrire) {
    process.stdout.write("\nSimulation. Ajouter --ecrire pour écrire les manifestes.\n");
    return;
  }
  for (const lot of lots) ecrireLot(options.lots, lot);
  process.stdout.write(`\n${lots.length} manifeste(s) écrit(s) dans ${options.lots}\n`);
}

principal();
