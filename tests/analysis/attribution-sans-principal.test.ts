/**
 * Constat n° 39, côté analyse (protocole 0.9, §8) : « la grappe étant l'item […], et la mesure pour
 * une question d'attribution, qui ne porte sur aucun item en particulier ». Une Q-ATT sur une
 * mesure réelle n'a pas d'item principal : l'unité d'analyse le dit (`null`), elle ne l'invente pas,
 * et rien ne plante en l'assemblant.
 */

import { describe, expect, it } from "vitest";
import { assembler } from "../../analysis/filtre.ts";
import { tauxFabrication, tauxObsolescence } from "../../analysis/metriques.ts";
import { exclureItemsContestes, QuestionSansItemPrincipal } from "../../analysis/robustesse.ts";
import { entreeTirage, idQuestion, item, question, reponse, run, ulid, unite, verdict } from "./fabriques.ts";

const MESURE = ulid("mesure-attribution");
const Q_ATT = question({
  id: idQuestion("q-att"),
  gabarit: "Q-ATT",
  candidat_id: undefined,
  grappe_id: MESURE,
  items: [
    { reference: { item_id: ulid("p-a"), item_version: 1, item_empreinte: "a".repeat(64) }, role: "attendu_dans_liste" },
    { reference: { item_id: ulid("p-b"), item_version: 1, item_empreinte: "b".repeat(64) }, role: "attendu_dans_liste" },
  ],
});

function entrees() {
  return {
    run: run(),
    entrees_tirage: [
      entreeTirage({ question_id: Q_ATT.id, gabarit: "Q-ATT", candidat_id: undefined, grappe_id: MESURE }),
    ],
    questions: [Q_ATT],
    items: [item({ id: ulid("p-a") }), item({ id: ulid("p-b"), candidat_id: "candidat-b" })],
    reponses: [reponse({ question_id: Q_ATT.id })],
    verdicts: [verdict()],
  };
}

describe("n° 39 : unité d'analyse d'une Q-ATT sans item principal", () => {
  it("s'assemble, avec la mesure pour grappe et un item principal absent, jamais inventé", () => {
    const [unite_] = assembler(entrees());
    expect(unite_?.grappe_id).toBe(MESURE);
    expect(unite_?.item_principal_id).toBeNull();
    expect(unite_?.type_item_principal).toBeNull();
    expect(unite_?.candidat_id).toBeNull();
  });

  it("n'entre dans aucun dénominateur restreint à un type d'item (A, F, O)", () => {
    const unites = assembler(entrees());
    expect(tauxFabrication(unites).denominateur).toBe(0);
    expect(tauxObsolescence(unites).denominateur).toBe(0);
  });

  it("un drapeau fabrication sur une Q-ATT sans principal lève, comme sur un item P (§7)", () => {
    const unites = [unite({ item_principal_id: null, type_item_principal: null, drapeaux: ["fabrication"] })];
    expect(() => tauxFabrication(unites)).toThrow(/fabrication/);
  });
});

describe("n° 39 : recalcul (b) de robustesse sur une Q-ATT sans principal", () => {
  const sansPrincipal = unite({ item_principal_id: null, type_item_principal: null, grappe_id: MESURE });

  it("sans contestation postérieure : rien n'est retiré, rien ne lève", () => {
    expect(exclureItemsContestes([sansPrincipal], run())).toEqual([sansPrincipal]);
  });

  it("avec une contestation postérieure : refus nommé, la règle n'est pas écrite par le protocole", () => {
    const conteste = run({
      contestations_posterieures: [
        { item_id: ulid("p-a"), contestation_id: ulid("contestation"), date_reception: "2026-12-05T10:00:00+01:00" },
      ],
    });
    expect(() => exclureItemsContestes([sansPrincipal], conteste)).toThrow(QuestionSansItemPrincipal);
  });
});
