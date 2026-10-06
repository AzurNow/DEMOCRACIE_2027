/**
 * Dérangement des candidats du test contrefactuel (§7, D14 (2)). Cas limites 1 et 15 du brief de la
 * PR B du lot notation.
 */

import { describe, expect, it } from "vitest";
import { graineDerivee, graineHexadecimale } from "../../analysis/graines.ts";
import {
  CLE_DERANGEMENT_CANDIDATS,
  correspondancesDe,
  tirerDerangement,
  verifierCandidats,
} from "../../pipeline/notation/derangement.ts";
import { GENERATEUR_DU_TIRAGE, GraineNonConforme } from "../../pipeline/questions/tirage.ts";
import type { GraineTirage } from "../../pipeline/questions/types.ts";
import type { CandidatDuRun } from "../../pipeline/notation/types.ts";
import { generateur, melanger } from "../../validation/domaine/alea.ts";
import { CANDIDATS_DU_RUN } from "./fabriques.ts";

function graine(valeur: number): GraineTirage {
  return { valeur, ...GENERATEUR_DU_TIRAGE };
}

function candidats(n: number): CandidatDuRun[] {
  return Array.from({ length: n }, (_, i) => {
    const rang = String(i).padStart(2, "0");
    return { candidat_id: `cand-${rang}`, libelle: `Prenom${rang} Nom${rang}`, nom: `Nom${rang}` };
  });
}

describe("dérangement des candidats", () => {
  it("n'a aucun point fixe, sur cent graines et des effectifs de 2 à 12", () => {
    for (let valeur = 0; valeur < 100; valeur += 1) {
      for (const n of [2, 3, 5, 12]) {
        const paires = tirerDerangement(candidats(n), graine(valeur)).paires;
        expect(paires).toHaveLength(n);
        for (const paire of paires) expect(paire.image.candidat_id).not.toBe(paire.source.candidat_id);
        // Une permutation : chaque candidat est image exactement une fois.
        expect(new Set(paires.map((p) => p.image.candidat_id)).size).toBe(n);
      }
    }
  });

  it("même graine, même dérangement", () => {
    const a = tirerDerangement(candidats(7), graine(20261202));
    const b = tirerDerangement(candidats(7), graine(20261202));
    expect(correspondancesDe(a)).toEqual(correspondancesDe(b));
  });

  it("l'ordre d'entrée des candidats est indifférent", () => {
    const ranges = candidats(7);
    const inverses = [...ranges].reverse();
    const melanges = [ranges[3], ranges[0], ranges[6], ranges[1], ranges[5], ranges[2], ranges[4]] as CandidatDuRun[];
    const reference = correspondancesDe(tirerDerangement(ranges, graine(42)));
    expect(correspondancesDe(tirerDerangement(inverses, graine(42)))).toEqual(reference);
    expect(correspondancesDe(tirerDerangement(melanges, graine(42)))).toEqual(reference);
  });

  it("une graine qui déclare un autre générateur lève GraineNonConforme", () => {
    expect(() => tirerDerangement(candidats(3), { ...graine(1), algorithme: "mt19937" })).toThrow(GraineNonConforme);
    expect(() => tirerDerangement(candidats(3), { ...graine(1), version: "0.0.0" })).toThrow(GraineNonConforme);
  });

  it("un seul candidat, ou aucun, lève : il n'a aucun dérangement", () => {
    expect(() => tirerDerangement(candidats(1), graine(1))).toThrow(/au moins deux candidats/);
    expect(() => tirerDerangement([], graine(1))).toThrow(/au moins deux candidats/);
  });

  it("deux candidats : le dérangement est l'échange, quelle que soit la graine", () => {
    for (let valeur = 0; valeur < 20; valeur += 1) {
      expect(correspondancesDe(tirerDerangement(candidats(2), graine(valeur)))).toEqual({ "cand-00": "cand-01", "cand-01": "cand-00" });
    }
  });

  it("la règle publiée se rejoue à la main : rangement par identifiant, mélanges successifs jusqu'au premier sans point fixe", () => {
    const ranges = candidats(5);
    const rng = generateur(graineDerivee(777, CLE_DERANGEMENT_CANDIDATS));
    let images = melanger(ranges, rng);
    while (images.some((c, i) => c.candidat_id === ranges[i]?.candidat_id)) {
      images = melanger(ranges, rng);
    }
    const attendu = Object.fromEntries(ranges.map((c, i) => [c.candidat_id, images[i]?.candidat_id]));
    expect(correspondancesDe(tirerDerangement([...ranges].reverse(), graine(777)))).toEqual(attendu);
  });

  it("valeur de référence figée : le tirage est publié, il ne doit pas bouger", () => {
    expect(CLE_DERANGEMENT_CANDIDATS).toEqual(["contrefactuel", "noms_candidats", "derangement"]);
    // printf '20261202\0contrefactuel\0noms_candidats\0derangement' | shasum -a 256 | cut -c1-16
    expect(graineHexadecimale(20261202, CLE_DERANGEMENT_CANDIDATS)).toBe("c9d33002bc1d79c7");
    expect(correspondancesDe(tirerDerangement(candidats(5), graine(20261202)))).toEqual(VALEUR_FIGEE);
  });

  it("les candidats du run de test donnent un dérangement des trois", () => {
    const paires = tirerDerangement(CANDIDATS_DU_RUN, graine(20261202)).paires;
    expect(paires.map((p) => p.source.candidat_id)).toEqual(["demo-alpha", "demo-beta", "demo-gamma"]);
  });
});

/** Graine 20261202, cinq candidats `cand-00` à `cand-04` : figé le 2026-10-06. */
const VALEUR_FIGEE: Readonly<Record<string, string>> = {
  "cand-00": "cand-03",
  "cand-01": "cand-00",
  "cand-02": "cand-04",
  "cand-03": "cand-02",
  "cand-04": "cand-01",
};

describe("candidats déclarés", () => {
  const base: CandidatDuRun[] = [
    { candidat_id: "a", libelle: "Alix Martinez", nom: "Martinez" },
    { candidat_id: "b", libelle: "Maxime Le Brun", nom: "Le Brun" },
  ];

  it("deux candidats au même nom seul lèvent", () => {
    const doublon = [...base, { candidat_id: "c", libelle: "Paul Martinez", nom: "Martinez" }];
    expect(() => verifierCandidats(doublon)).toThrow(/« Martinez »/);
    expect(() => tirerDerangement(doublon, graine(1))).toThrow(/« Martinez »/);
  });

  it("deux candidats au même libellé lèvent", () => {
    expect(() => verifierCandidats([...base, { candidat_id: "c", libelle: "Alix Martinez", nom: "Autre" }])).toThrow(/« Alix Martinez »/);
  });

  it("un libellé égal au nom seul d'un autre candidat lève : la forme serait ambiguë", () => {
    expect(() => verifierCandidats([...base, { candidat_id: "c", libelle: "Le Brun", nom: "Brun" }])).toThrow(/« Le Brun »/);
  });

  it("un identifiant de candidat en double lève", () => {
    expect(() => verifierCandidats([...base, { candidat_id: "a", libelle: "Paul Autre", nom: "Autre" }])).toThrow(/identifiant/);
  });

  it("un nom vide ou blanc lève", () => {
    expect(() => verifierCandidats([...base, { candidat_id: "c", libelle: "Paul Autre", nom: "  " }])).toThrow(/vide/);
    expect(() => verifierCandidats([...base, { candidat_id: "c", libelle: "", nom: "Autre" }])).toThrow(/vide/);
  });
});
