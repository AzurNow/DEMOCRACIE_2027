/**
 * Bac d'essai : un dépôt jetable, dans un répertoire temporaire, avec son staging, ses lots et
 * ses journaux. Les tests d'intégration exécutent les vraies routes dessus, sans ouvrir de port.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { empreinteDe } from "../../validation/domaine/empreinte.ts";
import type { EntreeJournal, Item, Lot, Mesure } from "../../validation/domaine/types.ts";
import { creerContexte, type Configuration, type Contexte } from "../../validation/serveur/contexte.ts";
import { JournalAnnotateur } from "../../validation/io/journal-fichier.ts";
import { mesure } from "./fabriques.ts";

export interface Bac {
  readonly racine: string;
  readonly configuration: (annotateur_id: string) => Configuration;
  contexte(annotateur_id: string): Contexte;
  journal(annotateur_id: string): JournalAnnotateur;
  ecrireItem(item: Item): void;
  ecrireMesure(mesure: Mesure): void;
  ecrireTexte(sha256: string, texte: string): void;
  ecrireLot(lot: Lot): void;
  detruire(): void;
}

export function creerBac(): Bac {
  const racine = mkdtempSync(join(tmpdir(), "banc-essai-"));
  for (const sous of [
    "staging/items",
    "staging/mesures",
    "staging/textes",
    "staging/transcriptions",
    "validation/lots",
    "validation/decisions",
    "validation/brouillons",
    "schema",
  ]) {
    mkdirSync(join(racine, sous), { recursive: true });
  }

  // Le serveur lit les dix thèmes dans le schéma : le bac en fournit une copie minimale.
  writeFileSync(
    join(racine, "schema/commun.schema.json"),
    JSON.stringify({
      $defs: {
        theme: { enum: ["fiscalite_pouvoir_achat", "retraites", "sante"] },
        position: { enum: ["pour", "contre", "conditionnel", "sans_objet"] },
      },
    }),
    "utf8",
  );

  const configuration = (annotateur_id: string): Configuration => ({
    racine_depot: racine,
    racine_staging: join(racine, "staging"),
    repertoire_lots: join(racine, "validation/lots"),
    repertoire_decisions: join(racine, "validation/decisions"),
    repertoire_brouillons: join(racine, "validation/brouillons"),
    repertoire_data: join(racine, "data/items"),
    annotateur_id,
  });

  return {
    racine,
    configuration,
    contexte: (annotateur_id: string) => creerContexte(configuration(annotateur_id)),
    journal: (annotateur_id: string) =>
      new JournalAnnotateur(join(racine, "validation/decisions"), annotateur_id),
    ecrireItem(item: Item) {
      writeFileSync(join(racine, "staging/items", `${item.id}.json`), JSON.stringify(item), "utf8");
    },
    ecrireMesure(valeur: Mesure) {
      writeFileSync(join(racine, "staging/mesures", `${valeur.id}.json`), JSON.stringify(valeur), "utf8");
    },
    ecrireTexte(sha256: string, texte: string) {
      writeFileSync(join(racine, "staging/textes", `${sha256}.txt`), texte, "utf8");
    },
    ecrireLot(lot: Lot) {
      writeFileSync(join(racine, "validation/lots", `${lot.lot_id}.json`), JSON.stringify(lot), "utf8");
    },
    detruire() {
      rmSync(racine, { recursive: true, force: true });
    },
  };
}

/** Lot minimal, avec les items donnés et deux annotateurs. */
export function lotDe(
  lot_id: string,
  items: readonly Item[],
  nature: Lot["nature"] = "reel",
  annotateurs: readonly string[] = ["a1", "a2"],
): Lot {
  return {
    lot_id,
    nature,
    graine_maitresse: `graine-${lot_id}`,
    algorithme_ordre: "ordre-annotateur-v1",
    date_creation: "2026-09-17T10:00:00+02:00",
    annotateurs,
    items: items.map((item) => ({
      item_id: item.id,
      item_version: item.version,
      item_empreinte: item.empreinte,
      candidat_id: item.candidat_id,
    })),
  };
}

export function mesurePour(item: Item): Mesure {
  return mesure({ id: item.mesure_id, version: item.mesure_version });
}

/** Réécrit l'empreinte d'une entrée modifiée à la main, pour simuler une écriture légitime. */
export function resceller(entree: EntreeJournal): EntreeJournal {
  const { empreinte_ligne: _ancienne, ...socle } = entree as unknown as Record<string, unknown> & {
    empreinte_ligne: string;
  };
  return { ...socle, empreinte_ligne: empreinteDe(socle) } as EntreeJournal;
}
