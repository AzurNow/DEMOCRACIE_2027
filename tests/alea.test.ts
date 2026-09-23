/**
 * Graines figées de `splitmix64-sha256-v1` (`validation/domaine/alea.ts`).
 *
 * Toutes les graines publiées en dérivent : tirage, bootstrap, permutation, ordre des lots. Ces
 * valeurs ont été calculées avant toute modification du module et vérifiées indépendamment en
 * Python (`hashlib.sha256("\0".join(composants))`). Un test qui rougit ici signifie que les runs
 * déjà publiés ne se rejouent plus : ce n'est jamais une valeur attendue à mettre à jour.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateur, graineDepuisTexte } from "../validation/domaine/alea.ts";

const NUL = String.fromCodePoint(0);

const FIGEES: readonly { composants: readonly string[]; graine: string; tirages: readonly number[] }[] = [
  { composants: ["graine"], graine: "9712315c8f2f0092", tirages: [583, 58] },
  { composants: ["lot-003", "a1"], graine: "e5b5e110a2d3f840", tirages: [313, 267] },
  {
    composants: ["2026", "splitmix64-sha256-v1", "run-01", "candidat-a"],
    graine: "ec22d47965ada1bc",
    tirages: [187, 357],
  },
];

describe("splitmix64-sha256-v1 : graines figées", () => {
  for (const cas of FIGEES) {
    it(`${cas.composants.join(" | ")} donne ${cas.graine}`, () => {
      const graine = graineDepuisTexte(...cas.composants);
      expect(graine.toString(16).padStart(16, "0")).toBe(cas.graine);
      const rng = generateur(graine);
      expect(cas.tirages.map(() => rng.entier(1000))).toEqual(cas.tirages);
    });
  }

  it("les composants sont joints par U+0000, recalculé ici sans passer par le module", () => {
    for (const cas of FIGEES) {
      const attendu = createHash("sha256").update(cas.composants.join(NUL), "utf8").digest("hex").slice(0, 16);
      expect(attendu).toBe(cas.graine);
    }
  });

  it("deux découpages différents des mêmes caractères donnent deux graines", () => {
    expect(graineDepuisTexte("ab", "c")).not.toBe(graineDepuisTexte("a", "bc"));
  });
});
