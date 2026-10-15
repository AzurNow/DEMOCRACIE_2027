/**
 * `pnpm promote` et `data/mesures/` (lot mesures-validees, décision D38, option (a)) : chaque mesure
 * citée par un item promu entre dans `data/mesures/` en même temps que lui, dans sa version courante.
 * Tous les contrôles, items et mesures, passent avant la première écriture : un seul refus et rien
 * n'est écrit, ni item ni mesure.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { valider } from "../outils/schemas/valider.ts";
import type { Item, Mesure } from "../validation/domaine/types.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { executerOutil, initialiserDepot } from "./aides/depot.ts";
import { decision, itemP, mesure } from "./aides/fabriques.ts";

const MESURE_ID = "01JBANCESSA90000000MESVRE1";

function chemins(bac: Bac): readonly string[] {
  return [
    `--racine=${bac.racine}`,
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--arbitrage=${join(bac.racine, "validation/arbitrage")}`,
    `--data=${join(bac.racine, "data/items")}`,
    `--data-mesures=${join(bac.racine, "data/mesures")}`,
  ];
}

function versionDeux(base: Mesure): Mesure {
  const historique = [
    ...(base as unknown as { historique: readonly unknown[] }).historique,
    { date: "2026-10-01T10:00:00+02:00", changement: "libellé précisé", commit: "c".repeat(40), version_resultante: 2 },
  ];
  return { ...base, version: 2, libelle: "TVA réduite sur toute l'énergie", historique } as Mesure;
}

interface Scenario {
  /** La mesure du dossier, dans staging/mesures/. */
  readonly staging: Mesure;
  /** Le texte déjà présent dans data/mesures/<id>.json, s'il y en a un. */
  readonly publiee?: string;
  /** Nombre d'items du lot, tous sur la même mesure. */
  readonly items?: number;
}

interface Bilan {
  readonly bac: Bac;
  readonly items: readonly Item[];
  readonly status: number | null;
  readonly sortie: string;
  readonly erreur: string;
}

function cheminMesureData(bac: Bac): string {
  return join(bac.racine, "data/mesures", `${MESURE_ID}.json`);
}

function preparer(scenario: Scenario): { bac: Bac; items: readonly Item[] } {
  const bac = creerBac();
  const items = Array.from({ length: scenario.items ?? 1 }, (_, rang) =>
    itemP({
      id: `01JBANCESSA10000000000TEM${rang + 1}`,
      candidat_id: `demo-${rang + 1}`,
      mesure_id: MESURE_ID,
      mesure_version: scenario.staging.version,
    }),
  );
  for (const item of items) bac.ecrireItem(item);
  bac.ecrireMesure(scenario.staging);
  bac.ecrireLot(lotDe("lot-061", items));
  for (const item of items) {
    for (const annotateur_id of ["a1", "a2"]) {
      bac.journal(annotateur_id).ajouter("lot-061", decision({ annotateur_id, item, decision: "accepter", lot_id: "lot-061" }));
    }
  }
  if (scenario.publiee !== undefined) {
    mkdirSync(join(bac.racine, "data/mesures"), { recursive: true });
    writeFileSync(cheminMesureData(bac), scenario.publiee, "utf8");
  }
  initialiserDepot(bac.racine);
  return { bac, items };
}

function promouvoir(scenario: Scenario, ecrire = true): Bilan {
  const { bac, items } = preparer(scenario);
  const resultat = executerOutil("promote.ts", [...chemins(bac), ...(ecrire ? ["--ecrire"] : [])]);
  return { bac, items, ...resultat };
}

function itemsEcrits(bac: Bac): readonly string[] {
  const repertoire = join(bac.racine, "data/items");
  return existsSync(repertoire) ? readdirSync(repertoire) : [];
}

describe("cas 1 : première promotion d'une mesure", () => {
  const bilan = promouvoir({ staging: mesure() });
  afterAll(() => bilan.bac.detruire());

  it("crée data/mesures/<id>.json, conforme au schéma, égal à la mesure du staging", () => {
    expect(bilan.status, bilan.erreur).toBe(0);
    const ecrite = JSON.parse(readFileSync(cheminMesureData(bilan.bac), "utf8")) as unknown;
    expect(() => valider("mesure", ecrite, "mesure écrite")).not.toThrow();
    expect(ecrite).toEqual(mesure());
    expect(itemsEcrits(bilan.bac)).toEqual([`${bilan.items[0]?.id}.json`]);
  });

  it("annonce la création et met data/mesures dans la commande de commit", () => {
    expect(bilan.sortie).toMatch(/Mesures à créer : 1/);
    expect(bilan.sortie).toMatch(/1 mesure\(s\) créée\(s\), 0 réécrite\(s\)/);
    expect(bilan.sortie).toMatch(/git add data\/items data\/mesures/);
    expect(bilan.sortie).toContain(`mesure ${MESURE_ID} version 1, créée`);
  });
});

describe("cas 2 : deux items du même lot citent la même mesure", () => {
  const bilan = promouvoir({ staging: mesure(), items: 2 });
  afterAll(() => bilan.bac.detruire());

  it("un seul fichier de mesure, une seule écriture, les deux items écrits", () => {
    expect(bilan.status, bilan.erreur).toBe(0);
    expect(readdirSync(join(bilan.bac.racine, "data/mesures"))).toEqual([`${MESURE_ID}.json`]);
    expect(bilan.sortie).toMatch(/Mesures à créer : 1\n/);
    expect(bilan.sortie).toMatch(/1 mesure\(s\) créée\(s\)/);
    expect(itemsEcrits(bilan.bac)).toHaveLength(2);
  });
});

describe("cas 3 : mesure déjà présente, identique", () => {
  // Clés dans un autre ordre, sur une ligne : identique à la structure près, pas au texte près.
  const publiee = JSON.stringify(Object.fromEntries(Object.entries(mesure()).reverse()));
  const { bac, items } = preparer({ staging: mesure(), publiee });
  const avant = statSync(cheminMesureData(bac));
  const resultat = executerOutil("promote.ts", [...chemins(bac), "--ecrire"]);
  afterAll(() => bac.detruire());

  it("aucune écriture de la mesure, et le rapport le dit ; l'item est écrit", () => {
    expect(resultat.status, resultat.erreur).toBe(0);
    expect(readFileSync(cheminMesureData(bac), "utf8")).toBe(publiee);
    const apres = statSync(cheminMesureData(bac));
    expect(apres.ino).toBe(avant.ino);
    expect(apres.mtimeMs).toBe(avant.mtimeMs);
    expect(resultat.sortie).toMatch(/Mesures déjà dans data\/, identiques : 1/);
    expect(resultat.sortie).toMatch(/0 mesure\(s\) créée\(s\), 0 réécrite\(s\)/);
    expect(itemsEcrits(bac)).toEqual([`${items[0]?.id}.json`]);
  });
});

describe("cas 4 : même version, contenu différent", () => {
  const publiee = JSON.stringify(mesure({ libelle: "TVA réduite sur le gaz seul" }));
  const bilan = promouvoir({ staging: mesure(), publiee });
  afterAll(() => bilan.bac.detruire());

  it("code non nul, refus nommé, ni item ni mesure écrits", () => {
    expect(bilan.status).toBe(1);
    expect(bilan.sortie).toContain(`${MESURE_ID}  meme_version_contenu_different`);
    expect(bilan.erreur).toMatch(/rien n'est écrit/);
    expect(itemsEcrits(bilan.bac)).toEqual([]);
    expect(readFileSync(cheminMesureData(bilan.bac), "utf8")).toBe(publiee);
  });
});

describe("cas 5 : version du staging supérieure à celle de data/", () => {
  const bilan = promouvoir({ staging: versionDeux(mesure()), publiee: JSON.stringify(mesure()) });
  afterAll(() => bilan.bac.detruire());

  it("réécrit la mesure en version courante, conforme au schéma", () => {
    expect(bilan.status, bilan.erreur).toBe(0);
    const ecrite = JSON.parse(readFileSync(cheminMesureData(bilan.bac), "utf8")) as unknown;
    expect(() => valider("mesure", ecrite, "mesure réécrite")).not.toThrow();
    expect(ecrite).toEqual(versionDeux(mesure()));
    expect(bilan.sortie).toMatch(/Mesures à réécrire : 1/);
    expect(bilan.sortie).toContain(`${MESURE_ID}  version 1 → 2`);
    expect(bilan.sortie).toMatch(/0 mesure\(s\) créée\(s\), 1 réécrite\(s\)/);
  });
});

describe("cas 6 : version du staging inférieure à celle de data/", () => {
  const publiee = JSON.stringify(versionDeux(mesure()));
  const bilan = promouvoir({ staging: mesure(), publiee });
  afterAll(() => bilan.bac.detruire());

  it("code non nul, régression nommée, rien n'est écrit", () => {
    expect(bilan.status).toBe(1);
    expect(bilan.sortie).toContain(`${MESURE_ID}  regression_de_version`);
    expect(itemsEcrits(bilan.bac)).toEqual([]);
    expect(readFileSync(cheminMesureData(bilan.bac), "utf8")).toBe(publiee);
  });
});

describe("cas 7 : mesure du dossier non conforme au schéma", () => {
  // `chargerStaging` la refuse déjà à la lecture ; le refus au plan est couvert par
  // `tests/data-mesures.test.ts` (« cas 7 »). Ici : la commande s'arrête et n'écrit rien.
  const bilan = promouvoir({ staging: mesure({ libelle: "x" }) });
  afterAll(() => bilan.bac.detruire());

  it("code non nul, schéma nommé, ni item ni mesure écrits", () => {
    expect(bilan.status).not.toBe(0);
    expect(bilan.erreur).toContain("« mesure »");
    expect(itemsEcrits(bilan.bac)).toEqual([]);
    expect(existsSync(join(bilan.bac.racine, "data/mesures"))).toBe(false);
  });
});

describe("cas 8 : simulation, sans --ecrire", () => {
  const bilan = promouvoir({ staging: mesure() }, false);
  afterAll(() => bilan.bac.detruire());

  it("rien n'est écrit, les mesures à créer sont annoncées", () => {
    expect(bilan.status, bilan.erreur).toBe(0);
    expect(bilan.sortie).toMatch(/Mesures à créer : 1/);
    expect(bilan.sortie).toContain(`  ${MESURE_ID}  version 1`);
    expect(bilan.sortie).toMatch(/Simulation : rien n'a été écrit/);
    expect(existsSync(join(bilan.bac.racine, "data"))).toBe(false);
  });
});
