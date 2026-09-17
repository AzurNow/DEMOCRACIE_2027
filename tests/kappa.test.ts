/**
 * Kappa de Cohen — cas vérifiés à la main.
 *
 * Chaque cas porte son arithmétique en commentaire. Un test de calcul dont on ne peut pas
 * refaire le calcul de tête ne prouve rien : il fige ce que le code fait, pas ce qu'il doit
 * faire. Notation utilisée : A = somme de la diagonale, B = somme des produits marginaux,
 * κ = (A·n − B) / (n² − B).
 */

import { describe, expect, it } from "vitest";
import {
  alerteReannotation,
  CATEGORIES_KAPPA,
  categorieDe,
  kappaCohen,
  kappaPublie,
  kappaQuestion,
} from "../validation/domaine/kappa.ts";
import type { Decision } from "../validation/domaine/types.ts";

/** Fabrique n paires identiques, pour écrire une matrice de confusion en clair. */
function paires(cellules: readonly (readonly [Decision, Decision, number])[]) {
  const liste: { a: Decision; b: Decision }[] = [];
  for (const [a, b, effectif] of cellules) {
    for (let i = 0; i < effectif; i += 1) liste.push({ a, b });
  }
  return liste;
}

describe("catégories du kappa publié", () => {
  it("fond accepter et corriger en « retenu », sépare rejeté et non évaluable", () => {
    expect(categorieDe("accepter")).toBe("retenu");
    expect(categorieDe("corriger")).toBe("retenu");
    expect(categorieDe("rejeter")).toBe("rejete");
    expect(categorieDe("non_evaluable")).toBe("non_evaluable");
  });

  it("fixe trois catégories a priori, dans un ordre stable", () => {
    expect(CATEGORIES_KAPPA).toEqual(["retenu", "rejete", "non_evaluable"]);
  });
});

describe("kappa de Cohen, cas calculés à la main", () => {
  it("κ = 0,4 sur un 2×2 : n=50, A=35, B=1250", () => {
    // retenu/retenu 20 · retenu/rejeté 5 · rejeté/retenu 10 · rejeté/rejeté 15
    // A = 20+15 = 35 → p₀ = 35/50 = 0,70
    // marges : (25,25) et (30,20) → B = 25·30 + 25·20 = 1250 → pₑ = 1250/2500 = 0,50
    // κ = (35·50 − 1250) / (2500 − 1250) = 500/1250 = 0,4
    const resultat = kappaPublie(
      paires([
        ["accepter", "accepter", 20],
        ["accepter", "rejeter", 5],
        ["rejeter", "accepter", 10],
        ["rejeter", "rejeter", 15],
      ]),
    );
    expect(resultat.kappa).toBe(0.4);
    expect(resultat.accord_observe).toBe(0.7);
    expect(resultat.accord_attendu).toBe(0.5);
    expect(resultat.n).toBe(50);
    expect(resultat.motif_indefini).toBeNull();
  });

  it("la troisième catégorie inutilisée ne déforme pas le résultat", () => {
    // Même matrice que ci-dessus : les marges de « non évaluable » valent 0, leur produit aussi.
    const avec = kappaPublie(
      paires([
        ["accepter", "accepter", 20],
        ["accepter", "rejeter", 5],
        ["rejeter", "accepter", 10],
        ["rejeter", "rejeter", 15],
      ]),
    );
    const sans = kappaCohen(
      paires([
        ["accepter", "accepter", 20],
        ["accepter", "rejeter", 5],
        ["rejeter", "accepter", 10],
        ["rejeter", "rejeter", 15],
      ]).map((p) => ({ a: categorieDe(p.a), b: categorieDe(p.b) })),
      ["retenu", "rejete"],
    );
    expect(avec.kappa).toBe(sans.kappa);
  });

  it("κ = 0,80 exactement : la frontière du §4 ne déclenche pas l'alerte", () => {
    // 23/2/3/22 → A = 45 → p₀ = 0,90 ; marges (25,25) et (26,24)
    // B = 25·26 + 25·24 = 1250 → pₑ = 0,50 ; κ = (45·50 − 1250)/1250 = 1000/1250 = 0,8
    const resultat = kappaPublie(
      paires([
        ["accepter", "accepter", 23],
        ["accepter", "rejeter", 2],
        ["rejeter", "accepter", 3],
        ["rejeter", "rejeter", 22],
      ]),
    );
    expect(resultat.kappa).toBe(0.8);
    expect(alerteReannotation(resultat)).toBe(false);
  });

  it("κ juste sous 0,80 déclenche l'alerte", () => {
    // 23/2/4/21 → A = 44 → p₀ = 0,88 ; marges (25,25) et (27,23)
    // B = 25·27 + 25·23 = 1250 ; κ = (44·50 − 1250)/1250 = 950/1250 = 0,76
    const resultat = kappaPublie(
      paires([
        ["accepter", "accepter", 23],
        ["accepter", "rejeter", 2],
        ["rejeter", "accepter", 4],
        ["rejeter", "rejeter", 21],
      ]),
    );
    expect(resultat.kappa).toBe(0.76);
    expect(alerteReannotation(resultat)).toBe(true);
  });

  it("κ = −1 en désaccord total", () => {
    // 0/25/25/0 → A = 0 ; marges (25,25) et (25,25) → B = 1250
    // κ = (0 − 1250)/(2500 − 1250) = −1
    const resultat = kappaPublie(
      paires([
        ["accepter", "rejeter", 25],
        ["rejeter", "accepter", 25],
      ]),
    );
    expect(resultat.kappa).toBe(-1);
    expect(alerteReannotation(resultat)).toBe(true);
  });

  it("κ sur trois catégories réellement utilisées : 284/434", () => {
    // lignes = annotateur A, colonnes = annotateur B, n = 30
    //   retenu       [18, 2, 1] → 21
    //   rejeté       [ 1, 4, 0] →  5
    //   non évaluable[ 1, 0, 3] →  4
    //   colonnes : 20, 6, 4
    // A = 18+4+3 = 25 ; B = 21·20 + 5·6 + 4·4 = 420+30+16 = 466
    // κ = (25·30 − 466) / (900 − 466) = 284/434
    const resultat = kappaPublie(
      paires([
        ["accepter", "corriger", 18],
        ["accepter", "rejeter", 2],
        ["accepter", "non_evaluable", 1],
        ["rejeter", "accepter", 1],
        ["rejeter", "rejeter", 4],
        ["non_evaluable", "accepter", 1],
        ["non_evaluable", "non_evaluable", 3],
      ]),
    );
    expect(resultat.kappa).toBe(284 / 434);
    expect(resultat.accord_observe).toBe(25 / 30);
    expect(resultat.accord_attendu).toBe(466 / 900);
    expect(resultat.n).toBe(30);
  });
});

describe("kappa indéfini", () => {
  it("unanimité des deux annotateurs : null, et surtout pas 1", () => {
    // A = 50 → p₀ = 1 ; marges (50,50) → B = 2500 → pₑ = 1 ; dénominateur nul.
    const resultat = kappaPublie(paires([["accepter", "accepter", 50]]));
    expect(resultat.kappa).toBeNull();
    expect(resultat.motif_indefini).toBe("accord_attendu_maximal");
    expect(resultat.accord_observe).toBe(1);
    expect(resultat.accord_attendu).toBe(1);
    expect(resultat.n).toBe(50);
  });

  it("ne déclenche jamais de réannotation : un accord parfait n'est pas un désaccord", () => {
    expect(alerteReannotation(kappaPublie(paires([["accepter", "accepter", 50]])))).toBe(false);
  });

  it("aucun item commun : null, avec son propre motif, et pas d'accord observé inventé", () => {
    const resultat = kappaPublie([]);
    expect(resultat.kappa).toBeNull();
    expect(resultat.motif_indefini).toBe("aucun_item_commun");
    expect(resultat.accord_observe).toBeNull();
    expect(resultat.accord_attendu).toBeNull();
    expect(resultat.n).toBe(0);
  });

  it("unanimité sur « non évaluable » aussi : la dégénérescence ne dépend pas de la catégorie", () => {
    const resultat = kappaPublie(paires([["non_evaluable", "non_evaluable", 12]]));
    expect(resultat.kappa).toBeNull();
    expect(resultat.motif_indefini).toBe("accord_attendu_maximal");
  });
});

describe("kappa par question de la grille", () => {
  it("écarte les paires dont une réponse est sans objet, sans les compter comme désaccord", () => {
    // 8 paires utilisables : 3 oui/oui, 1 oui/non, 1 non/oui, 3 non/non
    // A = 6 → p₀ = 0,75 ; marges (4,4) et (4,4) → B = 16+16 = 32 → pₑ = 32/64 = 0,5
    // κ = (6·8 − 32)/(64 − 32) = 16/32 = 0,5
    const resultat = kappaQuestion([
      { a: true, b: true },
      { a: true, b: true },
      { a: true, b: true },
      { a: true, b: false },
      { a: false, b: true },
      { a: false, b: false },
      { a: false, b: false },
      { a: false, b: false },
      { a: null, b: false },
      { a: true, b: null },
      { a: null, b: null },
    ]);
    expect(resultat.n).toBe(8);
    expect(resultat.kappa).toBe(0.5);
  });

  it("ne renvoie aucun kappa quand la question est sans objet pour tout le lot", () => {
    const resultat = kappaQuestion([
      { a: null, b: null },
      { a: null, b: null },
    ]);
    expect(resultat.kappa).toBeNull();
    expect(resultat.motif_indefini).toBe("aucun_item_commun");
    expect(resultat.n).toBe(0);
  });
});

describe("garde-fous", () => {
  it("lève sur une catégorie hors du jeu fixé a priori, au lieu de l'ignorer", () => {
    expect(() => kappaCohen([{ a: "retenu", b: "inconnue" as "retenu" }], CATEGORIES_KAPPA)).toThrow(
      /hors du jeu fixé a priori/,
    );
  });
});
