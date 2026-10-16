/**
 * `empreinteMesure` : le champ `empreinte` de `mesure.schema.json`, « sha256 de la forme canonique
 * de {libelle, theme, formulation_canonique, fictive} », et rien d'autre.
 */

import { describe, expect, it } from "vitest";
import { empreinteDe, empreinteMesure } from "../validation/domaine/empreinte.ts";
import { mesure } from "./aides/fabriques.ts";

describe("empreinteMesure", () => {
  it("est le sha256 canonique des quatre champs du schéma", () => {
    const valeur = mesure();
    const { libelle, theme, formulation_canonique, fictive } = valeur;
    expect(empreinteMesure(valeur)).toBe(empreinteDe({ fictive, formulation_canonique, libelle, theme }));
  });

  it.each([
    ["libelle", { libelle: "TVA réduite sur le gaz" }],
    ["theme", { theme: "sante" }],
    ["formulation_canonique", { formulation_canonique: "ramener la TVA sur le gaz à 5,5 %" }],
  ] as const)("change avec %s", (_champ, surcharge) => {
    expect(empreinteMesure(mesure(surcharge))).not.toBe(empreinteMesure(mesure()));
  });

  it("change avec fictive", () => {
    expect(empreinteMesure({ ...mesure(), fictive: true })).not.toBe(empreinteMesure(mesure()));
  });

  it("ne change ni avec les alias, ni avec la version, ni avec l'historique", () => {
    const autre = { ...mesure(), alias: ["TVA énergie"], version: 2, historique: [] };
    expect(empreinteMesure(autre)).toBe(empreinteMesure(mesure()));
  });
});
