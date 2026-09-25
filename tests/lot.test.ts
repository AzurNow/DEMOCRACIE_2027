/**
 * Ordre d'affichage : reproductible à graine égale, jamais deux items du même candidat à la
 * suite, et un échec bruyant quand la contrainte est infaisable.
 */

import { describe, expect, it } from "vitest";
import {
  adjacenceRespectee,
  annoncerComposition,
  composerLots,
  OrdreImpossible,
  ordreAffichage,
  TAILLE_LOT_ENTRAINEMENT,
  TAILLE_LOT_REEL,
  TailleDeLotNonConforme,
  tailleAttendue,
  tailleDeComposition,
} from "../validation/domaine/lot.ts";
import type { ItemDuLot, Lot, NatureLot } from "../validation/domaine/types.ts";

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

describe("composition des lots : uniquement des lots complets", () => {
  function reserveDe(taille: number): ItemDuLot[] {
    return Array.from({ length: taille }, (_, index) =>
      item(`cand-${String.fromCharCode(97 + (index % 12))}`, index),
    );
  }
  const reserve = reserveDe(125);
  const identifiants = (composition: ReturnType<typeof composerLots>) => ({
    lots: composition.lots.map((lot) => lot.map((e) => e.item_id)),
    en_attente: composition.en_attente.map((e) => e.item_id),
  });

  it("partitionne la réserve : chaque item une fois et une seule, dans un lot ou en attente", () => {
    const composition = composerLots(reserve, 50, "graine-composition");
    const tous = [...composition.lots.flat(), ...composition.en_attente].map((e) => e.item_id).sort();
    expect(tous).toEqual(reserve.map((entree) => entree.item_id).sort());
    expect(composition.lots.map((lot) => lot.length)).toEqual([50, 50]);
    expect(composition.en_attente).toHaveLength(25);
  });

  it("réserve de 117, lots réels : deux lots de 50, 17 items restent disponibles et annoncés", () => {
    const composition = composerLots(reserveDe(117), TAILLE_LOT_REEL, "graine-117");
    expect(composition.lots.map((lot) => lot.length)).toEqual([50, 50]);
    expect(composition.en_attente).toHaveLength(17);
    expect(annoncerComposition(composition, TAILLE_LOT_REEL)).toContain(
      "17 items en attente d'un lot complet",
    );
  });

  it("réserve de 100 : deux lots, rien en attente", () => {
    const composition = composerLots(reserveDe(100), TAILLE_LOT_REEL, "graine-100");
    expect(composition.lots.map((lot) => lot.length)).toEqual([50, 50]);
    expect(composition.en_attente).toEqual([]);
    expect(annoncerComposition(composition, TAILLE_LOT_REEL)).toContain(
      "aucun item en attente",
    );
  });

  it("réserve de 49 : aucun lot, 49 items en attente, et le message le dit", () => {
    const composition = composerLots(reserveDe(49), TAILLE_LOT_REEL, "graine-49");
    expect(composition.lots).toEqual([]);
    expect(composition.en_attente).toHaveLength(49);
    const annonce = annoncerComposition(composition, TAILLE_LOT_REEL);
    expect(annonce).toContain("Aucun lot composé");
    expect(annonce).toContain("49 items en attente d'un lot complet de 50");
  });

  it("réserve vide : aucun lot, rien en attente", () => {
    const composition = composerLots([], TAILLE_LOT_REEL, "graine-vide");
    expect(composition).toEqual({ lots: [], en_attente: [] });
  });

  it("entraînement, réserve de 70 : deux lots de 30, 10 items en attente", () => {
    const composition = composerLots(reserveDe(70), TAILLE_LOT_ENTRAINEMENT, "graine-70");
    expect(composition.lots.map((lot) => lot.length)).toEqual([30, 30]);
    expect(composition.en_attente).toHaveLength(10);
    expect(annoncerComposition(composition, TAILLE_LOT_ENTRAINEMENT)).toContain(
      "10 items en attente d'un lot complet de 30",
    );
  });

  it("déterminisme : même réserve et même graine donnent mêmes lots et même reste", () => {
    const premier = identifiants(composerLots(reserveDe(117), 50, "graine-a"));
    const second = identifiants(composerLots(reserveDe(117), 50, "graine-a"));
    const autre = identifiants(composerLots(reserveDe(117), 50, "graine-b"));
    expect(second).toEqual(premier);
    expect(autre).not.toEqual(premier);
  });

  it("ne dépend pas de l'ordre de lecture des fichiers de staging, reste compris", () => {
    const attendu = identifiants(composerLots(reserveDe(117), 50, "graine-a"));
    const obtenu = identifiants(composerLots([...reserveDe(117)].reverse(), 50, "graine-a"));
    expect(obtenu).toEqual(attendu);
  });

  it("OrdreImpossible s'applique toujours à un lot plein", () => {
    const deseq = [
      ...Array.from({ length: 26 }, (_, rang) => item("cand-a", rang)),
      ...Array.from({ length: 24 }, (_, rang) => item(`cand-${String.fromCharCode(98 + (rang % 11))}`, rang)),
    ];
    const composition = composerLots(deseq, TAILLE_LOT_REEL, "graine-deseq");
    expect(composition.lots).toHaveLength(1);
    const lot: Lot = { ...lotRealiste("graine-deseq"), items: composition.lots[0] as ItemDuLot[] };
    expect(() => ordreAffichage(lot, "a1")).toThrow(OrdreImpossible);
    try {
      ordreAffichage(lot, "a1");
    } catch (erreur) {
      expect((erreur as OrdreImpossible).taille).toBe(50);
      expect((erreur as OrdreImpossible).effectif).toBe(26);
    }
  });

  it("les items en attente n'entrent pas dans le calcul de faisabilité de l'ordre", () => {
    // 49 items d'un seul candidat : infaisable s'il s'agissait d'un lot, mais ce n'en est pas un.
    const monoCandidat = Array.from({ length: 49 }, (_, rang) => item("cand-a", rang));
    const composition = composerLots(monoCandidat, TAILLE_LOT_REEL, "graine-mono");
    expect(composition.lots).toEqual([]);
    expect(composition.en_attente).toHaveLength(49);

    // Réserve de 117 où cand-a pèse lourd : chaque lot plein est jugé sur ses seuls items, et
    // l'effectif signalé est celui du lot, jamais celui de la réserve.
    const lourde = [
      ...Array.from({ length: 60 }, (_, rang) => item("cand-a", rang)),
      ...reserveDe(57),
    ];
    for (let graine = 0; graine < 20; graine += 1) {
      const { lots } = composerLots(lourde, TAILLE_LOT_REEL, `graine-lourde-${graine}`);
      for (const items of lots) {
        const effectifA = items.filter((e) => e.candidat_id === "cand-a").length;
        const lot: Lot = { ...lotRealiste(`g-${graine}`), items };
        if (effectifA > 25) {
          expect(() => ordreAffichage(lot, "a1")).toThrow(OrdreImpossible);
        } else {
          expect(adjacenceRespectee(ordreAffichage(lot, "a1"))).toBe(true);
        }
      }
    }
  });

  it("refuse une taille de découpe non positive", () => {
    expect(() => composerLots(reserve, 0, "g")).toThrow(/Taille de lot invalide/);
  });
});

describe("taille d'un lot composé : elle découle de la nature (§4)", () => {
  it("vaut 50 pour un lot réel et 30 pour un lot d'entraînement, sans --taille", () => {
    expect(tailleDeComposition("reel", null)).toBe(50);
    expect(tailleDeComposition("entrainement", null)).toBe(30);
  });

  it("accepte --taille quand elle répète la taille réglementaire", () => {
    expect(tailleDeComposition("reel", 50)).toBe(50);
    expect(tailleDeComposition("entrainement", 30)).toBe(30);
  });

  it("refuse --taille=40, et toute autre valeur, par une erreur nommée", () => {
    for (const [nature, demandee] of [
      ["reel", 40],
      ["reel", 30],
      ["reel", 51],
      ["entrainement", 50],
      ["entrainement", Number.NaN],
    ] as const) {
      expect(() => tailleDeComposition(nature, demandee)).toThrow(TailleDeLotNonConforme);
    }
    try {
      tailleDeComposition("reel", 40);
    } catch (erreur) {
      const refus = erreur as TailleDeLotNonConforme;
      expect(refus.demandee).toBe(40);
      expect(refus.attendue).toBe(50);
      expect(refus.message).toContain("50");
    }
  });

  it("refuse de composer un lot de réannotation depuis la réserve", () => {
    expect(() => tailleDeComposition("reannotation", null)).toThrow(/--reannote/);
  });

  it("refuse une nature inconnue au lieu de lui prêter une taille", () => {
    expect(() => tailleDeComposition("inconnue" as NatureLot, null)).toThrow(/Nature de lot inconnue/);
  });
});

describe("taille attendue d'un lot existant", () => {
  const reel: Lot = { ...lotRealiste("g"), lot_id: "lot-003" };
  const entrainement: Lot = { ...lotRealiste("g"), lot_id: "ent-001", nature: "entrainement" };
  const r1: Lot = {
    ...reel,
    lot_id: "lot-003-r1",
    nature: "reannotation",
    reannote: "lot-003",
    date_calibration: "2026-11-24",
  };
  const r2: Lot = { ...r1, lot_id: "lot-003-r2", reannote: "lot-003-r1" };
  const entR1: Lot = { ...r1, lot_id: "ent-001-r1", reannote: "ent-001" };
  const lots = [reel, entrainement, r1, r2, entR1];

  it("est la taille réglementaire de sa nature", () => {
    expect(tailleAttendue(lots, reel)).toBe(50);
    expect(tailleAttendue(lots, entrainement)).toBe(30);
  });

  it("pour une réannotation, est celle du premier maillon de la chaîne", () => {
    expect(tailleAttendue(lots, r1)).toBe(50);
    expect(tailleAttendue(lots, r2)).toBe(50);
    expect(tailleAttendue(lots, entR1)).toBe(30);
  });
});
