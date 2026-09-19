/**
 * Découpage du texte canonique aux offsets d'une citation — logique pure extraite de
 * `validation/client/source.ts` (docs/DETTE.md, décision du 2026-09-18).
 *
 * Le point commun de tous les cas emoji/idéogramme : un découpage en unités UTF-16 (par ex.
 * `texte.slice(debut, fin)`) donnerait la même réponse qu'un découpage en points de code sur du
 * texte purement ASCII, et une réponse **différente et fausse** dès qu'un caractère précède la
 * citation hors du plan de base Unicode. Les assertions comparent donc le résultat à ce que
 * `slice` en unités UTF-16 produirait, pour qu'un retour en arrière fasse échouer le test.
 */

import { describe, expect, it } from "vitest";
import { decouperAuxOffsets, ErreurDecoupage } from "../validation/domaine/decoupage.ts";

describe("decouperAuxOffsets", () => {
  it("1. texte ASCII : les trois tranches se recollent en le texte d'origine", () => {
    const texte = "Nous ramenerons la TVA a 5,5 %.";
    const debut = texte.indexOf("ramenerons");
    const fin = debut + "ramenerons".length;
    const decoupage = decouperAuxOffsets(texte, { debut, fin });
    expect(decoupage.surlignage).toBe("present");
    if (decoupage.surlignage !== "present") throw new Error("inattendu");
    expect(decoupage.avant + decoupage.citation + decoupage.apres).toBe(texte);
    expect(decoupage.citation).toBe("ramenerons");
  });

  it("2. emoji avant la citation : le surlignage tombe exactement sur la citation", () => {
    // « 🌍 » occupe deux unités UTF-16 et un seul point de code.
    const texte = "Objectif 🌍 : neutralite carbone en 2050.";
    // Offsets en points de code (calculés à la main) : « Objectif »(0-7) espace(8) 🌍(9)
    // espace(10) « : »(11) espace(12) → la citation commence au point de code 13.
    const debut = 13;
    const fin = debut + "neutralite carbone".length;
    const decoupage = decouperAuxOffsets(texte, { debut, fin });
    if (decoupage.surlignage !== "present") throw new Error("inattendu");
    expect(decoupage.citation).toBe("neutralite carbone");

    // Un découpage en unités UTF-16 utiliserait les mêmes offsets sur `texte.length` (qui
    // compte 🌍 pour deux) et décalerait donc la tranche d'un caractère vers la fin.
    const decoupageUtf16Errone = texte.slice(debut, fin);
    expect(decoupageUtf16Errone).not.toBe(decoupage.citation);
  });

  it("3. idéogramme hors du plan de base : même vérification", () => {
    // « 𠜎 » (U+2070E) est hors du plan de base Unicode : deux unités UTF-16, un point de code.
    const texte = "Mesure 𠜎 : plafonnement des loyers en zone tendue.";
    // Offset en points de code (et non en .length, qui compterait 𠜎 pour deux unités).
    const prefixe = [..."Mesure 𠜎 : "].length;
    const fin = prefixe + [..."plafonnement"].length;
    const decoupage = decouperAuxOffsets(texte, { debut: prefixe, fin });
    if (decoupage.surlignage !== "present") throw new Error("inattendu");
    expect(decoupage.citation).toBe("plafonnement");
    // Le même intervalle appliqué en unités UTF-16 (`.slice`) serait décalé d'un caractère.
    expect(texte.slice(prefixe, fin)).not.toBe(decoupage.citation);
  });

  it("4. guillemets typographiques : les offsets désignent le texte brut, pas le texte normalisé", () => {
    const texte = 'Le candidat a dit : «ce sera 62 ans».';
    const debut = texte.indexOf("«");
    const fin = texte.indexOf("»") + 1;
    const decoupage = decouperAuxOffsets(texte, { debut, fin });
    if (decoupage.surlignage !== "present") throw new Error("inattendu");
    expect(decoupage.citation).toBe("«ce sera 62 ans»");
  });

  it("5. intervalle semi-ouvert [3, 5) prend deux caractères, jamais trois", () => {
    const decoupage = decouperAuxOffsets("abcdef", { debut: 3, fin: 5 });
    if (decoupage.surlignage !== "present") throw new Error("inattendu");
    expect(decoupage.citation).toBe("de");
    expect(decoupage.citation).toHaveLength(2);
  });

  it("6. offsets absents : aucune tranche mise en avant, état explicite", () => {
    const decoupage = decouperAuxOffsets("un texte quelconque", null);
    expect(decoupage.surlignage).toBe("absent");
    if (decoupage.surlignage !== "absent") throw new Error("inattendu");
    expect(decoupage.texte).toBe("un texte quelconque");
  });

  it("7. offsets hors bornes (fin au-delà de la longueur) : erreur nommée", () => {
    expect(() => decouperAuxOffsets("abc", { debut: 0, fin: 4 })).toThrow(ErreurDecoupage);
  });

  it("8. debut strictement supérieur à fin : erreur nommée", () => {
    expect(() => decouperAuxOffsets("abcdef", { debut: 4, fin: 2 })).toThrow(ErreurDecoupage);
  });

  it("9. intervalle vide [4, 4) : une tranche mise en avant vide, sans exception", () => {
    const decoupage = decouperAuxOffsets("abcdef", { debut: 4, fin: 4 });
    if (decoupage.surlignage !== "present") throw new Error("inattendu");
    expect(decoupage.citation).toBe("");
    expect(decoupage.avant).toBe("abcd");
    expect(decoupage.apres).toBe("ef");
  });
});
