/**
 * Correction de Holm (§8) — cas calculés à la main.
 *
 * Procédure descendante : valeurs p triées croissantes, p⁽ⁱ⁾ multipliée par (m − i + 1), puis
 * maximum courant pour garantir la monotonie, puis bornage à 1.
 */

import { describe, expect, it } from "vitest";
import { corrigerHolm } from "../../analysis/holm.ts";

describe("correction de Holm", () => {
  it("fait passer au-dessus de 0,05 une valeur p qui y était en dessous seule", () => {
    // m = 3. Triées : 0,01 · 0,04 · 0,30.
    // 0,01 × 3 = 0,03 → 0,03
    // 0,04 × 2 = 0,08 → max(0,03 ; 0,08) = 0,08  ← significative seule, plus après correction
    // 0,30 × 1 = 0,30 → max(0,08 ; 0,30) = 0,30
    const corrigees = corrigerHolm([
      { cle: "outil-beta", valeur: 0.04 },
      { cle: "outil-alpha", valeur: 0.01 },
      { cle: "outil-gamma", valeur: 0.3 },
    ]);

    // L'ordre d'entrée est conservé : la famille est publiée telle qu'elle a été formée.
    expect(corrigees.map((c) => c.cle)).toEqual(["outil-beta", "outil-alpha", "outil-gamma"]);
    expect(corrigees[0]?.corrigee).toBeCloseTo(0.08, 12);
    expect(corrigees[1]?.corrigee).toBeCloseTo(0.03, 12);
    expect(corrigees[2]?.corrigee).toBeCloseTo(0.3, 12);
    expect(corrigees[0]?.valeur).toBe(0.04);
  });

  it("garde la monotonie et borne à 1", () => {
    // Triées : 0,03 · 0,04 · 0,04 → 0,09 · max(0,09 ; 0,08) = 0,09 · max(0,09 ; 0,04) = 0,09.
    const egales = corrigerHolm([
      { cle: "a", valeur: 0.03 },
      { cle: "b", valeur: 0.04 },
      { cle: "c", valeur: 0.04 },
    ]);
    expect(egales.map((c) => c.corrigee)).toEqual([0.09, 0.09, 0.09].map((v) => expect.closeTo(v, 12)));

    // 0,5 × 2 = 1,0 borné à 1 ; puis max(1 ; 0,6) = 1.
    const bornees = corrigerHolm([
      { cle: "a", valeur: 0.5 },
      { cle: "b", valeur: 0.6 },
    ]);
    expect(bornees.map((c) => c.corrigee)).toEqual([1, 1]);
  });

  it("rend une liste vide sur une famille vide, et laisse inchangée une famille d'une seule valeur", () => {
    expect(corrigerHolm([])).toEqual([]);

    const seule = corrigerHolm([{ cle: "a", valeur: 0.02 }]);
    expect(seule).toEqual([{ cle: "a", valeur: 0.02, corrigee: 0.02 }]);
  });

  it("refuse une valeur p hors de [0, 1] plutôt que de la corriger", () => {
    expect(() => corrigerHolm([{ cle: "a", valeur: 1.2 }])).toThrow(/valeur p/);
    expect(() => corrigerHolm([{ cle: "a", valeur: Number.NaN }])).toThrow(/valeur p/);
  });
});
