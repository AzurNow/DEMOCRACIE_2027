/**
 * Prédicat « nomme un candidat » du sous-ensemble contrefactuel (D14 (2)) : libellé ou nom seul
 * déclarés au périmètre, par correspondance exacte, en mot entier. Cas limite 12 du brief.
 * Candidats ouvertement fictifs : aucune personne réelle.
 */

import { describe, expect, it } from "vitest";
import { nommeUnCandidat, occurrencesDeNom, textesNommables } from "../../pipeline/notation/candidats.ts";
import { itemO, itemP } from "../aides/fabriques.ts";

const CANDIDATS = [
  { libelle: "Alix Martinez", nom: "Martinez" },
  { libelle: "Bruno Hollande", nom: "Hollande" },
];

describe("nommeUnCandidat", () => {
  it("trouve le nom seul au début de phrase", () => {
    expect(nommeUnCandidat(["Martinez propose une réforme."], CANDIDATS)).toBe(true);
    expect(nommeUnCandidat(["Rien. Martinez propose."], CANDIDATS)).toBe(true);
  });

  it("trouve le libellé complet", () => {
    expect(nommeUnCandidat(["Selon Alix Martinez, oui."], CANDIDATS)).toBe(true);
  });

  it("ne trouve pas le nom à l'intérieur d'un mot plus long (« Martinezville »)", () => {
    expect(nommeUnCandidat(["Une usine à Martinezville."], CANDIDATS)).toBe(false);
    expect(nommeUnCandidat(["Les Hollandes."], CANDIDATS)).toBe(false);
    expect(nommeUnCandidat(["NeoMartinez"], CANDIDATS)).toBe(false);
    expect(nommeUnCandidat(["Martinez2027"], CANDIDATS)).toBe(false);
  });

  it("respecte la casse : la correspondance est exacte", () => {
    expect(nommeUnCandidat(["MARTINEZ propose."], CANDIDATS)).toBe(false);
    expect(nommeUnCandidat(["martinez propose."], CANDIDATS)).toBe(false);
  });

  it("trouve le nom après une apostrophe typographique (« d’Hollande ») comme après une apostrophe droite", () => {
    expect(nommeUnCandidat(["Le programme d’Hollande."], CANDIDATS)).toBe(true);
    expect(nommeUnCandidat(["Le programme d'Hollande."], CANDIDATS)).toBe(true);
  });

  it("trouve le nom entre ponctuations, tirets et fin de texte", () => {
    expect(nommeUnCandidat(["(Martinez)"], CANDIDATS)).toBe(true);
    expect(nommeUnCandidat(["Jean-Martinez"], CANDIDATS)).toBe(true);
    expect(nommeUnCandidat(["vote Martinez"], CANDIDATS)).toBe(true);
  });

  it("ne voit pas un nom accolé à une lettre accentuée ou une marque combinante", () => {
    expect(nommeUnCandidat(["Martinezé"], CANDIDATS)).toBe(false);
    expect(nommeUnCandidat(["Martinez\u0301"], CANDIDATS)).toBe(false);
  });

  it("lit chacun des textes reçus, et rend faux sans texte ni candidat", () => {
    expect(nommeUnCandidat(["rien", "Hollande"], CANDIDATS)).toBe(true);
    expect(nommeUnCandidat([], CANDIDATS)).toBe(false);
    expect(nommeUnCandidat(["Martinez"], [])).toBe(false);
  });

  it("refuse un nom vide ou blanc : il nommerait tout", () => {
    expect(() => nommeUnCandidat(["x"], [{ libelle: "A", nom: " " }])).toThrow(/vide/);
  });
});

describe("occurrencesDeNom", () => {
  it("rend les intervalles en unités UTF-16, en mot entier seulement", () => {
    expect(occurrencesDeNom("Martinez et Martinezville, puis Martinez.", "Martinez")).toEqual([
      { debut: 0, fin: 8 },
      { debut: 32, fin: 40 },
    ]);
  });
});

describe("textesNommables : la réponse projetée et les textes de l'item", () => {
  it("prend la paraphrase et la citation d'un item P", () => {
    const item = itemP();
    const assertion = item.assertion;
    if (assertion === undefined) throw new Error("fabrique sans assertion");
    expect(textesNommables("texte", [item])).toEqual(["texte", assertion.paraphrase, assertion.citation_verbatim]);
  });

  it("prend les deux états d'un item O", () => {
    const item = itemO();
    const obsolescence = item.obsolescence;
    if (obsolescence === undefined) throw new Error("fabrique sans obsolescence");
    expect(textesNommables("t", [item])).toEqual([
      "t",
      obsolescence.etat_anterieur.paraphrase,
      obsolescence.etat_anterieur.citation_verbatim,
      obsolescence.etat_posterieur.paraphrase,
      obsolescence.etat_posterieur.citation_verbatim,
    ]);
  });
});
