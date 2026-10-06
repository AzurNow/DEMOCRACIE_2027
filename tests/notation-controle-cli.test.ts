/**
 * `pnpm notation:controle <repertoire_run>` en ligne de commande (lot notation, PR C, cas limite 10
 * du brief) : 0 sur un run propre, 1 sur un run avec une violation, 2 sur un répertoire illisible.
 * Le run est le petit run fictif de `tests/notation/run-fictif.ts`, sous un répertoire temporaire.
 */

import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dispositionRunNote } from "../analysis/lecture-run.ts";
import { executerOutil } from "./aides/depot.ts";
import { ecrireJson, poserRunNote, type RunFictif } from "./notation/run-fictif.ts";

let courant: RunFictif | null = null;

afterEach(() => {
  courant?.nettoyer();
  courant = null;
});

function runNote(): RunFictif {
  courant = poserRunNote();
  return courant;
}

describe("10. pnpm notation:controle", () => {
  it("run propre : code 0, aucune violation", () => {
    const run = runNote();
    const resultat = executerOutil("notation-controle.ts", [run.repertoire_run]);
    expect(resultat.erreur).not.toContain("violation(s)");
    expect(resultat.sortie).toContain("aucune violation");
    expect(resultat.status).toBe(0);
  });

  it("run avec une violation : code 1, la violation est imprimée", () => {
    const run = runNote();
    const chemin = dispositionRunNote(run.repertoire_run).run_json;
    const lu = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
    ecrireJson(chemin, { ...lu, taux_echantillon_humain: 0.25 });
    const resultat = executerOutil("notation-controle.ts", [run.repertoire_run]);
    expect(resultat.erreur).toContain("taux_echantillon_incoherent");
    expect(resultat.status).toBe(1);
  });

  it("répertoire illisible : code 2, l'erreur est nommée", () => {
    const run = runNote();
    const resultat = executerOutil("notation-controle.ts", [join(run.bac, "runs", "2026-12-02")]);
    expect(resultat.erreur).toContain("non exécuté");
    expect(resultat.status).toBe(2);
  });

  it("volume non reconstitué : code 2, il faut le reconstituer", () => {
    const run = runNote();
    rmSync(dispositionRunNote(run.repertoire_run).volume, { recursive: true });
    const resultat = executerOutil("notation-controle.ts", [run.repertoire_run]);
    expect(resultat.erreur).toContain("VolumeAbsent");
    expect(resultat.erreur).toContain("Reconstituer volume/");
    expect(resultat.status).toBe(2);
  });

  it("appel sans répertoire, ou avec une option inconnue : code 2", () => {
    expect(executerOutil("notation-controle.ts", []).status).toBe(2);
    expect(executerOutil("notation-controle.ts", ["--run=runs/2026-12-01"]).status).toBe(2);
  });
});
