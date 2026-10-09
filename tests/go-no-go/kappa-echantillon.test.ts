/**
 * Kappa juges-humains de l'échantillon humain (§7, §12 ; D24 (1) et (2)) et son critère.
 *
 * Les matrices de confusion sont choisies pour tomber sur des fractions exactes : 3/4 (seuil),
 * 50/67 (juste en dessous), 9/10 et 7/10.
 */

import { describe, expect, it } from "vitest";
import { critereKappaJugesHumains } from "../../pipeline/go-no-go/criteres-juges.ts";
import {
  kappasEchantillon,
  NotationDeJugeIntrouvable,
  ReferenceHumaineIndefinie,
  referenceHumaine,
} from "../../pipeline/go-no-go/kappa-echantillon.ts";
import { AUCUN_JUGE_RETENU } from "../../pipeline/go-no-go/types.ts";
import { JugeIndetermine } from "../../pipeline/notation/decision.ts";
import type { JugeDuRun } from "../../pipeline/notation/types.ts";
import { comptesKappa, kappaCohen } from "../../validation/domaine/kappa.ts";
import { notationJuge } from "../notation/fabriques.ts";
import { echantillonSynthetique, fois, type LigneEchantillon } from "./aides.ts";

const DEUX_JUGES: readonly JugeDuRun[] = [
  { juge_id: "j1", retire: false },
  { juge_id: "j2", retire: false },
];

/** Matrice juge × humain sur (exacte, inexacte) : a = e/e, b = e/i, c = i/e, d = i/i. */
function matrice(juge: string, a: number, b: number, c: number, d: number): readonly LigneEchantillon[] {
  return [
    ...fois(a, { juges: { [juge]: "exacte" }, humains: ["exacte", "exacte"] }),
    ...fois(b, { juges: { [juge]: "exacte" }, humains: ["inexacte", "inexacte"] }),
    ...fois(c, { juges: { [juge]: "inexacte" }, humains: ["exacte", "exacte"] }),
    ...fois(d, { juges: { [juge]: "inexacte" }, humains: ["inexacte", "inexacte"] }),
  ];
}

function kappaUnJuge(lignes: readonly LigneEchantillon[]) {
  const { echantillon, notations } = echantillonSynthetique(lignes);
  return kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }], echantillon, notations });
}

describe("noyau partagé du kappa (validation/domaine/kappa.ts)", () => {
  it("comptesKappa rend les entiers dont kappaCohen tire le kappa publié", () => {
    const paires = [
      { a: "x", b: "x" },
      { a: "x", b: "y" },
      { a: "y", b: "y" },
    ] as const;
    const comptes = comptesKappa(paires, ["x", "y"]);
    expect(comptes).toEqual({ n: 3, accords: 2, attendus: 4 });
    expect(kappaCohen(paires, ["x", "y"]).kappa).toBe((2 * 3 - 4) / (9 - 4));
  });
});

describe("kappa de l'échantillon, seuil de 0,75 (§12)", () => {
  it("kappa exactement 0,75 : vert (« ≥ 0,75 »)", () => {
    const [kappa] = kappaUnJuge(matrice("j1", 3, 0, 1, 4));
    expect(kappa?.kappa).toBe(0.75);
    expect(kappa?.atteint_seuil).toBe(true);
    expect(critereKappaJugesHumains(kappaUnJuge(matrice("j1", 3, 0, 1, 4)))).toEqual({ code: "kappa_juges_humains", statut: "vert", valeur: 0.75, seuil: 0.75 });
  });

  it("kappa juste en dessous de 0,75 (50/67) : rouge", () => {
    const kappas = kappaUnJuge(matrice("j1", 5, 0, 2, 10));
    expect(kappas[0]?.kappa).toBeCloseTo(50 / 67, 12);
    expect(kappas[0]?.atteint_seuil).toBe(false);
    expect(critereKappaJugesHumains(kappas).statut).toBe("rouge");
  });

  it("un juge à 0,9 et l'autre à 0,7 : rouge, valeur 0,7 (le plus petit)", () => {
    // Vingt réponses, dix exactes et dix inexactes selon les humains.
    const lignes: LigneEchantillon[] = [
      ...fois(9, { juges: { j1: "exacte", j2: "exacte" }, humains: ["exacte", "exacte"] }),
      { juges: { j1: "inexacte", j2: "inexacte" }, humains: ["exacte", "exacte"] },
      { juges: { j1: "inexacte", j2: "exacte" }, humains: ["inexacte", "inexacte"] },
      { juges: { j1: "inexacte", j2: "exacte" }, humains: ["inexacte", "inexacte"] },
      ...fois(8, { juges: { j1: "inexacte", j2: "inexacte" }, humains: ["inexacte", "inexacte"] }),
    ];
    const { echantillon, notations } = echantillonSynthetique(lignes);
    const kappas = kappasEchantillon({ juges: DEUX_JUGES, echantillon, notations });
    expect(kappas.map((k) => [k.juge_id, k.kappa])).toEqual([
      ["j1", 0.9],
      ["j2", 0.7],
    ]);
    expect(critereKappaJugesHumains(kappas)).toEqual({ code: "kappa_juges_humains", statut: "rouge", valeur: 0.7, seuil: 0.75 });
  });
});

describe("kappa indéfini (D24 (2)) : rouge, absent avec son motif", () => {
  it("tout l'échantillon dans une seule catégorie : accord attendu maximal", () => {
    const [kappa] = kappaUnJuge(fois(5, { juges: { j1: "exacte" }, humains: ["exacte", "exacte"] }));
    expect(kappa).toMatchObject({ kappa: null, motif_indefini: "accord_attendu_maximal", atteint_seuil: false, n: 5 });
    const critere = critereKappaJugesHumains(kappa === undefined ? [] : [kappa]);
    expect(critere.statut).toBe("rouge");
    expect(critere.valeur).toBe("kappa indéfini pour j1 : accord_attendu_maximal");
  });

  it("échantillon vide : aucune réponse comparable, rouge", () => {
    const kappas = kappasEchantillon({ juges: DEUX_JUGES, echantillon: [], notations: [] });
    expect(kappas.map((k) => [k.kappa, k.motif_indefini])).toEqual([
      [null, "aucune_reponse_comparable"],
      [null, "aucune_reponse_comparable"],
    ]);
    expect(critereKappaJugesHumains(kappas).statut).toBe("rouge");
  });
});

describe("note humaine retenue (D24 (1))", () => {
  it("deux humains en désaccord : la note de l'arbitre est la référence", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["exacte", "inexacte"], arbitre: "non_reponse" }]);
    expect(referenceHumaine(echantillon[0] as string, notations)).toBe("non_reponse");
  });

  it("deux humains d'accord : leur note, un arbitre n'est pas lu", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["inexacte", "inexacte"] }]);
    expect(referenceHumaine(echantillon[0] as string, notations)).toBe("inexacte");
  });

  it("désaccord sans arbitre : erreur visible, aucune référence inventée", () => {
    const lignes: LigneEchantillon[] = [...matrice("j1", 3, 0, 1, 4), { juges: { j1: "exacte" }, humains: ["exacte", "inexacte"] }];
    expect(() => kappaUnJuge(lignes)).toThrow(ReferenceHumaineIndefinie);
    expect(() => kappaUnJuge(lignes)).toThrow(/arbitrage/);
  });

  it("double notation incomplète : erreur visible", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["exacte", "exacte"] }]);
    const sansSeconde = notations.filter((n) => n.notateur.id !== "annotateur-2");
    expect(() => kappasEchantillon({ juges: DEUX_JUGES.slice(0, 1), echantillon, notations: sansSeconde })).toThrow(/double notation incomplète/);
  });

  it("note humaine retenue « indeterminee » : hors des trois catégories de D24, le calcul s'arrête", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["indeterminee", "indeterminee"] }]);
    expect(() => referenceHumaine(echantillon[0] as string, notations)).toThrow(/indeterminee/);
  });

  it("notation du juge retenu absente sur une réponse de l'échantillon : erreur visible", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["exacte", "exacte"] }]);
    expect(() => kappasEchantillon({ juges: DEUX_JUGES, echantillon, notations })).toThrow(NotationDeJugeIntrouvable);
  });

  it("un juge qui rend « indeterminee » est rejeté (§7)", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["exacte", "exacte"] }]);
    const indetermine = notationJuge("j2", { objet_note: { type: "reponse", id: echantillon[0] as string }, categorie: "indeterminee" });
    expect(() => kappasEchantillon({ juges: DEUX_JUGES, echantillon, notations: [...notations, indetermine] })).toThrow(JugeIndetermine);
  });
});

describe("juges retirés (D13)", () => {
  it("un juge retiré : ses notations n'entrent nulle part, seul le juge restant compte", () => {
    // j2 (retiré) n'a noté que la moitié de l'échantillon, en désaccord partout : sans effet.
    const lignes = matrice("j1", 3, 0, 1, 4).map((ligne, rang) => (rang % 2 === 0 ? { ...ligne, juges: { ...ligne.juges, j2: "non_reponse" as const } } : ligne));
    const { echantillon, notations } = echantillonSynthetique(lignes);
    const kappas = kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }, { juge_id: "j2", retire: true }], echantillon, notations });
    expect(kappas).toHaveLength(1);
    expect(kappas[0]).toMatchObject({ juge_id: "j1", kappa: 0.75 });
    expect(critereKappaJugesHumains(kappas).statut).toBe("vert");
  });

  it("tous les juges retirés : aucun kappa, critère rouge", () => {
    const { echantillon, notations } = echantillonSynthetique(matrice("j1", 3, 0, 1, 4));
    const kappas = kappasEchantillon({ juges: DEUX_JUGES.map((j) => ({ ...j, retire: true })), echantillon, notations });
    expect(kappas).toEqual([]);
    expect(critereKappaJugesHumains(kappas)).toEqual({ code: "kappa_juges_humains", statut: "rouge", valeur: AUCUN_JUGE_RETENU, seuil: 0.75 });
  });
});
