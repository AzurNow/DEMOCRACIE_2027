/**
 * Effets de condition (§8, QR6/H2/H3) : « différences appariées par item entre modes et entre
 * formulations, intervalle par bootstrap en grappes, correction de Holm au sein de chaque
 * famille de comparaisons ».
 */

import { describe, expect, it } from "vitest";
import { comparerConditions, pairesParFormulation, pairesParMode } from "../../analysis/conditions.ts";
import { exactitude } from "../../analysis/metriques.ts";
import { grappe, ulid, unite } from "./fabriques.ts";

const OPTIONS = {
  reechantillonnages: 100,
  graine: "graine-conditions",
  methode_valeur_p: "bootstrap_percentile_bilateral",
} as const;

describe("appariement par item", () => {
  it("exclut de la différence appariée l'item absent de l'un des deux bras, sans le remplacer", () => {
    // Item 1 : exacte en web_activee, inexacte en web_desactivee → apparié.
    // Item 2 : inexacte en web_activee seulement → exclu, faute de contrepartie.
    // Apparié : exactitude 1/1 contre 0/1, différence 1.
    // Non apparié, l'item 2 tirerait le premier bras à 1/2 = 0,5 et la différence à 0,5.
    const item1 = ulid("item-1");
    const item2 = ulid("item-2");
    const a = [
      unite({ grappe_id: item1, item_principal_id: item1, mode: "web_activee", categorie: "exacte" }),
      unite({ grappe_id: item2, item_principal_id: item2, mode: "web_activee", categorie: "inexacte" }),
    ];
    const b = [
      unite({ grappe_id: item1, item_principal_id: item1, mode: "web_desactivee", categorie: "inexacte" }),
    ];

    const [comparaison] = comparerConditions([{ cle: "outil-alpha:modes", a, b }], exactitude, OPTIONS);

    expect(comparaison?.grappes_appariees).toBe(1);
    expect(comparaison?.grappes_exclues).toEqual([item2]);
    expect(comparaison?.difference.taux_a).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    expect(comparaison?.difference.difference).toBe(1);
    expect(comparaison?.difference.qualificatif).toBe("etablie");
    expect(comparaison?.methode_valeur_p).toBe("bootstrap_percentile_bilateral");
  });

  it("ne rend aucune comparaison quand aucun item n'est commun aux deux bras", () => {
    const a = grappe("item-a", 1, { mode: "web_activee" });
    const b = grappe("item-b", 1, { mode: "web_desactivee", categorie: "inexacte" });

    const [comparaison] = comparerConditions([{ cle: "outil-alpha:modes", a, b }], exactitude, OPTIONS);

    expect(comparaison?.grappes_appariees).toBe(0);
    expect(comparaison?.difference.difference).toBeNull();
    expect(comparaison?.difference.qualificatif).toBeNull();
    expect(comparaison?.valeur_p).toBeNull();
    expect(comparaison?.valeur_p_corrigee).toBeNull();
  });
});

describe("familles de comparaisons", () => {
  it("corrige les valeurs p de Holm au sein de la famille, jamais comparaison par comparaison", () => {
    // Deux comparaisons dans une même famille : m = 2, donc la plus petite valeur p est
    // multipliée par 2 (bornée à 1) et la plus grande garde le maximum courant.
    const paires = [
      { cle: "outil-alpha", a: grappe("i1", 4, { categorie: "exacte" }), b: grappe("i1", 4, { categorie: "inexacte" }) },
      { cle: "outil-beta", a: grappe("i2", 4, { categorie: "exacte" }), b: grappe("i2", 4, { categorie: "exacte" }) },
    ];

    const comparaisons = comparerConditions(paires, exactitude, OPTIONS);

    expect(comparaisons).toHaveLength(2);
    const triees = [...comparaisons].sort((x, y) => (x.valeur_p as number) - (y.valeur_p as number));
    const plusPetite = triees[0];
    expect(plusPetite?.valeur_p_corrigee).toBeCloseTo(Math.min(1, 2 * (plusPetite?.valeur_p as number)), 12);
    for (const comparaison of comparaisons) {
      expect(comparaison.valeur_p_corrigee as number).toBeGreaterThanOrEqual(comparaison.valeur_p as number);
    }
  });

  it("forme la famille des modes par outil, et celle des formulations par outil et par mode", () => {
    const jeu = [
      ...grappe("i1", 1, { outil_id: "outil-alpha", mode: "web_activee", registre: "neutre" }),
      ...grappe("i1b", 1, { outil_id: "outil-alpha", mode: "web_desactivee", registre: "neutre" }),
      ...grappe("i2", 1, { outil_id: "outil-alpha", mode: "web_activee", registre: "familier" }),
      // Canal application : pas de mode (§6). Hors des comparaisons de mode, jamais rangé ailleurs.
      ...grappe("i3", 1, { outil_id: "outil-alpha", mode: null, canal: "application" }),
    ];

    const modes = pairesParMode(jeu);
    expect(modes.map((p) => p.cle)).toEqual(["outil-alpha:web_activee-web_desactivee"]);
    expect(modes[0]?.a).toHaveLength(2);
    expect(modes[0]?.b).toHaveLength(1);

    const formulations = pairesParFormulation(jeu);
    expect(formulations.map((p) => p.cle)).toEqual(["outil-alpha:web_activee:neutre-familier"]);
  });
});
