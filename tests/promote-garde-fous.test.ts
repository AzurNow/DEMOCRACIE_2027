/**
 * Deux garde-fous de `pnpm promote` (revue du 2026-09-23, constats 3 et 4), vérifiés sur la
 * simulation, qui annonce exactement ce que `--ecrire` fera :
 *
 * - un item jugé dans un lot mais absent de `staging/` est nommé, et la commande sort en erreur :
 *   il ne disparaît plus de la promotion sans trace ;
 * - un item déjà présent dans `data/` n'est jamais réécrit : relancer la promotion est sans effet
 *   sur lui, et le rapport le dit.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Item } from "../validation/domaine/types.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { decision, itemP, mesure } from "./aides/fabriques.ts";

const RACINE = resolve(import.meta.dirname, "..");

function poserItem(bac: Bac, suffixe: string): Item {
  const item = itemP({
    id: `01JBANCESSAI00000ITEM${suffixe}`,
    candidat_id: `demo-${suffixe}`,
    mesure_id: `01JBANCESSA90000000MESVR${suffixe}`,
  });
  bac.ecrireItem(item);
  bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
  return item;
}

function accepterParLesDeux(bac: Bac, item: Item, lot_id: string): void {
  for (const annotateur of ["a1", "a2"]) {
    bac.journal(annotateur).ajouter(lot_id, decision({ annotateur_id: annotateur, item, decision: "accepter", lot_id }));
  }
}

function simuler(bac: Bac) {
  const resultat = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      join(RACINE, "outils/promote.ts"),
      `--staging=${join(bac.racine, "staging")}`,
      `--lots=${join(bac.racine, "validation/lots")}`,
      `--decisions=${join(bac.racine, "validation/decisions")}`,
      `--mesures=${join(bac.racine, "validation/mesures")}`,
      `--data=${join(bac.racine, "data/items")}`,
    ],
    { encoding: "utf8" },
  );
  return { status: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}

describe("item d'un lot introuvable dans staging", () => {
  const bac = creerBac();
  const present = poserItem(bac, "71");
  const disparu = itemP({ id: "01JBANCESSAI00000ITEM72", candidat_id: "demo-72", mesure_id: present.mesure_id });
  bac.ecrireLot(lotDe("lot-007", [present, disparu]));
  accepterParLesDeux(bac, present, "lot-007");
  accepterParLesDeux(bac, disparu, "lot-007");
  const resultat = simuler(bac);
  afterAll(() => bac.detruire());

  it("est nommé avec son lot dans le rapport", () => {
    expect(resultat.sortie).toMatch(/Items des lots introuvables dans staging : 1/);
    expect(resultat.sortie).toMatch(new RegExp(`${disparu.id}\\s+\\[lot-007\\]`));
  });

  it("fait sortir la commande en erreur, sans empêcher d'évaluer les autres", () => {
    expect(resultat.status).toBe(1);
    expect(resultat.sortie).toMatch(new RegExp(`${present.id}\\s+verifie`));
  });
});

describe("item déjà présent dans data/", () => {
  const bac = creerBac();
  const nouveau = poserItem(bac, "81");
  const dejaPromu = poserItem(bac, "82");
  bac.ecrireLot(lotDe("lot-008", [nouveau, dejaPromu]));
  accepterParLesDeux(bac, nouveau, "lot-008");
  accepterParLesDeux(bac, dejaPromu, "lot-008");
  mkdirSync(join(bac.racine, "data/items"), { recursive: true });
  writeFileSync(join(bac.racine, "data/items", `${dejaPromu.id}.json`), "{}\n", "utf8");
  const resultat = simuler(bac);
  afterAll(() => bac.detruire());

  it("est annoncé comme non réécrit, et seul le nouvel item reste à écrire", () => {
    expect(resultat.status).toBe(0);
    expect(resultat.sortie).toMatch(/Déjà dans data\/, non réécrits : 1/);
    expect(resultat.sortie).toMatch(new RegExp(`${dejaPromu.id}\\s+\\[lot-008\\]`));
    expect(resultat.sortie).toMatch(/À écrire par --ecrire : 1/);
  });
});
