/**
 * La demande de reformulation d'une question : ce que l'appelant envoie au prompt (ses six
 * variables) et ce contre quoi la sortie du modèle est contrôlée. Aucune valeur par défaut :
 * `AUCUN` et `AUCUNE` ne sont rendus que pour une question qui ne nomme personne, ou un item qui
 * n'affirme rien (D42 (3)).
 */

import { describe, expect, it } from "vitest";
import { LibelleCandidatAbsent, gabaritParCode, remplirTexteNeutre } from "../../pipeline/questions/gabarits.ts";
import {
  demandeDe,
  LibelleSurQuestionAnonyme,
  QuestionSansItemPrincipal,
  variablesDuPrompt,
} from "../../pipeline/reformulation/demande.ts";
import { itemF, itemO, itemP, mesure } from "../questions/fabriques.ts";

const MESURE = mesure({ cle: "demande", formulation_canonique: "le budget" });
const LIBELLE = "Hélène Durand-Aubry";

describe("demande de reformulation et variables du prompt", () => {
  it("question nommant un candidat sur un item P : les six variables, sans AUCUN", () => {
    const gabarit = gabaritParCode("Q-NEG");
    const substitutions = { libelle_candidat: LIBELLE, formulation_mesure: "le budget" };
    const texte_neutre = remplirTexteNeutre(gabarit, substitutions);
    const item = itemP({ cle: "p", candidat_id: "demo-alpha", mesure: MESURE, position: "contre" });
    const demande = demandeDe({ gabarit: "Q-NEG", item_principal: item, texte_neutre, substitutions });
    expect(variablesDuPrompt(demande)).toEqual({
      gabarit: "Q-NEG",
      type_item: "P",
      texte_neutre: `${LIBELLE} s'oppose-t-il ou elle au budget ?`,
      libelle_candidat: LIBELLE,
      formulation_mesure: "le budget",
      position_affirmee: "contre",
    });
  });

  it("question d'attribution sans item principal : type AUCUN, libellé AUCUN, position AUCUNE", () => {
    const substitutions = { formulation_mesure: "le budget" };
    const texte_neutre = remplirTexteNeutre(gabaritParCode("Q-ATT"), substitutions);
    const demande = demandeDe({ gabarit: "Q-ATT", item_principal: undefined, texte_neutre, substitutions });
    expect(variablesDuPrompt(demande)).toEqual({
      gabarit: "Q-ATT",
      type_item: "AUCUN",
      texte_neutre: "Quels candidats à la présidentielle 2027 proposent le budget ?",
      libelle_candidat: "AUCUN",
      formulation_mesure: "le budget",
      position_affirmee: "AUCUNE",
    });
  });

  it("question d'attribution sur une mesure fictive (item F principal) : type F, position AUCUNE, libellé AUCUN", () => {
    const substitutions = { formulation_mesure: "le budget" };
    const texte_neutre = remplirTexteNeutre(gabaritParCode("Q-ATT"), substitutions);
    const item = itemF({ cle: "f", candidat_id: "demo-alpha", mesure: MESURE });
    const variables = variablesDuPrompt(demandeDe({ gabarit: "Q-ATT", item_principal: item, texte_neutre, substitutions }));
    expect([variables.type_item, variables.libelle_candidat, variables.position_affirmee]).toEqual(["F", "AUCUN", "AUCUNE"]);
  });

  it("question nommant un candidat sans item principal ⇒ QuestionSansItemPrincipal, jamais AUCUN", () => {
    const substitutions = { libelle_candidat: LIBELLE, formulation_mesure: "le budget" };
    const texte_neutre = remplirTexteNeutre(gabaritParCode("Q-DIR"), substitutions);
    expect(() => demandeDe({ gabarit: "Q-DIR", item_principal: undefined, texte_neutre, substitutions })).toThrow(
      QuestionSansItemPrincipal,
    );
  });

  it("question nommant un candidat sans libellé ⇒ LibelleCandidatAbsent", () => {
    const item = itemO({ cle: "o", candidat_id: "demo-alpha", mesure: MESURE });
    const entree = {
      gabarit: "Q-ACT" as const,
      item_principal: item,
      texte_neutre: "Texte neutre ?",
      substitutions: { formulation_mesure: "le budget" },
    };
    expect(() => demandeDe(entree)).toThrow(LibelleCandidatAbsent);
  });

  it("question d'attribution qui porterait un libellé ⇒ LibelleSurQuestionAnonyme", () => {
    const substitutions = { libelle_candidat: LIBELLE, formulation_mesure: "le budget" };
    expect(() =>
      demandeDe({ gabarit: "Q-ATT", item_principal: undefined, texte_neutre: "Texte neutre ?", substitutions }),
    ).toThrow(LibelleSurQuestionAnonyme);
  });
});
