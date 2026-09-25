/**
 * Effets de condition (§8 0.3, QR6/H2/H3) : « Différences appariées par item entre modes et entre
 * formulations, intervalle par bootstrap en grappes. […] Aucune valeur p n'est définie pour cette
 * famille […]. La correction de Holm ne s'y applique donc pas — elle ne vaut que pour le test
 * d'asymétrie, seul endroit du protocole où une valeur p est calculée. »
 */

import { describe, expect, it } from "vitest";
import { differenceAppariee, reechantillonnerDifference } from "../../analysis/bootstrap.ts";
import { comparerConditions, pairesParFormulation, pairesParMode } from "../../analysis/conditions.ts";
import { exactitude } from "../../analysis/metriques.ts";
import { grappe, ulid, unite } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 100, graine_du_run: 20261201, cle: ["test", "conditions"] };

/** Les seules clés qu'une comparaison de condition publie : aucune ne porte une valeur p. */
const CLES_COMPARAISON = ["cle", "difference", "grappes_appariees", "grappes_exclues"];

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
    // Une seule grappe appariée : §8 (0.9), « un intervalle calculé sur une seule grappe est
    // dégénéré : la différence correspondante n'est qualifiée ni d'« établie » ni de « non
    // établie », elle est publiée avec la mention « une seule grappe ». »
    expect(comparaison?.difference.intervalle?.degenere).toBe("grappe_unique");
    expect(comparaison?.difference.qualificatif).toBeNull();
  });

  it("ne rend aucune comparaison quand aucun item n'est commun aux deux bras", () => {
    const a = grappe("item-a", 1, { mode: "web_activee" });
    const b = grappe("item-b", 1, { mode: "web_desactivee", categorie: "inexacte" });

    const [comparaison] = comparerConditions([{ cle: "outil-alpha:modes", a, b }], exactitude, OPTIONS);

    expect(comparaison?.grappes_appariees).toBe(0);
    expect(comparaison?.difference.difference).toBeNull();
    expect(comparaison?.difference.qualificatif).toBeNull();
    expect(comparaison?.difference.intervalle).toBeNull();
  });
});

describe("aucune valeur p dans les effets de condition (§8 0.3)", () => {
  it("une comparaison de modes n'expose que la différence, son appariement et ses exclusions", () => {
    const jeu = [
      ...grappe("i1", 1, { mode: "web_activee", categorie: "exacte" }),
      ...grappe("i1", 1, { mode: "web_desactivee", categorie: "inexacte" }),
      ...grappe("i2", 1, { mode: "web_activee", categorie: "exacte" }),
      ...grappe("i2", 1, { mode: "web_desactivee", categorie: "inexacte" }),
    ];

    const comparaisons = comparerConditions(pairesParMode(jeu), exactitude, OPTIONS);

    expect(comparaisons).toHaveLength(1);
    expect(Object.keys(comparaisons[0] as object).sort()).toEqual(CLES_COMPARAISON);
  });

  it("une comparaison de formulations n'expose que la différence, son appariement et ses exclusions", () => {
    const jeu = [
      ...grappe("i1", 1, { registre: "neutre", categorie: "exacte" }),
      ...grappe("i1", 1, { registre: "familier", categorie: "inexacte" }),
    ];

    const comparaisons = comparerConditions(pairesParFormulation(jeu), exactitude, OPTIONS);

    expect(comparaisons).toHaveLength(1);
    expect(Object.keys(comparaisons[0] as object).sort()).toEqual(CLES_COMPARAISON);
  });

  it("une comparaison sans différence calculable n'expose pas davantage de champ de valeur p", () => {
    const a = grappe("item-a", 1, { mode: "web_activee" });
    const b = grappe("item-b", 1, { mode: "web_desactivee" });

    const [comparaison] = comparerConditions([{ cle: "outil-alpha:modes", a, b }], exactitude, OPTIONS);

    expect(Object.keys(comparaison as object).sort()).toEqual(CLES_COMPARAISON);
  });

  it("aucune correction de famille : chaque comparaison vaut ce qu'elle vaut seule", () => {
    // La correction de Holm « ne s'y applique donc pas ». Comparer une paire seule ou au sein
    // de sa famille doit donner exactement le même objet.
    const paires = [
      { cle: "outil-alpha", a: grappe("i1", 4, { categorie: "exacte" }), b: grappe("i1", 4, { categorie: "inexacte" }) },
      { cle: "outil-beta", a: grappe("i2", 4, { categorie: "exacte" }), b: grappe("i2", 4, { categorie: "exacte" }) },
    ];

    const enFamille = comparerConditions(paires, exactitude, OPTIONS);
    const uneAUne = paires.flatMap((paire) => comparerConditions([paire], exactitude, OPTIONS));

    expect(enFamille).toEqual(uneAUne);
  });
});

describe("graine de chaque comparaison (constat n° 6)", () => {
  it("dérive la graine d'une paire de la clé de l'appelant suivie de la clé de la paire", () => {
    // Six items aux différences mêlées : l'intervalle dépend du flux aléatoire, donc de la clé.
    const profils: readonly (readonly [boolean, boolean])[] = [
      [true, false], [true, true], [false, false], [true, false], [false, true], [true, false],
    ];
    const a = profils.flatMap(([exacte], i) => grappe(`i${i}`, 1, { categorie: exacte ? "exacte" : "inexacte" }));
    const b = profils.flatMap(([, exacte], i) => grappe(`i${i}`, 1, { categorie: exacte ? "exacte" : "inexacte" }));

    const [comparaison] = comparerConditions([{ cle: "outil-alpha:web_activee-web_desactivee", a, b }], exactitude, OPTIONS);
    const attendue = differenceAppariee(a, b, exactitude, {
      ...OPTIONS,
      cle: [...OPTIONS.cle, "outil-alpha:web_activee-web_desactivee"],
    });

    expect(comparaison?.difference).toEqual(attendue);
    // La clé de la paire fait partie de la clé : le flux diffère de celui de la seule clé de l'appelant.
    expect(
      reechantillonnerDifference(a, b, exactitude, { ...OPTIONS, cle: [...OPTIONS.cle, "outil-alpha:web_activee-web_desactivee"] })
        .valeurs,
    ).not.toEqual(reechantillonnerDifference(a, b, exactitude, OPTIONS).valeurs);
  });
});

describe("familles de comparaisons", () => {
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

  it("la famille des formulations compte exactement les trois paires, dans l'ordre figé, à outil et mode constants", () => {
    // §8 0.3 : « neutre contre familière, neutre contre orientée, familière contre orientée ».
    // Deux outils, deux modes, trois registres : 2 × 2 groupes, trois paires chacun, 12 en tout.
    const outils = ["outil-alpha", "outil-beta"];
    const modes = ["web_activee", "web_desactivee"] as const;
    const registres = ["oriente", "familier", "neutre"] as const;
    const jeu = outils.flatMap((outil_id) =>
      modes.flatMap((mode) =>
        registres.flatMap((registre) => grappe("i1", 1, { outil_id, mode, registre })),
      ),
    );

    const paires = pairesParFormulation(jeu);

    const attendues = outils.flatMap((outil_id) =>
      modes.flatMap((mode) =>
        ["neutre-familier", "neutre-oriente", "familier-oriente"].map((p) => `${outil_id}:${mode}:${p}`),
      ),
    );
    expect(paires.map((p) => p.cle)).toEqual(attendues);
    for (const paire of paires) {
      const membres = [...paire.a, ...paire.b];
      expect(new Set(membres.map((u) => u.outil_id)).size).toBe(1);
      expect(new Set(membres.map((u) => u.mode)).size).toBe(1);
      const [premier, second] = (paire.cle.split(":")[2] as string).split("-");
      expect(paire.a.every((u) => u.registre === premier)).toBe(true);
      expect(paire.b.every((u) => u.registre === second)).toBe(true);
    }
  });
});
