/**
 * Décision D42 (2) dans `schema/question.schema.json` : la formulation neutre, écrite par le
 * gabarit, porte `production: {gabarits}` ; la familière et l'orientée portent
 * `production: {modele, version_prompt}` ; les trois sont relues. Chaque refus est vérifié sur le
 * chemin de la formulation fautive, pour qu'un exemple invalide ne le soit pas pour une autre raison.
 */

import { describe, expect, it } from "vitest";
import { ErreurSchema, valider } from "../../outils/schemas/valider.ts";
import { VERSION_GABARITS } from "../../pipeline/questions/gabarits.ts";
import type { Formulation, Question, Registre } from "../../pipeline/questions/types.ts";
import { question } from "../questions/fabriques.ts";

const BASE: Question = question({
  id: "q_0123456789abcdef0123456789abcdef",
  gabarit: "Q-DIR",
  candidat_id: "demo-alpha",
  items: [
    {
      reference: { item_id: "0F3C8M1N2P4Q5R6S7T8V9W0X1Y", item_version: 1, item_empreinte: "0".repeat(64) },
      role: "principal",
    },
  ],
  grappe_id: "0F3C8M1N2P4Q5R6S7T8V9W0X1Y",
  texte_neutre: "Quelle est la position de Libellé demo-alpha sur la mesure ?",
});

function rang(registre: Registre): number {
  return BASE.formulations.findIndex((formulation) => formulation.registre === registre);
}

function avec(registre: Registre, alterer: (formulation: Formulation) => unknown): unknown {
  return {
    ...BASE,
    formulations: BASE.formulations.map((formulation) =>
      formulation.registre === registre ? alterer(formulation) : formulation,
    ),
  };
}

function cheminsRefuses(valeur: unknown): readonly string[] {
  try {
    valider("question", valeur, "essai");
  } catch (erreur) {
    if (erreur instanceof ErreurSchema) return erreur.chemins;
    throw erreur;
  }
  throw new Error("La question a été acceptée alors qu'un refus était attendu.");
}

describe("cas limite 12 : production de la formulation selon son registre (D42 (2))", () => {
  it("la question de fabrique, neutre produite par le gabarit, est valide", () => {
    expect(() => valider("question", BASE, "essai")).not.toThrow();
  });

  it("neutre produite par la version réelle de la table de gabarits ⇒ valide", () => {
    const valeur = avec("neutre", (formulation) => ({ ...formulation, production: { gabarits: VERSION_GABARITS } }));
    expect(() => valider("question", valeur, "essai")).not.toThrow();
  });

  it("neutre avec production {modele, version_prompt} ⇒ invalide, sur la formulation neutre", () => {
    const valeur = avec("neutre", (formulation) => ({
      ...formulation,
      production: { modele: "famille-x/modele-1", version_prompt: "prompts/reformulation-1.0.0" },
    }));
    expect(cheminsRefuses(valeur)).toContain(`/formulations/${rang("neutre")}/production`);
  });

  it("familière avec production {gabarits} ⇒ invalide, sur la formulation familière", () => {
    const valeur = avec("familier", (formulation) => ({ ...formulation, production: { gabarits: VERSION_GABARITS } }));
    expect(cheminsRefuses(valeur)).toContain(`/formulations/${rang("familier")}/production`);
  });

  it("orientée avec production {gabarits} ⇒ invalide", () => {
    const valeur = avec("oriente", (formulation) => ({ ...formulation, production: { gabarits: VERSION_GABARITS } }));
    expect(cheminsRefuses(valeur)).toContain(`/formulations/${rang("oriente")}/production`);
  });

  it("neutre portant les deux formes à la fois ⇒ invalide", () => {
    const valeur = avec("neutre", (formulation) => ({
      ...formulation,
      production: { gabarits: VERSION_GABARITS, modele: "famille-x/modele-1", version_prompt: "prompts/reformulation-1.0.0" },
    }));
    expect(cheminsRefuses(valeur)).toContain(`/formulations/${rang("neutre")}/production`);
  });

  it("neutre avec une version de gabarits vide ⇒ invalide", () => {
    const valeur = avec("neutre", (formulation) => ({ ...formulation, production: { gabarits: "" } }));
    expect(cheminsRefuses(valeur)).toContain(`/formulations/${rang("neutre")}/production/gabarits`);
  });

  it("neutre sans relecture ⇒ invalide, sur la formulation neutre", () => {
    const valeur = avec("neutre", ({ relecture: _retiree, ...reste }) => reste);
    expect(cheminsRefuses(valeur)).toContain(`/formulations/${rang("neutre")}`);
  });
});
