/**
 * Ordre d'affichage : reproductible à graine égale, jamais deux items du même candidat à la
 * suite, et un échec bruyant quand la contrainte est infaisable.
 */

import { describe, expect, it } from "vitest";
import {
  adjacenceRespectee,
  composerLots,
  OrdreImpossible,
  ordreAffichage,
} from "../validation/domaine/lot.ts";
import type { ItemDuLot, Lot } from "../validation/domaine/types.ts";

function item(candidat_id: string, rang: number): ItemDuLot {
  return {
    item_id: `${candidat_id}-${String(rang).padStart(3, "0")}`,
    item_version: 1,
    item_empreinte: "a".repeat(64),
    candidat_id,
  };
}

/** Répartition réaliste : douze candidats, effectifs inégaux, cinquante items. */
function lotRealiste(graine: string): Lot {
  const effectifs = [8, 7, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1];
  const items: ItemDuLot[] = [];
  effectifs.forEach((effectif, index) => {
    const candidat = `cand-${String.fromCharCode(97 + index)}`;
    for (let rang = 0; rang < effectif; rang += 1) items.push(item(candidat, rang));
  });
  return {
    lot_id: "lot-001",
    nature: "reel",
    graine_maitresse: graine,
    algorithme_ordre: "ordre-annotateur-v1",
    date_creation: "2026-09-17T10:00:00+02:00",
    annotateurs: ["a1", "a2"],
    items,
  };
}

describe("ordre d'affichage", () => {
  it("est reproductible à graine, lot et annotateur identiques", () => {
    const lot = lotRealiste("graine-du-run");
    const premier = ordreAffichage(lot, "a1").map((entree) => entree.item_id);
    const second = ordreAffichage(lot, "a1").map((entree) => entree.item_id);
    expect(second).toEqual(premier);
  });

  it("diffère d'un annotateur à l'autre : aucun effet d'ordre partagé", () => {
    const lot = lotRealiste("graine-du-run");
    const pourA1 = ordreAffichage(lot, "a1").map((entree) => entree.item_id);
    const pourA2 = ordreAffichage(lot, "a2").map((entree) => entree.item_id);
    expect(pourA2).not.toEqual(pourA1);
  });

  it("change avec la graine", () => {
    const avant = ordreAffichage(lotRealiste("graine-un"), "a1").map((e) => e.item_id);
    const apres = ordreAffichage(lotRealiste("graine-deux"), "a1").map((e) => e.item_id);
    expect(apres).not.toEqual(avant);
  });

  it("conserve exactement les items du lot, sans perte ni doublon", () => {
    const lot = lotRealiste("graine-du-run");
    const ordonne = ordreAffichage(lot, "a1").map((entree) => entree.item_id).sort();
    expect(ordonne).toEqual(lot.items.map((entree) => entree.item_id).sort());
  });

  it("n'enchaîne jamais deux items du même candidat, sur cent graines", () => {
    for (let graine = 0; graine < 100; graine += 1) {
      for (const annotateur of ["a1", "a2"]) {
        const ordre = ordreAffichage(lotRealiste(`graine-${graine}`), annotateur);
        expect(adjacenceRespectee(ordre), `graine ${graine}, annotateur ${annotateur}`).toBe(true);
      }
    }
  });

  it("tient le cas limite : un candidat occupant exactement la moitié arrondie au supérieur", () => {
    // 5 items dont 3 pour le même candidat : ceil(5/2) = 3, donc faisable, et une seule
    // disposition possible — A, X, A, Y, A.
    const lot: Lot = {
      ...lotRealiste("peu-importe"),
      items: [item("cand-a", 0), item("cand-a", 1), item("cand-a", 2), item("cand-b", 0), item("cand-c", 0)],
    };
    const ordre = ordreAffichage(lot, "a1");
    expect(adjacenceRespectee(ordre)).toBe(true);
    expect(ordre.map((entree) => entree.candidat_id).filter((c) => c === "cand-a")).toHaveLength(3);
  });

  it("lève au lieu de dégrader silencieusement quand la contrainte est infaisable", () => {
    const lot: Lot = {
      ...lotRealiste("peu-importe"),
      items: [item("cand-a", 0), item("cand-a", 1), item("cand-a", 2), item("cand-a", 3), item("cand-b", 0)],
    };
    expect(() => ordreAffichage(lot, "a1")).toThrow(OrdreImpossible);
    try {
      ordreAffichage(lot, "a1");
    } catch (erreur) {
      const impossible = erreur as OrdreImpossible;
      expect(impossible.candidat_id).toBe("cand-a");
      expect(impossible.effectif).toBe(4);
      expect(impossible.taille).toBe(5);
    }
  });

  it("supporte un lot vide et un lot d'un seul item", () => {
    const vide: Lot = { ...lotRealiste("g"), items: [] };
    expect(ordreAffichage(vide, "a1")).toEqual([]);
    const unique: Lot = { ...lotRealiste("g"), items: [item("cand-a", 0)] };
    expect(ordreAffichage(unique, "a1")).toHaveLength(1);
  });
});

describe("composition des lots", () => {
  const reserve = Array.from({ length: 125 }, (_, index) =>
    item(`cand-${String.fromCharCode(97 + (index % 12))}`, index),
  );

  it("partitionne la réserve : chaque item une fois et une seule", () => {
    const lots = composerLots(reserve, 50, "graine-composition");
    const tous = lots.flat().map((entree) => entree.item_id).sort();
    expect(tous).toEqual(reserve.map((entree) => entree.item_id).sort());
    expect(lots.map((lot) => lot.length)).toEqual([50, 50, 25]);
  });

  it("est reproductible, et dépend de la graine", () => {
    const premier = composerLots(reserve, 50, "graine-a").map((lot) => lot.map((e) => e.item_id));
    const second = composerLots(reserve, 50, "graine-a").map((lot) => lot.map((e) => e.item_id));
    const autre = composerLots(reserve, 50, "graine-b").map((lot) => lot.map((e) => e.item_id));
    expect(second).toEqual(premier);
    expect(autre).not.toEqual(premier);
  });

  it("ne dépend pas de l'ordre de lecture des fichiers de staging", () => {
    const melange = [...reserve].reverse();
    const attendu = composerLots(reserve, 50, "graine-a").map((lot) => lot.map((e) => e.item_id));
    const obtenu = composerLots(melange, 50, "graine-a").map((lot) => lot.map((e) => e.item_id));
    expect(obtenu).toEqual(attendu);
  });
});
