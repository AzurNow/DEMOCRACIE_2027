/**
 * Graine dérivée de chaque intervalle et de chaque test (§8, « graine publiée » ; constat n° 6 de
 * la passe de conformité du 2026-09-24).
 *
 * Les trois vecteurs ci-dessous ont été calculés HORS du code du dépôt, en shell :
 *
 *   printf '20261201\0bootstrap\0outil-alpha\0web_desactivee\0exactitude\0global' \
 *     | shasum -a 256 | cut -c1-16
 *
 * soit les huit premiers octets du sha256, lus en gros-boutiste. Un tiers qui réimplémente la
 * règle dans un autre langage doit retrouver ces trois valeurs, et c'est tout ce qu'il lui faut
 * pour rejouer un intervalle publié à partir de `run.graines`.
 */

import { describe, expect, it } from "vitest";
import { graineDerivee } from "../../analysis/graines.ts";
import { intervalleBootstrap, reechantillonner } from "../../analysis/bootstrap.ts";
import { exactitude } from "../../analysis/metriques.ts";
import { testHomogeneiteCandidats } from "../../analysis/permutation.ts";
import { grappe } from "./fabriques.ts";

describe("vecteurs de test de la dérivation", () => {
  it("vecteur 1 : entier de run ordinaire, clé de bootstrap à cinq composants", () => {
    const cle = ["bootstrap", "outil-alpha", "web_desactivee", "exactitude", "global"];
    expect(graineDerivee(20261201, cle)).toBe(0xd8bcfbd164a58f33n);
    expect(graineDerivee(20261201, cle)).toBe(15617634484569345843n);
  });

  it("vecteur 2 : entier nul, écrit « 0 » et non chaîne vide", () => {
    expect(graineDerivee(0, ["permutation", "outil-alpha", "web_activee"])).toBe(0x338c12d320c61051n);
  });

  it("vecteur 3 : plus grand entier exactement représentable (2⁵³ − 1)", () => {
    expect(graineDerivee(9007199254740991, ["bootstrap", "comparateur-un", "couverture"])).toBe(
      0xc283296465a5ca10n,
    );
  });
});

describe("indépendance des graines", () => {
  const base = ["bootstrap", "outil-alpha", "web_desactivee"];

  it("deux clés différentes donnent deux graines différentes", () => {
    const a = graineDerivee(20261201, [...base, "exactitude", "global"]);
    const b = graineDerivee(20261201, [...base, "non_reponse", "global"]);
    expect(a).not.toBe(b);
    expect(b).toBe(0x0521b77d4381d398n);
  });

  it("ajouter une métrique ne change la graine d'aucune autre", () => {
    // La graine ne dépend que de l'entier et de SA clé : ni d'un compteur, ni de l'ordre des
    // appels, ni de la liste des autres métriques du run.
    const metriques = ["exactitude", "non_reponse", "fabrication"];
    const avant = metriques.map((m) => graineDerivee(20261201, [...base, m, "global"]));
    const apres = [...metriques, "sourcage_valide"].map((m) => graineDerivee(20261201, [...base, m, "global"]));
    expect(apres.slice(0, 3)).toEqual(avant);
  });

  it("la position des composants compte : un composant ne glisse pas dans son voisin", () => {
    expect(graineDerivee(1, ["ab", "c"])).not.toBe(graineDerivee(1, ["a", "bc"]));
    expect(graineDerivee(12, ["3"])).not.toBe(graineDerivee(1, ["23"]));
  });
});

describe("refus des entrées qui ne s'écrivent pas de façon unique", () => {
  it("refuse un entier de run négatif (le schéma du run impose minimum 0)", () => {
    expect(() => graineDerivee(-1, ["bootstrap"])).toThrow(/entier/);
  });

  it("refuse un entier de run non entier", () => {
    expect(() => graineDerivee(1.5, ["bootstrap"])).toThrow(/entier/);
    expect(() => graineDerivee(Number.NaN, ["bootstrap"])).toThrow(/entier/);
    expect(() => graineDerivee(Number.POSITIVE_INFINITY, ["bootstrap"])).toThrow(/entier/);
  });

  it("refuse un entier au-delà de 2⁵³ − 1, qui n'a plus d'écriture décimale exacte en JavaScript", () => {
    expect(() => graineDerivee(2 ** 53, ["bootstrap"])).toThrow(/2\^53/);
  });

  it("refuse une clé vide, un composant vide et un composant contenant le séparateur", () => {
    expect(() => graineDerivee(1, [])).toThrow(/clé/);
    expect(() => graineDerivee(1, ["bootstrap", ""])).toThrow(/vide/);
    expect(() => graineDerivee(1, ["a\0b"])).toThrow(/séparateur/);
  });
});

describe("les intervalles et les tests se rejouent depuis la graine du run", () => {
  function dixGrappes() {
    const jeu = [];
    for (let i = 0; i < 7; i += 1) jeu.push(...grappe(`g-exacte-${i}`, 1, { categorie: "exacte" }));
    for (let i = 0; i < 3; i += 1) jeu.push(...grappe(`g-inexacte-${i}`, 1, { categorie: "inexacte" }));
    return jeu;
  }

  it("même graine de run et même clé : mêmes bornes ; autre clé : autre tirage", () => {
    const options = { reechantillonnages: 200, graine_du_run: 20261201, cle: ["outil-alpha", "exactitude"] };
    const a = intervalleBootstrap(dixGrappes(), exactitude, options);
    const b = intervalleBootstrap(dixGrappes(), exactitude, options);
    const autreCle = { ...options, cle: ["outil-beta", "exactitude"] };

    expect(a).toEqual(b);
    // Les bornes sur dix grappes avancent par pas de 0,1 et peuvent coïncider : on compare le flux.
    expect(reechantillonner(dixGrappes(), exactitude, autreCle).valeurs).not.toEqual(
      reechantillonner(dixGrappes(), exactitude, options).valeurs,
    );
  });

  it("un appel intermédiaire sur une autre clé ne décale pas le flux d'une clé donnée", () => {
    const options = { reechantillonnages: 200, graine_du_run: 7, cle: ["outil-alpha", "exactitude"] };
    const seul = intervalleBootstrap(dixGrappes(), exactitude, options);
    intervalleBootstrap(dixGrappes(), exactitude, { ...options, cle: ["outil-alpha", "non_reponse"] });
    const apres = intervalleBootstrap(dixGrappes(), exactitude, options);

    expect(apres).toEqual(seul);
  });

  it("refuse une graine de run invalide dans le bootstrap comme dans la permutation", () => {
    const jeu = dixGrappes();
    expect(() =>
      intervalleBootstrap(jeu, exactitude, { reechantillonnages: 10, graine_du_run: -3, cle: ["x"] }),
    ).toThrow(/entier/);
    expect(() =>
      testHomogeneiteCandidats(
        [...grappe("a", 1, { candidat_id: "candidat-a" }), ...grappe("b", 1, { candidat_id: "candidat-b" })],
        { permutations: 10, graine_du_run: 0.5, cle: ["x"] },
      ),
    ).toThrow(/entier/);
  });
});
