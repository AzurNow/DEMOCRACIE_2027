/**
 * Garde-fou du diagnostic : un lot écrit avant que `pnpm lots` ne compose que des lots pleins
 * peut compter 17 items. Son kappa se calcule encore, mais le diagnostic dit en clair que sa
 * taille n'est pas celle du §4, au lieu de le présenter comme celui d'un lot de 50.
 */

import { describe, expect, it } from "vitest";
import { diagnostiquerLot } from "../validation/domaine/analyse-lot.ts";
import { rejouer } from "../validation/domaine/journal.ts";
import type { ItemDuLot, Lot } from "../validation/domaine/types.ts";

function reference(rang: number): ItemDuLot {
  return {
    item_id: `item-${String(rang).padStart(3, "0")}`,
    item_version: 1,
    item_empreinte: "a".repeat(64),
    candidat_id: `cand-${rang % 5}`,
  };
}

function lotDe(taille: number): Lot {
  return {
    lot_id: "lot-009",
    nature: "reel",
    graine_maitresse: "g",
    algorithme_ordre: "ordre-annotateur-v1",
    date_creation: "2026-09-17T10:00:00+02:00",
    annotateurs: ["a1", "a2"],
    items: Array.from({ length: taille }, (_, rang) => reference(rang)),
  };
}

function diagnostic(taille: number, taille_attendue: number) {
  return diagnostiquerLot({
    lot: lotDe(taille),
    items: new Map(),
    etats: new Map([
      ["a1", rejouer([])],
      ["a2", rejouer([])],
    ]),
    taille_attendue,
  });
}

describe("diagnostic d'un lot de taille non conforme", () => {
  it("signale un lot réel de 17 items écrit avant la correction", () => {
    const resultat = diagnostic(17, 50);
    expect(resultat.taille_lot).toBe(17);
    expect(resultat.taille_attendue).toBe(50);
    expect(resultat.taille_conforme).toBe(false);
  });

  it("déclare conforme un lot de 50 items", () => {
    const resultat = diagnostic(50, 50);
    expect(resultat.taille_lot).toBe(50);
    expect(resultat.taille_conforme).toBe(true);
  });

  it("mesure la taille du manifeste, pas l'effectif du kappa", () => {
    // Aucune décision : n = 0, mais le lot compte bien ses 50 items.
    const resultat = diagnostic(50, 50);
    expect(resultat.kappa.n).toBe(0);
    expect(resultat.taille_conforme).toBe(true);
  });
});
