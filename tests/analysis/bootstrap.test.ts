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
  intervalleNomme,
  intervalleStatistique,
  percentile,
  reechantillonner,
  reechantillonnerStatistique,
  REECHANTILLONNAGES_PRODUCTION,
  valeurDuTaux,
} from "../../analysis/bootstrap.ts";
import { graineDerivee } from "../../analysis/graines.ts";
import { exactitude } from "../../analysis/metriques.ts";
import { generateur } from "../../validation/domaine/alea.ts";
import { grappe } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 200, graine_du_run: 20261201, cle: ["test", "bootstrap"] };

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
  it("donne le même intervalle à graine égale, un autre à graine de run différente", () => {
    const jeu = dixGrappes();

    const a = intervalleBootstrap(jeu, exactitude, OPTIONS);
    const b = intervalleBootstrap(jeu, exactitude, OPTIONS);
    const autreRun = { ...OPTIONS, graine_du_run: 20261202 };

    expect(a).toEqual(b);
    // Sur dix grappes, les bornes avancent par pas de 0,1 : deux flux distincts peuvent tomber sur
    // les mêmes bornes. C'est le flux des rééchantillons qui doit changer avec la graine.
    expect(reechantillonner(jeu, exactitude, autreRun).valeurs).not.toEqual(
      reechantillonner(jeu, exactitude, OPTIONS).valeurs,
    );
    expect(a?.reechantillonnages).toBe(200);
    expect(REECHANTILLONNAGES_PRODUCTION).toBe(2000);
  });
});

describe("contrat de rejeu depuis run.graines.bootstrap (constat n° 6)", () => {
  it("amorce le générateur par graineDerivee(graine_du_run, [\"bootstrap\", ...cle]), rien d'autre", () => {
    // Deux grappes homogènes, dans l'ordre de première apparition : g-exacte (indice 0, taux 1),
    // g-inexacte (indice 1, taux 0). Chaque rééchantillon tire deux indices avec remise ; sa
    // valeur est la moyenne des deux taux. Un tiers qui rejoue le générateur avec la graine
    // dérivée doit retrouver exactement la même liste de valeurs.
    const jeu = [
      ...grappe("g-exacte", 1, { categorie: "exacte" }),
      ...grappe("g-inexacte", 1, { categorie: "inexacte" }),
    ];
    const options = { reechantillonnages: 50, graine_du_run: 20261201, cle: ["outil-alpha", "exactitude"] };

    const rng = generateur(graineDerivee(20261201, ["bootstrap", "outil-alpha", "exactitude"]));
    const attendues: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const tirees = [rng.entier(2), rng.entier(2)];
      attendues.push(tirees.filter((indice) => indice === 0).length / 2);
    }
    attendues.sort((x, y) => x - y);

    expect(reechantillonner(jeu, exactitude, options).valeurs).toEqual(attendues);
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

  it("ne qualifie ni établie ni non établie une différence non nulle sur une seule grappe (§8, 0.9)", () => {
    // §8 (0.9) : « Un intervalle calculé sur une seule grappe est dégénéré : la différence
    // correspondante n'est qualifiée ni d'« établie » ni de « non établie », elle est publiée
    // avec la mention « une seule grappe ». » Exactitude 1 contre 0 sur une grappe : l'intervalle
    // se réduit au point [1 ; 1], qui exclut zéro sans rien mesurer.
    const exacte = grappe("g-unique", 3, { categorie: "exacte" });
    const inexacte = grappe("g-unique", 3, { categorie: "inexacte" });

    const resultat = differenceAppariee(exacte, inexacte, exactitude, OPTIONS);

    expect(resultat.difference).toBe(1);
    expect(resultat.qualificatif).toBeNull();
    // La mention « une seule grappe » reste lisible : l'intervalle existe, il n'est pas absent.
    expect(resultat.intervalle).not.toBeNull();
    expect(resultat.intervalle?.degenere).toBe("grappe_unique");
    expect(resultat.intervalle?.nombre_grappes).toBe(1);
    expect(resultat.intervalle?.bas).toBe(1);
    expect(resultat.intervalle?.haut).toBe(1);
  });

  it("qualifie toujours une différence non nulle dès deux grappes", () => {
    // Même écart qu'au test précédent, sur deux grappes : l'intervalle n'est plus dégénéré et le
    // §8 s'applique sans changement.
    const exacte = ["g1", "g2"].flatMap((g) => grappe(g, 3, { categorie: "exacte" }));
    const inexacte = ["g1", "g2"].flatMap((g) => grappe(g, 3, { categorie: "inexacte" }));

    const resultat = differenceAppariee(exacte, inexacte, exactitude, OPTIONS);

    expect(resultat.intervalle?.degenere).toBeNull();
    expect(resultat.intervalle?.nombre_grappes).toBe(2);
    expect(resultat.qualificatif).toBe("etablie");
  });
});

describe("statistique numérique (conformité n° 29)", () => {
  // Le §8 exige l'intervalle de l'écart maximal du test d'asymétrie, qui n'est pas un rapport
  // d'effectifs. Le bootstrap est généralisé à `(unites) => number | null` : mêmes grappes, même
  // graine, mêmes rééchantillonnages, mêmes quantiles. Les taux passent par cette même voie.
  const OPTIONS_FIGEES = {
    reechantillonnages: 2000,
    graine_du_run: 20261201,
    cle: ["outil-alpha", "web_desactivee", "exactitude", "global"],
  };

  /** 7 grappes de 2 exactes, 3 grappes d'une inexacte : exactitude 14/17. */
  function jeuFige() {
    const jeu = [];
    for (let i = 0; i < 7; i += 1) jeu.push(...grappe(`g-exacte-${i}`, 2, { categorie: "exacte" }));
    for (let i = 0; i < 3; i += 1) jeu.push(...grappe(`g-inexacte-${i}`, 1, { categorie: "inexacte" }));
    return jeu;
  }

  /** 1 grappe exacte, 1 grappe de 2 inexactes, 3 grappes de non-réponse : des rééchantillons sans classée. */
  function jeuCreux() {
    const jeu = [...grappe("c-exacte", 1, { categorie: "exacte" }), ...grappe("c-inexacte", 2, { categorie: "inexacte" })];
    for (let i = 0; i < 3; i += 1) jeu.push(...grappe(`c-nr-${i}`, 1, { categorie: "non_reponse" }));
    return jeu;
  }

  it("garde exactement les bornes d'un intervalle de taux figé avant le changement", () => {
    // Bornes relevées sur le code d'avant le constat n° 29 (`intervalleBootstrap` typé Taux),
    // 2 000 rééchantillonnages, graine 20261201. Elles ne doivent pas bouger d'un bit, ni par
    // l'ancienne entrée, ni par la voie numérique.
    const fige = {
      bas: 0.5714285714285714,
      haut: 1,
      nombre_grappes: 10,
      reechantillonnages: 2000,
      reechantillonnages_indefinis: 0,
      degenere: null,
    };
    const creux = {
      bas: 0,
      haut: 1,
      nombre_grappes: 5,
      reechantillonnages: 2000,
      reechantillonnages_indefinis: 158,
      degenere: null,
    };
    const optionsCreux = { ...OPTIONS_FIGEES, cle: ["outil-alpha", "web_desactivee", "exactitude", "creux"] };

    expect(intervalleBootstrap(jeuFige(), exactitude, OPTIONS_FIGEES)).toEqual(fige);
    expect(intervalleStatistique(jeuFige(), valeurDuTaux(exactitude), OPTIONS_FIGEES)).toEqual(fige);
    expect(intervalleBootstrap(jeuCreux(), exactitude, optionsCreux)).toEqual(creux);
    expect(intervalleStatistique(jeuCreux(), valeurDuTaux(exactitude), optionsCreux)).toEqual(creux);
  });

  it("rééchantillonne une statistique qui n'est pas un taux, sur les grappes tirées", () => {
    // Statistique : nombre de réponses exactes (pas un rapport). Grappe 0 : 1 exacte ; grappe 1 :
    // 3 exactes. Rejouer le générateur avec la graine dérivée donne la même liste.
    const jeu = [...grappe("n-a", 1, { categorie: "exacte" }), ...grappe("n-b", 3, { categorie: "exacte" })];
    const compte = (unites: readonly { categorie: string }[]) => unites.filter((u) => u.categorie === "exacte").length;
    const options = { reechantillonnages: 30, graine_du_run: 7, cle: ["outil-alpha", "compte"] };

    const rng = generateur(graineDerivee(7, ["bootstrap", "outil-alpha", "compte"]));
    const attendues: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      attendues.push([rng.entier(2), rng.entier(2)].reduce((s, indice) => s + (indice === 0 ? 1 : 3), 0));
    }
    attendues.sort((x, y) => x - y);

    expect(reechantillonnerStatistique(jeu, compte, options).valeurs).toEqual(attendues);
  });

  it("écarte et compte un rééchantillon où la statistique numérique est indéfinie (§8)", () => {
    // Indéfinie quand la grappe inexacte manque au rééchantillon : deux grappes tirées avec
    // remise, elle manque quand les deux indices valent 0. Le compte rejoué doit être exact.
    const jeu = [...grappe("n-a", 1, { categorie: "exacte" }), ...grappe("n-b", 1, { categorie: "inexacte" })];
    const avecInexacte = (unites: readonly { categorie: string }[]) =>
      unites.some((u) => u.categorie === "inexacte") ? unites.length : null;
    const options = { reechantillonnages: 40, graine_du_run: 11, cle: ["outil-alpha", "indefinie"] };

    const rng = generateur(graineDerivee(11, ["bootstrap", "outil-alpha", "indefinie"]));
    let indefinis = 0;
    for (let i = 0; i < 40; i += 1) {
      const tirees = [rng.entier(2), rng.entier(2)];
      if (tirees.every((t) => t === 0)) indefinis += 1;
    }

    const echantillon = reechantillonnerStatistique(jeu, avecInexacte, options);

    expect(indefinis).toBeGreaterThan(0);
    expect(echantillon.indefinis).toBe(indefinis);
    expect(echantillon.valeurs).toHaveLength(40 - indefinis);
    expect(intervalleStatistique(jeu, avecInexacte, options)?.reechantillonnages_indefinis).toBe(indefinis);
  });

  it("publie avec chaque différence sa clé complète et sa graine, même sans intervalle (conformité n° 30)", () => {
    // §8, « Graines de l'analyse » : chaque intervalle a sa graine, « dérivée […] d'une clé lisible
    // publiée avec le résultat ». Vecteur du §8 : clé bootstrap / outil-alpha / web_desactivee /
    // exactitude / global, graine du run 20261201, amorce 0xd8bcfbd164a58f33.
    const options = {
      reechantillonnages: 50,
      graine_du_run: 20261201,
      cle: ["outil-alpha", "web_desactivee", "exactitude", "global"],
    };
    const exacte = ["g1", "g2"].flatMap((g) => grappe(g, 1, { categorie: "exacte" }));
    const inexacte = ["g1", "g2"].flatMap((g) => grappe(g, 1, { categorie: "inexacte" }));
    const nonClassee = ["g1", "g2"].flatMap((g) => grappe(g, 1, { categorie: "non_reponse" }));

    const definie = differenceAppariee(exacte, inexacte, exactitude, options);
    const sansTerme = differenceAppariee(exacte, nonClassee, exactitude, options);

    for (const resultat of [definie, sansTerme]) {
      expect(resultat.cle).toEqual(["bootstrap", "outil-alpha", "web_desactivee", "exactitude", "global"]);
      expect(resultat.graine).toBe("d8bcfbd164a58f33");
    }
    expect(definie.intervalle).not.toBeNull();
    expect(sansTerme.intervalle).toBeNull();
    // La graine publiée est bien celle qui a amorcé le rééchantillonnage, pas une étiquette.
    expect(definie.graine).toBe(graineDerivee(20261201, definie.cle).toString(16).padStart(16, "0"));
  });

  it("rend un intervalle nommé : clé complète, graine publiée, raison quand il est absent", () => {
    const options = {
      reechantillonnages: 50,
      graine_du_run: 20261201,
      cle: ["outil-alpha", "web_desactivee", "exactitude", "global"],
    };

    const nomme = intervalleNomme(jeuFige(), valeurDuTaux(exactitude), options);

    expect(nomme.cle).toEqual(["bootstrap", "outil-alpha", "web_desactivee", "exactitude", "global"]);
    // Vecteur du §8 : amorce 0xd8bcfbd164a58f33.
    expect(nomme.graine).toBe("d8bcfbd164a58f33");
    expect(nomme.intervalle).toEqual(intervalleStatistique(jeuFige(), valeurDuTaux(exactitude), options));
    expect(nomme.raison_sans_intervalle).toBeNull();

    const sansGrappe = intervalleNomme([], valeurDuTaux(exactitude), options);
    expect(sansGrappe.intervalle).toBeNull();
    expect(sansGrappe.raison_sans_intervalle).toBe("aucune_grappe");

    const sansClassee = intervalleNomme(grappe("nr", 2, { categorie: "non_reponse" }), valeurDuTaux(exactitude), options);
    expect(sansClassee.intervalle).toBeNull();
    expect(sansClassee.raison_sans_intervalle).toBe("aucun_reechantillon_defini");
  });
});
