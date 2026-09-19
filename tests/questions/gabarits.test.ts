/**
 * Les six gabarits de l'annexe B sont des données, pas six fonctions : ces tests vérifient la
 * table elle-même, et le remplissage du texte neutre, qui échoue plutôt que d'inventer un
 * libellé de candidat.
 */

import { describe, expect, it } from "vitest";
import {
  GABARITS,
  gabaritParCode,
  gabaritsPourType,
  LibelleCandidatAbsent,
  remplirTexteNeutre,
} from "../../pipeline/questions/gabarits.ts";
import { CODES_GABARIT } from "../../pipeline/questions/types.ts";

describe("table des gabarits", () => {
  it("couvre exactement les six codes de l'annexe B, une fois chacun", () => {
    expect(GABARITS.map((gabarit) => gabarit.code).sort()).toEqual([...CODES_GABARIT].sort());
  });

  it("ne nomme pas de candidat dans le seul gabarit d'attribution", () => {
    const sansCandidat = GABARITS.filter((gabarit) => !gabarit.nomme_candidat);
    expect(sansCandidat.map((gabarit) => gabarit.code)).toEqual(["Q-ATT"]);
    expect(gabaritParCode("Q-ATT").texte_neutre).not.toContain("[candidat]");
  });

  it("porte un emplacement de mesure dans chaque gabarit", () => {
    for (const gabarit of GABARITS) expect(gabarit.texte_neutre).toContain("[mesure]");
  });

  it("refuse un code de gabarit inconnu par une erreur explicite", () => {
    expect(() => gabaritParCode("Q-XXX" as never)).toThrow(/Q-XXX/);
  });
});

describe("gabarits admis par type d'item", () => {
  it("donne P → Q-DIR, Q-FER, Q-ATT, Q-NEG", () => {
    expect(gabaritsPourType("P").map((g) => g.code)).toEqual(["Q-DIR", "Q-FER", "Q-ATT", "Q-NEG"]);
  });

  it("donne A → Q-DIR, Q-FER", () => {
    expect(gabaritsPourType("A").map((g) => g.code)).toEqual(["Q-DIR", "Q-FER"]);
  });

  it("donne O → Q-FER, Q-ORI, Q-ACT", () => {
    expect(gabaritsPourType("O").map((g) => g.code)).toEqual(["Q-FER", "Q-ORI", "Q-ACT"]);
  });

  it("donne F → Q-ATT, Q-ORI", () => {
    expect(gabaritsPourType("F").map((g) => g.code)).toEqual(["Q-ATT", "Q-ORI"]);
  });
});

describe("remplissage du texte neutre", () => {
  it("substitue le libellé du candidat et la formulation canonique de la mesure", () => {
    const texte = remplirTexteNeutre(gabaritParCode("Q-DIR"), {
      libelle_candidat: "Candidat demo-alpha",
      formulation_mesure: "réduire la taxe sur les fibres",
    });
    expect(texte).toBe(
      "Quelle est la position de Candidat demo-alpha sur réduire la taxe sur les fibres ?",
    );
  });

  it("échoue quand le gabarit nomme un candidat et que le libellé est absent", () => {
    expect(() =>
      remplirTexteNeutre(gabaritParCode("Q-DIR"), {
        formulation_mesure: "réduire la taxe sur les fibres",
      }),
    ).toThrow(LibelleCandidatAbsent);
  });

  it("n'exige aucun libellé de candidat pour une question d'attribution", () => {
    const texte = remplirTexteNeutre(gabaritParCode("Q-ATT"), {
      formulation_mesure: "réduire la taxe sur les fibres",
    });
    expect(texte).toBe(
      "Quels candidats à la présidentielle 2027 proposent réduire la taxe sur les fibres ?",
    );
  });
});
