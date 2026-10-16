/**
 * Chaque fabrique de `tests/aides/fabriques.ts` produit un objet conforme à son schéma. Sans ce
 * garde-fou, une fabrique dépassée par une version du protocole (l'`extrait` T2 exigé depuis la
 * 0.17) fait échouer un test au chargement, ou lui fait recevoir un refus pour une autre raison
 * que la règle qu'il vise.
 */

import { describe, expect, it } from "vitest";
import { valider } from "../outils/schemas/valider.ts";
import { questionsSpecifiques } from "../validation/domaine/grille.ts";
import type { Item } from "../validation/domaine/types.ts";
import { decision, itemA, itemF, itemO, itemP, mesure } from "./aides/fabriques.ts";

const ITEMS = { itemP, itemA, itemO, itemF } as const;

/**
 * `decision()` laisse à l'appelant les questions propres au type d'item, que certains tests
 * omettent exprès pour viser leur refus : la décision conforme les reçoit toutes, à vrai.
 */
function specifiquesConfirmees(item: Item): Record<string, boolean> {
  return Object.fromEntries(questionsSpecifiques(item.type).map((cle) => [cle, true]));
}

describe("fabriques de test conformes à leur schéma", () => {
  it.each(Object.entries(ITEMS))("%s est conforme à item.schema.json", (nom, fabrique) => {
    const item = fabrique();
    expect(valider("item", item, `fabrique ${nom}`)).toBe(item);
  });

  it("mesure est conforme à mesure.schema.json", () => {
    const valeur = mesure();
    expect(valider("mesure", valeur, "fabrique mesure")).toBe(valeur);
  });

  it.each(Object.entries(ITEMS))("decision sur %s est conforme à decision.schema.json", (nom, fabrique) => {
    const item = fabrique();
    const entree = decision({
      annotateur_id: "a1",
      item,
      decision: "accepter",
      questions_specifiques: specifiquesConfirmees(item),
    });
    expect(valider("decision", entree, `fabrique decision sur ${nom}`)).toBe(entree);
  });
});
