/**
 * Bootstrap en grappes (§8) — la grappe étant l'item.
 *
 * Les cas sont choisis pour que la distribution des rééchantillons se calcule à la main : avec
 * deux grappes homogènes, un tirage de deux grappes avec remise ne peut donner que trois taux.
 * Un intervalle dont on ne sait pas refaire le calcul ne prouve rien.
 */

import { describe, expect, it } from "vitest";
import {
  differenceAppariee,
  intervalleBootstrap,
  percentile,
  reechantillonner,
  REECHANTILLONNAGES_PRODUCTION,
} from "../../analysis/bootstrap.ts";
import { exactitude } from "../../analysis/metriques.ts";
import { grappe } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 200, graine: "graine-de-test" };

/** 10 grappes d'une réponse : 7 exactes, 3 inexactes. Exactitude observée 0,7. */
function dixGrappes() {
  const jeu = [];
  for (let i = 0; i < 7; i += 1) jeu.push(...grappe(`g-exacte-${i}`, 1, { categorie: "exacte" }));
  for (let i = 0; i < 3; i += 1) jeu.push(...grappe(`g-inexacte-${i}`, 1, { categorie: "inexacte" }));
  return jeu;
}

describe("percentiles empiriques", () => {
  it("interpole linéairement quand l'indice ne tombe pas sur un entier", () => {
    // Méthode : h = (m − 1)·p, valeur = v[⌊h⌋] + (h − ⌊h⌋)·(v[⌈h⌉] − v[⌊h⌋]).
    // m = 4, p = 0,025 → h = 3·0,025 = 0,075 → 0 + 0,075·(1 − 0) = 0,075.
    // m = 4, p = 0,975 → h = 3·0,975 = 2,925 → 2 + 0,925·(3 − 2) = 2,925.
    const valeurs = [0, 1, 2, 3];

    expect(percentile(valeurs, 0.025)).toBeCloseTo(0.075, 12);
    expect(percentile(valeurs, 0.975)).toBeCloseTo(2.925, 12);
    // Bornes exactes : un seul élément, ou p aux extrémités.
    expect(percentile([5], 0.025)).toBe(5);
    expect(percentile(valeurs, 0)).toBe(0);
    expect(percentile(valeurs, 1)).toBe(3);
  });

  it("refuse une liste vide plutôt que d'inventer une borne", () => {
    expect(() => percentile([], 0.5)).toThrow(/vide/);
  });
});

describe("reproductibilité", () => {
  it("donne le même intervalle à graine égale, un autre à graine différente", () => {
    const jeu = dixGrappes();

    const a = intervalleBootstrap(jeu, exactitude, OPTIONS);
    const b = intervalleBootstrap(jeu, exactitude, OPTIONS);
    const c = intervalleBootstrap(jeu, exactitude, { ...OPTIONS, graine: "une-autre-graine" });

    expect(a).toEqual(b);
    expect([c?.bas, c?.haut]).not.toEqual([a?.bas, a?.haut]);
    expect(a?.reechantillonnages).toBe(200);
    expect(REECHANTILLONNAGES_PRODUCTION).toBe(2000);
  });
});

describe("rééchantillonnage en grappes", () => {
  it("tire les réponses d'un même item ensemble, jamais une à une", () => {
    // Deux grappes de 3 réponses : la première toute exacte, la seconde toute inexacte.
    // Par grappe, un rééchantillon ne peut valoir que 1 (deux fois la première), 0 (deux fois la
    // seconde) ou 0,5 (une de chaque) — et les extrêmes arrivent une fois sur quatre chacun,
    // donc l'intervalle à 95 % est [0 ; 1].
    // Par réponse, il faudrait tirer 6 réponses identiques pour atteindre 0 ou 1 : (1/2)⁶ = 1,6 %,
    // sous les 2,5 % du percentile bas — l'intervalle serait strictement à l'intérieur de [0 ; 1].
    const jeu = [
      ...grappe("g-exacte", 3, { categorie: "exacte" }),
      ...grappe("g-inexacte", 3, { categorie: "inexacte" }),
    ];

    const echantillon = reechantillonner(jeu, exactitude, OPTIONS);
    const intervalle = intervalleBootstrap(jeu, exactitude, OPTIONS);

    expect(echantillon.nombre_grappes).toBe(2);
    expect([...new Set(echantillon.valeurs)].sort()).toEqual([0, 0.5, 1]);
    expect(intervalle?.bas).toBe(0);
    expect(intervalle?.haut).toBe(1);
  });

  it("signale la dégénérescence d'un taux calculé sur une seule grappe", () => {
    // Une grappe : tout rééchantillon la retire à l'identique. L'intervalle se réduit au point,
    // ce qui, publié tel quel, ressemblerait à une mesure d'une précision parfaite.
    const jeu = grappe("g-unique", 4, { categorie: "exacte" });

    const intervalle = intervalleBootstrap(jeu, exactitude, OPTIONS);

    expect(intervalle?.degenere).toBe("grappe_unique");
    expect(intervalle?.bas).toBe(1);
    expect(intervalle?.haut).toBe(1);
    expect(intervalle?.nombre_grappes).toBe(1);
  });

  it("ne rend aucun intervalle quand il n'y a aucune grappe", () => {
    expect(intervalleBootstrap([], exactitude, OPTIONS)).toBeNull();
  });
});

describe("différence appariée par grappe", () => {
  it("qualifie « établie » une différence dont l'intervalle exclut zéro, « non établie » sinon", () => {
    // §8 : « une différence est qualifiée d'établie seulement si l'intervalle de confiance de la
    // différence exclut zéro ; sinon elle est non établie ». Le rapport n'a que ces deux mots.
    const grappes = ["g1", "g2", "g3", "g4", "g5"];
    const toutExact = grappes.flatMap((g) => grappe(g, 2, { categorie: "exacte" }));
    const toutInexact = grappes.flatMap((g) => grappe(g, 2, { categorie: "inexacte" }));

    // Exactitude 1 contre 0 sur les mêmes grappes : la différence vaut 1 dans tout rééchantillon.
    const tranchee = differenceAppariee(toutExact, toutInexact, exactitude, OPTIONS);
    expect(tranchee.difference).toBe(1);
    expect(tranchee.intervalle?.bas).toBe(1);
    expect(tranchee.qualificatif).toBe("etablie");

    // Deux bras identiques : la différence vaut 0 partout, l'intervalle contient 0.
    const nulle = differenceAppariee(toutExact, toutExact, exactitude, OPTIONS);
    expect(nulle.difference).toBe(0);
    expect(nulle.qualificatif).toBe("non_etablie");
  });

  it("ne qualifie rien quand l'un des deux taux n'existe pas", () => {
    const observees = grappe("g1", 2, { categorie: "exacte" });
    const nonClassees = grappe("g1", 2, { categorie: "non_reponse" });

    const resultat = differenceAppariee(observees, nonClassees, exactitude, OPTIONS);

    expect(resultat.difference).toBeNull();
    expect(resultat.qualificatif).toBeNull();
    expect(resultat.intervalle).toBeNull();
  });
});
