/**
 * Protocole 0.9 (§5, « Items d'absence et items fictifs ») : « Une mesure fictive porte un seul
 * item fictif : pour éprouver la même invention chez deux candidats, on déclare deux mesures. »
 *
 * La règle vit une fois (`validation/domaine/fictif-unique.ts`) et se lit à deux endroits : à la
 * promotion vers `data/`, qui refuse le second item F vérifié par une erreur nommée, et dans les
 * invariants inter-fichiers joués par `pnpm symmetry`.
 */

import { describe, expect, it } from "vitest";
import { fictifsEnDouble, ItemFictifEnDouble, verifierFictifUnique } from "../validation/domaine/fictif-unique.ts";
import { unSeulItemFictifParMesure } from "../pipeline/questions/invariants.ts";
import { itemF, itemP } from "./aides/fabriques.ts";

const MESURE_FICTIVE = "01JBANCESSA90000000MESVRE2";
const F1 = itemF({ id: "01JBANCESSA1000000001TEMF1", candidat_id: "demo-alpha", statut_validation: "verifie" });
const F2 = itemF({ id: "01JBANCESSA1000000001TEMF2", candidat_id: "demo-beta", statut_validation: "verifie" });
const F_AUTRE = itemF({
  id: "01JBANCESSA1000000001TEMF3",
  candidat_id: "demo-beta",
  mesure_id: "01JBANCESSA90000000MESVRE3",
  statut_validation: "verifie",
});

describe("une mesure fictive porte un seul item F vérifié", () => {
  it("deux items F vérifiés sur la même mesure : groupe en double, identifiants triés", () => {
    expect([...fictifsEnDouble([F2, F1])]).toEqual([[MESURE_FICTIVE, [F1.id, F2.id]]]);
  });

  it("un item F par mesure : rien", () => {
    expect(fictifsEnDouble([F1, F_AUTRE]).size).toBe(0);
  });

  it("un second item F non vérifié ne compte pas (il n'engendre rien)", () => {
    expect(fictifsEnDouble([F1, { ...F2, statut_validation: "rejete" }]).size).toBe(0);
  });

  it("un item P sur la même mesure ne compte pas comme item fictif", () => {
    expect(fictifsEnDouble([F1, itemP({ id: "01JBANCESSA1000000001TEMP9", mesure_id: MESURE_FICTIVE, statut_validation: "verifie" })]).size).toBe(0);
  });
});

describe("promotion : le second item F vérifié est refusé", () => {
  it("contre un item F déjà dans data/ : ItemFictifEnDouble, qui nomme la mesure et les items", () => {
    let erreur: unknown;
    try {
      verifierFictifUnique([F2], [F1]);
    } catch (levee) {
      erreur = levee;
    }
    expect(erreur).toBeInstanceOf(ItemFictifEnDouble);
    expect((erreur as ItemFictifEnDouble).mesure_id).toBe(MESURE_FICTIVE);
    expect((erreur as ItemFictifEnDouble).item_ids).toEqual([F1.id, F2.id]);
  });

  it("deux items F promus ensemble sur la même mesure : refusés", () => {
    expect(() => verifierFictifUnique([F1, F2], [])).toThrow(ItemFictifEnDouble);
  });

  it("le même item présent des deux côtés n'est pas un doublon", () => {
    expect(() => verifierFictifUnique([F1], [F1])).not.toThrow();
  });

  it("un item F par mesure : accepté", () => {
    expect(() => verifierFictifUnique([F_AUTRE], [F1])).not.toThrow();
  });
});

describe("invariant inter-fichiers joué par pnpm symmetry", () => {
  it("nomme la mesure fictive portée par deux items F vérifiés", () => {
    const violations = unSeulItemFictifParMesure([F1, F2, F_AUTRE]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.objet).toBe(MESURE_FICTIVE);
    expect(violations[0]?.detail).toContain(F1.id);
    expect(violations[0]?.detail).toContain(F2.id);
  });

  it("ne rend rien sur un jeu conforme", () => {
    expect(unSeulItemFictifParMesure([F1, F_AUTRE])).toEqual([]);
  });
});
