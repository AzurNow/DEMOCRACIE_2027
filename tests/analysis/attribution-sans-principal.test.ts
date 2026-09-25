/**
 * Constat n° 39, côté analyse (protocole 0.9, §8) : « la grappe étant l'item […], et la mesure pour
 * une question d'attribution, qui ne porte sur aucun item en particulier ». Une Q-ATT sur une
 * mesure réelle n'a pas d'item principal : l'unité d'analyse le dit (`null`), elle ne l'invente pas,
 * et rien ne plante en l'assemblant.
 */

import { describe, expect, it } from "vitest";
import { assembler } from "../../analysis/filtre.ts";
import { tauxFabrication, tauxObsolescence } from "../../analysis/metriques.ts";
import { exclureItemsContestes } from "../../analysis/robustesse.ts";
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

/*
 * Protocole 0.9, §8 (décision de l'auteur du 2026-09-25) : le recalcul (b) exclut « les questions
 * dont un item, quel que soit son rôle, est contesté à un run ultérieur ». L'unité porte donc tous
 * les items de sa question (`item_ids`), et plus seulement son item principal. Règle aussi le
 * constat bas n° 83 (attendu_dans_liste contesté).
 */
describe("recalcul (b) : une question sort dès qu'un de ses items est contesté", () => {
  function contestes(...cles: readonly string[]) {
    return run({
      contestations_posterieures: cles.map((cle) => ({
        item_id: ulid(cle),
        contestation_id: ulid(`contestation-${cle}`),
        date_reception: "2026-12-05T10:00:00+01:00",
      })),
    });
  }

  it("l'unité assemblée porte tous les items de sa question, quel que soit leur rôle", () => {
    const [unite_] = assembler(entrees());
    expect(unite_?.item_ids).toEqual([ulid("p-a"), ulid("p-b")]);
  });

  it("Q-ATT dont seul un attendu_dans_liste est contesté : exclue", () => {
    const qAtt = unite({ item_principal_id: null, type_item_principal: null, grappe_id: MESURE, item_ids: [ulid("p-a"), ulid("p-b")] });
    const autre = unite({ reponse_id: ulid("autre"), item_principal_id: ulid("p-z"), item_ids: [ulid("p-z")] });
    expect(exclureItemsContestes([qAtt, autre], contestes("p-b"))).toEqual([autre]);
  });

  it("question à principal non contesté mais distracteur contesté : exclue", () => {
    const directe = unite({ item_principal_id: ulid("p-a"), item_ids: [ulid("p-a"), ulid("distracteur")] });
    expect(exclureItemsContestes([directe], contestes("distracteur"))).toEqual([]);
  });

  it("aucune contestation : rien ne change, Q-ATT sans principal comprise", () => {
    const qAtt = unite({ item_principal_id: null, type_item_principal: null, grappe_id: MESURE, item_ids: [ulid("p-a")] });
    expect(exclureItemsContestes([qAtt], run())).toEqual([qAtt]);
    expect(exclureItemsContestes([qAtt], contestes())).toEqual([qAtt]);
  });

  it("contestation d'un item étranger à la question : rien ne sort", () => {
    const qAtt = unite({ item_principal_id: null, type_item_principal: null, grappe_id: MESURE, item_ids: [ulid("p-a")] });
    expect(exclureItemsContestes([qAtt], contestes("p-z"))).toEqual([qAtt]);
  });
});
