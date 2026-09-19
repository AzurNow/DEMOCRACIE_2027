/**
 * Analyses de robustesse préenregistrées (§8).
 *
 * « Recalcul des métriques primaires (a) sur la seule notation humaine de l'échantillon de 10 %,
 * (b) en excluant les items contestés à un run ultérieur, (c) en excluant les formulations
 * orientées. Un résultat qui ne survit pas à ces trois recalculs est signalé comme fragile. »
 */

import { describe, expect, it } from "vitest";
import {
  evaluerRobustesse,
  exclureFormulationsOrientees,
  exclureItemsContestes,
  restreindreEchantillonHumain,
} from "../../analysis/robustesse.ts";
import { exactitude } from "../../analysis/metriques.ts";
import { run, ulid, unite } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 100, graine: "graine-robustesse" };

function surItem(cle: string, partiel: Parameters<typeof unite>[0] = {}) {
  return unite({ ...partiel, grappe_id: ulid(cle), item_principal_id: ulid(cle) });
}

describe("les trois restrictions", () => {
  it("(a) ne garde que les verdicts de l'échantillon humain", () => {
    const jeu = [
      surItem("i1", { dans_echantillon_humain: true }),
      surItem("i2", { dans_echantillon_humain: false }),
    ];

    expect(restreindreEchantillonHumain(jeu)).toHaveLength(1);
    expect(restreindreEchantillonHumain(jeu)[0]?.item_principal_id).toBe(ulid("i1"));
  });

  it("(b) écarte les items contestés après le gel du run", () => {
    const jeu = [surItem("i1"), surItem("i2")];
    const perimetre = run({
      contestations_posterieures: [
        { item_id: ulid("i2"), contestation_id: ulid("c1"), date_reception: "2026-12-10T09:00:00+01:00" },
      ],
    });

    const restant = exclureItemsContestes(jeu, perimetre);

    expect(restant).toHaveLength(1);
    expect(restant[0]?.item_principal_id).toBe(ulid("i1"));
    // Aucune contestation reçue : rien n'est retiré, et l'absence de liste n'est pas une erreur.
    expect(exclureItemsContestes(jeu, run())).toHaveLength(2);
  });

  it("(c) écarte les formulations orientées", () => {
    const jeu = [
      surItem("i1", { registre: "neutre" }),
      surItem("i2", { registre: "familier" }),
      surItem("i3", { registre: "oriente", premisse_fausse: true }),
    ];

    expect(exclureFormulationsOrientees(jeu).map((u) => u.registre)).toEqual(["neutre", "familier"]);
  });
});

describe("marquage fragile", () => {
  it("laisse intact un résultat établi qui survit aux trois recalculs", () => {
    // 4 items, toutes les réponses dans l'échantillon humain, aucune contestée, aucune orientée.
    // Bras A : exactes. Bras B : inexactes. Différence 1 dans les quatre calculs.
    const cles = ["i1", "i2", "i3", "i4"];
    const a = cles.map((c) => surItem(c, { dans_echantillon_humain: true, categorie: "exacte" }));
    const b = cles.map((c) => surItem(c, { dans_echantillon_humain: true, categorie: "inexacte" }));

    const resultat = evaluerRobustesse(a, b, run(), exactitude, OPTIONS);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs.map((r) => r.difference.qualificatif)).toEqual([
      "etablie",
      "etablie",
      "etablie",
    ]);
    expect(resultat.fragile).toBe(false);
    expect(resultat.motifs_fragilite).toEqual([]);
  });

  it("marque fragile un résultat établi qui devient non établi sur la seule notation humaine", () => {
    // 4 items. Sur l'ensemble : A exactes, B inexactes → différence 1, établie.
    // Dans l'échantillon humain (le seul item i4) : les deux bras sont inexacts → différence 0,
    // intervalle contenant 0 → non établie. Le résultat ne survit pas au recalcul (a).
    const communs = ["i1", "i2", "i3"];
    const a = [
      ...communs.map((c) => surItem(c, { categorie: "exacte" })),
      surItem("i4", { categorie: "inexacte", dans_echantillon_humain: true }),
    ];
    const b = [
      ...communs.map((c) => surItem(c, { categorie: "inexacte" })),
      surItem("i4", { categorie: "inexacte", dans_echantillon_humain: true }),
    ];

    const resultat = evaluerRobustesse(a, b, run(), exactitude, OPTIONS);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs[0]?.recalcul).toBe("echantillon_humain");
    expect(resultat.recalculs[0]?.difference.qualificatif).toBe("non_etablie");
    expect(resultat.fragile).toBe(true);
    expect(resultat.motifs_fragilite).toEqual(["echantillon_humain"]);
  });

  it("marque fragile un résultat dont un recalcul ne peut plus être calculé", () => {
    // Aucune réponse dans l'échantillon humain : le recalcul (a) n'a pas de différence à
    // qualifier. Une absence de confirmation n'est pas une confirmation.
    const a = [surItem("i1", { categorie: "exacte" }), surItem("i2", { categorie: "exacte" })];
    const b = [surItem("i1", { categorie: "inexacte" }), surItem("i2", { categorie: "inexacte" })];

    const resultat = evaluerRobustesse(a, b, run(), exactitude, OPTIONS);

    expect(resultat.recalculs[0]?.difference.qualificatif).toBeNull();
    expect(resultat.fragile).toBe(true);
    expect(resultat.motifs_fragilite).toEqual(["echantillon_humain"]);
  });

  it("ne marque pas fragile ce qui n'était pas établi", () => {
    // §8 marque fragile « un résultat qui ne survit pas » : une différence non établie n'avait
    // rien à faire survivre, et la marquer fragile laisserait croire à un résultat rabaissé.
    const a = [surItem("i1", { categorie: "exacte" }), surItem("i2", { categorie: "inexacte" })];
    const b = [surItem("i1", { categorie: "exacte" }), surItem("i2", { categorie: "inexacte" })];

    const resultat = evaluerRobustesse(a, b, run(), exactitude, OPTIONS);

    expect(resultat.principal.qualificatif).toBe("non_etablie");
    expect(resultat.fragile).toBe(false);
  });
});
