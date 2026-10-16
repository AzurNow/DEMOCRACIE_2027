/**
 * Lot gel, PR 2b : l'ordre des instants (décision D45 (4)). Un gel exécuté avant `date_gel` est
 * refusé avant tout appel réseau ; une fenêtre ouverte avant `date_gel` est refusée. L'égalité est
 * acceptée dans les deux cas. Chaque cas limite du brief a son test, nommé « instants, cas n ».
 */

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BaliseRefusee } from "../../pipeline/gel/balise.ts";
import { geler } from "../../pipeline/gel/geler.ts";
import type { OptionsGel } from "../../pipeline/gel/geler.ts";
import { exigerFenetreApresDateGel, exigerGelApresDateGel, OrdreDesInstantsRefuse } from "../../pipeline/gel/instants.ts";
import { CONFIGURATION_GEL, depotDuJeu, GEL, optionsGel } from "./fixtures.ts";
import type { Jeu } from "./fixtures.ts";
import { jeuNominal } from "./jeux.ts";
import { relaisDeFixture, waybackDeFixture } from "./reseau-fixture.ts";

const DATE = "2026-12-01";
const GEL_MS = Date.parse(GEL);
/** Le début de fenêtre des fixtures : mardi 1er décembre 2026, 06:00 à Paris. */
const FENETRE = CONFIGURATION_GEL.fenetre_debut;

const temporaires: string[] = [];

function temporaire(prefixe: string): string {
  const chemin = mkdtempSync(join(tmpdir(), prefixe));
  temporaires.push(chemin);
  return chemin;
}

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function arborescence(racine: string): readonly string[] {
  if (!existsSync(racine)) return [];
  return readdirSync(racine, { recursive: true, encoding: "utf8" }).sort();
}

function depot(jeu: Jeu): string {
  const racine = depotDuJeu(jeu);
  temporaires.push(racine);
  return racine;
}

function refusDe(action: () => void): Error {
  try {
    action();
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw new Error(`valeur levée qui n'est pas une Error : ${String(erreur)}`);
  }
  throw new Error("Accepté alors qu'un refus était attendu.");
}

async function refusDuGel(options: OptionsGel): Promise<Error> {
  try {
    await geler(options);
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw new Error(`valeur levée qui n'est pas une Error : ${String(erreur)}`);
  }
  throw new Error("Le gel a été accepté alors qu'un refus était attendu.");
}

/** Un gel du jeu nominal à cette `date_gel` et cette heure, ports enregistrés. */
function gelA(date_gel: string, maintenant: number) {
  const racine = depot(jeuNominal(date_gel));
  const sortie = temporaire("banc-gel-instants-");
  const relais = relaisDeFixture();
  const wayback = waybackDeFixture();
  const options = optionsGel(racine, sortie, { relais: relais.lire, wayback: wayback.lire, maintenant: () => maintenant });
  return { sortie, relais, wayback, options };
}

describe("instants, cas 6 : gel exécuté avant date_gel", () => {
  it("instants, cas 6 : 1 ms avant date_gel ⇒ refus nommé ; exactement à date_gel ⇒ accepté", () => {
    expect(() => exigerGelApresDateGel(GEL_MS, GEL_MS)).not.toThrow();
    const erreur = refusDe(() => exigerGelApresDateGel(GEL_MS - 1, GEL_MS));
    expect(erreur).toBeInstanceOf(OrdreDesInstantsRefuse);
    expect((erreur as OrdreDesInstantsRefuse).motif).toBe("gel_avant_date_gel");
  });

  it("instants, cas 6 : gel lancé 1 ms avant date_gel ⇒ refus, aucun appel réseau, rien écrit", async () => {
    const { sortie, relais, wayback, options } = gelA(GEL, GEL_MS - 1);
    const erreur = await refusDuGel(options);
    expect(erreur).toBeInstanceOf(OrdreDesInstantsRefuse);
    expect((erreur as OrdreDesInstantsRefuse).motif).toBe("gel_avant_date_gel");
    expect(relais.appels).toEqual([]);
    expect(wayback.appels).toEqual([]);
    expect(arborescence(sortie)).toEqual([]);
  });

  it("instants, cas 6 : gel lancé exactement à date_gel ⇒ accepté, le run est écrit", async () => {
    const { sortie, options } = gelA(GEL, GEL_MS);
    await geler(options);
    expect(arborescence(join(sortie, DATE))).toContain("run.json");
  });

  it("instants, cas 6 : date_gel passée mais son tour drand pas encore émis ⇒ BaliseRefusee, aucun appel réseau", async () => {
    // 01:00:01 n'est pas un instant d'émission de quicknet (période de 3 s) : son tour sort à 01:00:03.
    const date_gel = "2026-12-01T01:00:01+01:00";
    const { sortie, relais, wayback, options } = gelA(date_gel, Date.parse(date_gel));
    const erreur = await refusDuGel(options);
    expect(erreur).toBeInstanceOf(BaliseRefusee);
    expect((erreur as BaliseRefusee).motif).toBe("pas_encore_emis");
    expect(relais.appels).toEqual([]);
    expect(wayback.appels).toEqual([]);
    expect(arborescence(sortie)).toEqual([]);
  });
});

describe("instants, cas 7 : fenêtre ouverte avant date_gel", () => {
  it("instants, cas 7 : fenetre.debut < date_gel ⇒ refus nommé ; égal ⇒ accepté", () => {
    expect(() => exigerFenetreApresDateGel(GEL_MS, GEL_MS)).not.toThrow();
    expect(() => exigerFenetreApresDateGel(GEL_MS + 1, GEL_MS)).not.toThrow();
    const erreur = refusDe(() => exigerFenetreApresDateGel(GEL_MS - 1, GEL_MS));
    expect(erreur).toBeInstanceOf(OrdreDesInstantsRefuse);
    expect((erreur as OrdreDesInstantsRefuse).motif).toBe("fenetre_avant_date_gel");
  });

  it("instants, cas 7 : date_gel une heure après l'ouverture de la fenêtre ⇒ refus, aucun appel réseau, rien écrit", async () => {
    const date_gel = "2026-12-01T07:00:00+01:00";
    const { sortie, relais, wayback, options } = gelA(date_gel, Date.parse("2026-12-02T00:00:00Z"));
    const erreur = await refusDuGel(options);
    expect(erreur).toBeInstanceOf(OrdreDesInstantsRefuse);
    expect((erreur as OrdreDesInstantsRefuse).motif).toBe("fenetre_avant_date_gel");
    expect(relais.appels).toEqual([]);
    expect(wayback.appels).toEqual([]);
    expect(arborescence(sortie)).toEqual([]);
  });

  it("instants, cas 7 : date_gel égale à l'ouverture de la fenêtre ⇒ accepté, le run est écrit", async () => {
    const { sortie, options } = gelA(FENETRE, Date.parse("2026-12-02T00:00:00Z"));
    await geler(options);
    expect(arborescence(join(sortie, DATE))).toContain("run.json");
  });
});
