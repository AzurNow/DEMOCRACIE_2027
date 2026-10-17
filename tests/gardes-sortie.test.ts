/**
 * `pipeline/gardes-sortie.ts` : les deux gardes de sortie partagées (zones protégées, `runs/`) et
 * leurs briques communes (`cheminReel`, `estSous`), isolément des commandes qui les appellent.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  estSous,
  estSousRuns,
  exigerHorsDeRuns,
  exigerHorsDesZonesProtegees,
  RUNS_DU_DEPOT,
  SimuleSousRuns,
  SimuleSousZoneProtegee,
} from "../pipeline/gardes-sortie.ts";

const repertoires: string[] = [];
function temporaire(prefixe = "banc-gardes-sortie-"): string {
  const chemin = mkdtempSync(join(tmpdir(), prefixe));
  repertoires.push(chemin);
  return chemin;
}
afterEach(() => {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

describe("estSous", () => {
  it("vrai pour le répertoire lui-même et pour un descendant", () => {
    const racine = temporaire();
    expect(estSous(racine, racine)).toBe(true);
    expect(estSous(join(racine, "a", "b"), racine)).toBe(true);
  });

  it("faux pour un répertoire voisin au nom préfixé", () => {
    const racine = temporaire();
    expect(estSous(`${racine}-bis`, racine)).toBe(false);
  });

  it("vrai à travers un lien symbolique posé hors du répertoire qui y mène", () => {
    const racine = temporaire();
    const lien = join(temporaire(), "raccourci");
    symlinkSync(racine, lien);
    expect(estSous(join(lien, "sous"), racine)).toBe(true);
  });
});

describe("exigerHorsDesZonesProtegees", () => {
  const zones = ["staging", "data", "runs"] as const;

  it.each(zones)("refuse une sortie sous %s/ du dépôt, nommé SimuleSousZoneProtegee", (zone) => {
    const depot = temporaire();
    const sortie = join(depot, zone, "essai");
    expect(() => exigerHorsDesZonesProtegees(sortie, depot)).toThrow(SimuleSousZoneProtegee);
  });

  it("refuse le chemin de la zone protégée elle-même, sans sous-répertoire", () => {
    const depot = temporaire();
    expect(() => exigerHorsDesZonesProtegees(join(depot, "data"), depot)).toThrow(SimuleSousZoneProtegee);
  });

  it("refuse un lien symbolique posé hors du dépôt qui mène sous data/", () => {
    const depot = temporaire();
    mkdirSync(join(depot, "data"), { recursive: true });
    const lien = join(temporaire(), "raccourci");
    symlinkSync(join(depot, "data"), lien);
    expect(() => exigerHorsDesZonesProtegees(join(lien, "essai"), depot)).toThrow(SimuleSousZoneProtegee);
  });

  it("accepte un répertoire voisin au nom préfixé (data-bis/)", () => {
    const depot = temporaire();
    expect(() => exigerHorsDesZonesProtegees(join(depot, "data-bis"), depot)).not.toThrow();
  });

  it("accepte une sortie temporaire hors du dépôt", () => {
    const depot = temporaire();
    expect(() => exigerHorsDesZonesProtegees(temporaire(), depot)).not.toThrow();
  });
});

describe("exigerHorsDeRuns et estSousRuns", () => {
  it("refuse runs/ du dépôt et ses descendants, nommé SimuleSousRuns", () => {
    expect(() => exigerHorsDeRuns(RUNS_DU_DEPOT)).toThrow(SimuleSousRuns);
    expect(() => exigerHorsDeRuns(join(RUNS_DU_DEPOT, "2026-10-17"))).toThrow(SimuleSousRuns);
  });

  it("un lien symbolique posé hors de runs/ qui y mène est refusé comme le chemin direct", () => {
    const lien = join(temporaire(), "raccourci-runs");
    symlinkSync(RUNS_DU_DEPOT, lien);
    expect(estSousRuns(join(lien, "2026-10-17"))).toBe(true);
    expect(() => exigerHorsDeRuns(join(lien, "2026-10-17"))).toThrow(SimuleSousRuns);
  });

  it("accepte un répertoire hors de runs/", () => {
    expect(estSousRuns(temporaire())).toBe(false);
    expect(() => exigerHorsDeRuns(temporaire())).not.toThrow();
  });
});
