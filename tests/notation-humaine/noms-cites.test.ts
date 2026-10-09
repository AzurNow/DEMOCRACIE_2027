/** D29 (4) : l'annotateur d'une Q-ATT saisit les noms cités, un par ligne, tels qu'écrits. */

import { describe, expect, it } from "vitest";
import { nomsParLigne } from "../../notation-humaine/client/noms.ts";

describe("nomsParLigne", () => {
  it("un nom par ligne, blancs de bord retirés, lignes vides ignorées", () => {
    expect(nomsParLigne("  Alix Martinez \n\nLe Brun\n   \n")).toEqual(["Alix Martinez", "Le Brun"]);
  });

  it("une virgule reste dans le nom : jamais un séparateur", () => {
    expect(nomsParLigne("Martinez, Alix")).toEqual(["Martinez, Alix"]);
  });

  it("champ vide : aucun nom (la non-réponse se déclare à part)", () => {
    expect(nomsParLigne("")).toEqual([]);
  });
});
