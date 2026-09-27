/**
 * Test d'asymétrie inter-candidats (§8, QR3/H4) — cas dont la valeur p se calcule à la main.
 *
 * « Les étiquettes de candidat sont permutées entre items 10 000 fois ; la statistique est
 * l'écart maximal absolu entre l'exactitude d'un candidat et l'exactitude moyenne de l'outil. »
 * Valeur p de Monte-Carlo : (1 + nombre de permutations au moins aussi extrêmes) / (1 + B).
 */

import { describe, expect, it } from "vitest";
import { generateur, graineDepuisTexte } from "../../validation/domaine/alea.ts";
import { graineDerivee } from "../../analysis/graines.ts";
import {
  corrigerFamilleAsymetrie,
  ecartMaximal,
  grappesEtiquetees,
  permuterEtiquettes,
  PERMUTATIONS_PRODUCTION,
  testHomogeneiteCandidats,
} from "../../analysis/permutation.ts";
import { grappe, ulid, unite } from "./fabriques.ts";

const OPTIONS = { permutations: 200, graine_du_run: 20261201, cle: ["test", "permutation"] };

/**
 * Conformité n° 30 : le test prend le partage du seuil de couverture (§4, §8). Les tests écrits
 * avant ce constat posent des candidats tous au-dessus du seuil ; ils reçoivent ce partage, et
 * leurs assertions ne changent pas.
 */
const TOUS_COMPARES = {
  compares: ["candidat-a", "candidat-b", "candidat-c", "candidat-d"],
  rapportes_a_part: [],
};

/** `n` items d'un candidat, une réponse chacun, toutes de la même catégorie. */
function items(candidat_id: string, n: number, exacte: boolean, prefixe = candidat_id) {
  const jeu = [];
  for (let i = 0; i < n; i += 1) {
    jeu.push(
      ...grappe(`${prefixe}-item-${i}`, 1, {
        candidat_id,
        categorie: exacte ? "exacte" : "inexacte",
      }),
    );
  }
  return jeu;
}

describe("statistique et valeur p", () => {
  it("rend une valeur p maximale quand deux candidats ont la même exactitude", () => {
    // A : 2 exactes, 2 inexactes. B : 2 exactes, 2 inexactes. Exactitude de l'outil : 4/8 = 0,5.
    // Écart de chaque candidat à la moyenne : 0. Statistique observée : 0.
    // Toute permutation donne une statistique ≥ 0, donc les 200 comptent :
    // p = (1 + 200) / (1 + 200) = 1.
    const jeu = [
      ...items("candidat-a", 2, true, "a-exactes"),
      ...items("candidat-a", 2, false, "a-inexactes"),
      ...items("candidat-b", 2, true, "b-exactes"),
      ...items("candidat-b", 2, false, "b-inexactes"),
    ];

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS);

    expect(resultat?.statistique_observee).toBe(0);
    expect(resultat?.valeur_p).toBe(1);
    expect(resultat?.exactitude_outil).toEqual({ numerateur: 4, denominateur: 8, valeur: 0.5 });
  });

  it("rend une valeur p minimale quand un candidat est à 0 % face à trois candidats à 100 %", () => {
    // 4 candidats × 5 items. D : 5 inexactes. A, B, C : 5 exactes chacun.
    // Exactitude de l'outil : 15/20 = 0,75 — invariante par permutation des étiquettes.
    // Statistique observée : |0 − 0,75| = 0,75, c'est le maximum atteignable : il faut qu'un
    // candidat reçoive les 5 items inexacts, soit 4/C(20,5) = 4/15504 ≈ 0,026 % des permutations.
    // Sur 200 permutations, l'espérance du nombre de cas extrêmes est 0,05 : aucun ne tombe, et
    // p = (1 + 0) / (1 + 200) = 1/201 ≈ 0,00498.
    const jeu = [
      ...items("candidat-a", 5, true),
      ...items("candidat-b", 5, true),
      ...items("candidat-c", 5, true),
      ...items("candidat-d", 5, false),
    ];

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS);

    expect(resultat?.statistique_observee).toBeCloseTo(0.75, 12);
    expect(resultat?.valeur_p).toBeCloseTo(1 / 201, 12);
    expect(resultat?.candidats.find((c) => c.candidat_id === "candidat-d")?.exactitude).toEqual({
      numerateur: 0,
      denominateur: 5,
      valeur: 0,
    });
    expect(PERMUTATIONS_PRODUCTION).toBe(10000);
  });

  it("prend pour référence l'exactitude globale pondérée, pas la moyenne des candidats, quand leurs effectifs diffèrent", () => {
    // A : 10 classées, 10 exactes (1). B : 30 classées, 1 exacte (1/30).
    // Globale pondérée : 11/40 = 0,275 ⇒ écart maximal |1 − 0,275| = 0,725 (candidat A).
    // Moyenne des candidats : (1 + 1/30)/2 ≈ 0,5167 ⇒ écart maximal ≈ 0,4833. Les deux diffèrent.
    const jeu = [
      ...items("candidat-a", 10, true),
      ...items("candidat-b", 1, true, "b-exactes"),
      ...items("candidat-b", 29, false, "b-inexactes"),
    ];
    const globale = 11 / 40;
    const moyenneDesCandidats = (1 + 1 / 30) / 2;

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS);

    expect(resultat?.exactitude_outil).toEqual({ numerateur: 11, denominateur: 40, valeur: globale });
    expect(resultat?.statistique_observee).toBeCloseTo(1 - globale, 12);
    expect(resultat?.statistique_observee).not.toBeCloseTo(1 - moyenneDesCandidats, 6);
  });

  it("ne teste rien quand il n'y a pas deux candidats à comparer", () => {
    expect(testHomogeneiteCandidats([], TOUS_COMPARES, OPTIONS)).toBeNull();
    expect(testHomogeneiteCandidats(items("candidat-a", 3, true), TOUS_COMPARES, OPTIONS)).toBeNull();
  });
});

describe("candidats sous le seuil de couverture (conformité n° 30, §4 et §8)", () => {
  it("n'entre pas un candidat sous le seuil dans le test d'asymétrie, et le rapporte à part", () => {
    // A : 5 exactes. B : 5 exactes. C (sous le seuil) : 5 inexactes.
    // Avec C, la globale vaudrait 10/15 et l'écart de C |0 − 2/3| : une asymétrie fabriquée par un
    // candidat trop peu couvert pour être mesuré. Sans C : globale 10/10, écart 0, p = 201/201 = 1.
    const jeu = [...items("candidat-a", 5, true), ...items("candidat-b", 5, true), ...items("candidat-c", 5, false)];
    const partage = { compares: ["candidat-a", "candidat-b"], rapportes_a_part: ["candidat-c"] };

    const resultat = testHomogeneiteCandidats(jeu, partage, OPTIONS);

    expect(resultat?.statistique_observee).toBe(0);
    expect(resultat?.valeur_p).toBe(1);
    expect(resultat?.exactitude_outil).toEqual({ numerateur: 10, denominateur: 10, valeur: 1 });
    expect(resultat?.candidats.map((c) => c.candidat_id)).toEqual(["candidat-a", "candidat-b"]);
    expect(resultat?.candidats_rapportes_a_part).toEqual(["candidat-c"]);
  });

  it("ne teste rien quand un seul candidat reste au-dessus du seuil", () => {
    const jeu = [...items("candidat-a", 3, true), ...items("candidat-c", 3, false)];
    const partage = { compares: ["candidat-a"], rapportes_a_part: ["candidat-c"] };

    expect(testHomogeneiteCandidats(jeu, partage, OPTIONS)).toBeNull();
  });

  it("refuse un candidat des unités absent du partage", () => {
    const jeu = [...items("candidat-a", 2, true), ...items("candidat-x", 2, false)];

    expect(() => testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS)).toThrow(/candidat-x/);
  });
});

describe("famille de Holm du test d'asymétrie (conformité n° 82, protocole 0.11)", () => {
  /** Un résultat de test dont seule la valeur p compte ici. */
  function resultat(valeur_p: number) {
    return {
      statistique_observee: 0.1,
      valeur_p,
      permutations: 200,
      exactitude_outil: { numerateur: 1, denominateur: 2, valeur: 0.5 },
      candidats: [],
      candidats_rapportes_a_part: [],
    };
  }
  const ALPHA_ACT = { outil_id: "outil-alpha", mode: "web_activee" } as const;
  const ALPHA_DES = { outil_id: "outil-alpha", mode: "web_desactivee" } as const;
  const BETA_ACT = { outil_id: "outil-beta", mode: "web_activee" } as const;
  const BETA_DES = { outil_id: "outil-beta", mode: "web_desactivee" } as const;

  it("forme une famille d'une valeur p par couple outil × mode : deux outils × deux modes = quatre", () => {
    // m = 4. Triées : 0,01 · 0,03 · 0,04 · 0,20.
    // 0,01 × 4 = 0,04 ; 0,03 × 3 = 0,09 ; 0,04 × 2 = 0,08 → 0,09 ; 0,20 × 1 = 0,20.
    // Une famille par outil (m = 2) donnerait 0,02 pour alpha/web_activee : la famille compte.
    const famille = corrigerFamilleAsymetrie(
      [
        { couple: ALPHA_ACT, resultat: resultat(0.01) },
        { couple: ALPHA_DES, resultat: resultat(0.04) },
        { couple: BETA_ACT, resultat: resultat(0.03) },
        { couple: BETA_DES, resultat: resultat(0.2) },
      ],
      { compares: [ALPHA_ACT, ALPHA_DES, BETA_ACT, BETA_DES], incomplets: [] },
    );

    expect(famille.corrigees.map((c) => c.cle)).toEqual([
      "outil-alpha/web_activee",
      "outil-alpha/web_desactivee",
      "outil-beta/web_activee",
      "outil-beta/web_desactivee",
    ]);
    expect(famille.corrigees.map((c) => c.corrigee)).toEqual(
      [0.04, 0.09, 0.09, 0.2].map((v) => expect.closeTo(v, 12)),
    );
    expect(famille.couples_incomplets).toEqual([]);
    expect(famille.couples_sans_test).toEqual([]);
  });

  it("sort de la famille un couple marqué run incomplet, et le rapporte à part", () => {
    // beta/web_activee incomplet : m = 3. Triées : 0,01 · 0,04 · 0,20.
    // 0,01 × 3 = 0,03 ; 0,04 × 2 = 0,08 ; 0,20 × 1 = 0,20.
    const famille = corrigerFamilleAsymetrie(
      [
        { couple: ALPHA_ACT, resultat: resultat(0.01) },
        { couple: ALPHA_DES, resultat: resultat(0.04) },
        { couple: BETA_ACT, resultat: resultat(0.03) },
        { couple: BETA_DES, resultat: resultat(0.2) },
      ],
      { compares: [ALPHA_ACT, ALPHA_DES, BETA_DES], incomplets: [BETA_ACT] },
    );

    expect(famille.corrigees.map((c) => c.cle)).toEqual([
      "outil-alpha/web_activee",
      "outil-alpha/web_desactivee",
      "outil-beta/web_desactivee",
    ]);
    expect(famille.corrigees.map((c) => c.corrigee)).toEqual([0.03, 0.08, 0.2].map((v) => expect.closeTo(v, 12)));
    expect(famille.couples_incomplets).toEqual(["outil-beta/web_activee"]);
  });

  it("sort de la famille un couple sans test (moins de deux candidats), et le rapporte à part", () => {
    // alpha/web_desactivee sans test : m = 2. 0,01 × 2 = 0,02 ; 0,03 × 1 = 0,03.
    const famille = corrigerFamilleAsymetrie(
      [
        { couple: ALPHA_ACT, resultat: resultat(0.01) },
        { couple: ALPHA_DES, resultat: null },
        { couple: BETA_ACT, resultat: resultat(0.03) },
      ],
      { compares: [ALPHA_ACT, ALPHA_DES, BETA_ACT], incomplets: [] },
    );

    expect(famille.corrigees.map((c) => [c.cle, c.corrigee])).toEqual([
      ["outil-alpha/web_activee", expect.closeTo(0.02, 12)],
      ["outil-beta/web_activee", expect.closeTo(0.03, 12)],
    ]);
    expect(famille.couples_sans_test).toEqual(["outil-alpha/web_desactivee"]);
  });

  it("refuse une famille incomplète, un couple inconnu ou un couple en double", () => {
    const partage = { compares: [ALPHA_ACT, ALPHA_DES], incomplets: [] };
    // Un couple comparable sans résultat rétrécirait la famille, donc les valeurs corrigées.
    expect(() => corrigerFamilleAsymetrie([{ couple: ALPHA_ACT, resultat: resultat(0.01) }], partage)).toThrow(
      /outil-alpha\/web_desactivee/,
    );
    expect(() =>
      corrigerFamilleAsymetrie(
        [
          { couple: ALPHA_ACT, resultat: resultat(0.01) },
          { couple: ALPHA_DES, resultat: resultat(0.02) },
          { couple: BETA_ACT, resultat: resultat(0.03) },
        ],
        partage,
      ),
    ).toThrow(/outil-beta\/web_activee/);
    expect(() =>
      corrigerFamilleAsymetrie(
        [
          { couple: ALPHA_ACT, resultat: resultat(0.01) },
          { couple: ALPHA_ACT, resultat: resultat(0.02) },
          { couple: ALPHA_DES, resultat: resultat(0.03) },
        ],
        partage,
      ),
    ).toThrow(/double/);
  });
});

describe("contrat de rejeu depuis run.graines.permutation (constat n° 6)", () => {
  it("amorce le générateur par graineDerivee(graine_du_run, [\"permutation\", ...cle]), rien d'autre", () => {
    // Deux candidats, trois items chacun, profils mêlés : la valeur p dépend du flux aléatoire.
    // Un tiers qui rejoue les permutations avec la graine dérivée doit retrouver la même valeur p.
    const jeu = [
      ...items("candidat-a", 2, true, "a-exactes"),
      ...items("candidat-a", 1, false, "a-inexactes"),
      ...items("candidat-b", 1, true, "b-exactes"),
      ...items("candidat-b", 2, false, "b-inexactes"),
    ];
    const options = { permutations: 40, graine_du_run: 5, cle: ["outil-alpha", "web_activee"] };

    const grappes = grappesEtiquetees(jeu);
    const observee = ecartMaximal(grappes);
    const rng = generateur(graineDerivee(5, ["permutation", "outil-alpha", "web_activee"]));
    let extremes = 0;
    for (let i = 0; i < 40; i += 1) {
      if (ecartMaximal(permuterEtiquettes(grappes, rng)) >= observee - 1e-12) extremes += 1;
    }

    expect(testHomogeneiteCandidats(jeu, TOUS_COMPARES, options)?.valeur_p).toBe((1 + extremes) / 41);
  });
});

describe("permutation des étiquettes", () => {
  it("déplace les étiquettes entre items : toutes les réponses d'un item changent ensemble", () => {
    // Trois items aux profils distincts : a (1 exacte sur 2), b (3 sur 3), c (0 sur 1).
    // Après permutation, chaque item garde SES comptages ; seules les étiquettes bougent.
    const itemA = ulid("item-a");
    const jeu = [
      unite({ grappe_id: itemA, item_principal_id: itemA, candidat_id: "candidat-a", categorie: "exacte" }),
      unite({ grappe_id: itemA, item_principal_id: itemA, candidat_id: "candidat-a", categorie: "inexacte" }),
      ...grappe("item-b", 3, { candidat_id: "candidat-b", categorie: "exacte" }),
      ...grappe("item-c", 1, { candidat_id: "candidat-c", categorie: "inexacte" }),
    ];
    const avant = grappesEtiquetees(jeu);
    expect(avant.map((g) => `${g.exactes}/${g.classees}`).sort()).toEqual(["0/1", "1/2", "3/3"]);

    const apres = permuterEtiquettes(avant, generateur(graineDepuisTexte("graine-16")));

    // Les comptages restent collés à leur item : aucune réponse n'a changé d'item.
    const profil = (g: { grappe_id: string; exactes: number; classees: number }) =>
      `${g.grappe_id}:${g.exactes}/${g.classees}`;
    expect(apres.map(profil).sort()).toEqual(avant.map(profil).sort());
    // Le multi-ensemble d'étiquettes est conservé, et au moins un item a changé de candidat.
    expect(apres.map((g) => g.candidat_id).sort()).toEqual(avant.map((g) => g.candidat_id).sort());
    expect(apres.map((g) => g.candidat_id)).not.toEqual(avant.map((g) => g.candidat_id));
  });

  it("refuse un item dont les réponses portent deux candidats différents", () => {
    const jeu = [
      ...grappe("item-melange", 1, { candidat_id: "candidat-a" }),
      ...grappe("item-melange", 1, { candidat_id: "candidat-b" }),
    ];

    expect(() => grappesEtiquetees(jeu)).toThrow(/candidat/);
  });

  it("écarte les questions sans candidat et les items sans réponse classée", () => {
    const jeu = [
      ...grappe("item-att", 2, { candidat_id: null, gabarit: "Q-ATT" }),
      ...grappe("item-sans-classee", 2, { candidat_id: "candidat-a", categorie: "non_reponse" }),
      ...grappe("item-utile", 1, { candidat_id: "candidat-a", categorie: "exacte" }),
    ];

    const grappes = grappesEtiquetees(jeu);

    expect(grappes).toHaveLength(1);
    expect(ecartMaximal(grappes)).toBe(0);
  });
});
