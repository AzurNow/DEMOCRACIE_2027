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
  ecartMaximal,
  grappesEtiquetees,
  permuterEtiquettes,
  PERMUTATIONS_PRODUCTION,
  testHomogeneiteCandidats,
} from "../../analysis/permutation.ts";
import { grappe, ulid, unite } from "./fabriques.ts";

const OPTIONS = { permutations: 200, graine_du_run: 20261201, cle: ["test", "permutation"] };

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

    const resultat = testHomogeneiteCandidats(jeu, OPTIONS);

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

    const resultat = testHomogeneiteCandidats(jeu, OPTIONS);

    expect(resultat?.statistique_observee).toBeCloseTo(0.75, 12);
    expect(resultat?.valeur_p).toBeCloseTo(1 / 201, 12);
    expect(resultat?.candidats.find((c) => c.candidat_id === "candidat-d")?.exactitude).toEqual({
      numerateur: 0,
      denominateur: 5,
      valeur: 0,
    });
    expect(PERMUTATIONS_PRODUCTION).toBe(10000);
  });

  it("ne teste rien quand il n'y a pas deux candidats à comparer", () => {
    expect(testHomogeneiteCandidats([], OPTIONS)).toBeNull();
    expect(testHomogeneiteCandidats(items("candidat-a", 3, true), OPTIONS)).toBeNull();
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

    expect(testHomogeneiteCandidats(jeu, options)?.valeur_p).toBe((1 + extremes) / 41);
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
