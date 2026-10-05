/**
 * Contrôle de l'extrait justificatif d'un juge (§7) : la même comparaison de chaînes que le test
 * verbatim (règle 5), contre la réponse projetée ou contre la citation de l'item de référence.
 * Cas limites 1 et 2 du brief.
 */

import { describe, expect, it } from "vitest";
import { citationsDeReference, controlerExtrait } from "../../pipeline/notation/extrait.ts";
import { itemA, itemO, itemP } from "../aides/fabriques.ts";
import { notationJuge } from "./fabriques.ts";

const INSECABLE = String.fromCodePoint(0x00a0);
const OUVRANT = String.fromCodePoint(0x201c);
const FERMANT = String.fromCodePoint(0x201d);
const APOSTROPHE = String.fromCodePoint(0x2019);
const CHEVRON_OUVRANT = String.fromCodePoint(0x00ab);
const CHEVRON_FERMANT = String.fromCodePoint(0x00bb);

const REPONSE ="Le candidat propose de ramener la TVA sur l'énergie à 5,5 %, selon son programme.";
const ITEM = itemP();
const TEXTES = { reponse: REPONSE, citations_reference: citationsDeReference([ITEM]) };

function inexacteAvecExtrait(texte: string, provenance: "reponse" | "reference" = "reponse") {
  return notationJuge("j1", {
    categorie: "inexacte",
    motif_inexactitude: "position_opposee",
    extrait_justificatif: { provenance, texte, verifie_deterministe: true },
  });
}

describe("controlerExtrait", () => {
  it("valide un extrait présent dans la réponse projetée", () => {
    expect(controlerExtrait(inexacteAvecExtrait("ramener la TVA sur l'énergie"), TEXTES)).toEqual({
      valide: true,
      trouve_dans: "reponse",
    });
  });

  it("valide un extrait présent dans la citation de l'item de référence", () => {
    expect(controlerExtrait(inexacteAvecExtrait("Nous ramènerons la TVA", "reference"), TEXTES)).toEqual({
      valide: true,
      trouve_dans: "reference",
    });
  });

  it("valide un extrait à guillemets typographiques et espace insécable, présent après normalisation", () => {
    const reponse = 'Il a déclaré : "nous ramènerons la TVA" puis s\'est tu.';
    const textes = { reponse, citations_reference: [] };
    const extrait = `déclaré${INSECABLE}: ${OUVRANT}nous ramènerons la TVA${FERMANT} puis s${APOSTROPHE}est tu`;
    expect(controlerExtrait(inexacteAvecExtrait(extrait), textes)).toEqual({ valide: true, trouve_dans: "reponse" });
  });

  it("valide dans l'autre sens : réponse typographique, extrait en ASCII", () => {
    const reponse = `Il a déclaré${INSECABLE}: ${CHEVRON_OUVRANT}${INSECABLE}nous ramènerons la TVA${INSECABLE}${CHEVRON_FERMANT}.`;
    const textes = { reponse, citations_reference: [] };
    expect(controlerExtrait(inexacteAvecExtrait('déclaré : " nous ramènerons la TVA "'), textes).valide).toBe(true);
  });

  it("invalide un extrait absent de la réponse et de la référence", () => {
    expect(controlerExtrait(inexacteAvecExtrait("il supprimera la TVA"), TEXTES)).toEqual({
      valide: false,
      motif: "introuvable",
    });
  });

  it("invalide un extrait vide après normalisation", () => {
    expect(controlerExtrait(inexacteAvecExtrait("   "), TEXTES)).toEqual({ valide: false, motif: "citation_vide" });
  });

  it("ne cherche pas dans la paraphrase de l'item : seule sa citation est la référence", () => {
    const assertion = ITEM.assertion;
    if (assertion === undefined) throw new Error("fabrique sans assertion");
    expect(controlerExtrait(inexacteAvecExtrait(assertion.paraphrase, "reference"), TEXTES).valide).toBe(false);
  });

  it("ne fait pas confiance au champ verifie_deterministe que porte la notation", () => {
    const notation = inexacteAvecExtrait("inventé de toutes pièces");
    expect(notation.extrait_justificatif?.verifie_deterministe).toBe(true);
    expect(controlerExtrait(notation, TEXTES).valide).toBe(false);
  });

  it("une note exacte sans extrait n'a rien à invalider (annexe C)", () => {
    expect(controlerExtrait(notationJuge("j1"), TEXTES)).toEqual({ valide: true, trouve_dans: null });
  });

  it("une note autre qu'exacte sans extrait est invalide, jamais acceptée en silence", () => {
    const sansExtrait = notationJuge("j1", { categorie: "non_reponse" });
    expect(controlerExtrait(sansExtrait, TEXTES)).toEqual({ valide: false, motif: "extrait_manquant" });
  });
});

describe("citationsDeReference", () => {
  it("prend la citation d'un item P, les deux d'un item O, aucune d'un item A", () => {
    const o = itemO();
    expect(citationsDeReference([itemP(), o, itemA()])).toEqual([
      itemP().assertion?.citation_verbatim,
      o.obsolescence?.etat_anterieur.citation_verbatim,
      o.obsolescence?.etat_posterieur.citation_verbatim,
    ]);
  });
});
