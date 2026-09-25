/**
 * Constat 6 de la revue du 2026-09-23 : la règle « item tirable » n'est écrite qu'une fois.
 *
 * `questionTirable` (privée, dans `tirage.ts`) appelle désormais `itemEngendreDesQuestions`. Ce
 * test l'observe par `tirer` : une question à un seul item, dans une strate à quota large, est
 * tirée si et seulement si son item engendre des questions. Le verdict attendu est aussi écrit
 * en clair pour chaque cas, pour qu'un accord entre deux règles fausses ne passe pas.
 */

import { describe, expect, it } from "vitest";
import { itemEngendreDesQuestions } from "../../pipeline/questions/engendrement.ts";
import { ItemIntrouvable } from "../../pipeline/questions/reponse-attendue.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import type { Item, ItemDeQuestion, Question } from "../../pipeline/questions/types.ts";
import {
  arbitre,
  candidat,
  contestation,
  graine,
  itemP,
  mesure,
  question,
  run,
} from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const CANDIDAT = "demo-alpha";
const MESURE = mesure({ cle: "tirable", theme: "fiscalite_pouvoir_achat" });
const RUN = run([candidat({ candidat_id: CANDIDAT })], GEL);

function item(cle: string, options: Partial<Pick<Item, "statut_validation" | "statut_contestation">> = {}): Item {
  return itemP({ cle: `tirable-${cle}`, candidat_id: CANDIDAT, mesure: MESURE, ...options });
}

function entree(cible: Item, role: ItemDeQuestion["role"] = "principal"): ItemDeQuestion {
  return {
    reference: { item_id: cible.id, item_version: cible.version, item_empreinte: cible.empreinte },
    role,
  };
}

function questionSur(principal: Item, autres: readonly ItemDeQuestion[] = []): Question {
  return question({
    id: `q_${principal.id}`,
    gabarit: "Q-DIR",
    candidat_id: CANDIDAT,
    items: [entree(principal), ...autres],
    grappe_id: principal.id,
    texte_neutre: "Quelle est la position de Candidat demo-alpha sur cette mesure ?",
  });
}

function tiree(questionPosee: Question, items: readonly Item[]): boolean {
  const resultat = tirer({
    questions: [questionPosee],
    items,
    mesures: [MESURE],
    run: RUN,
    graine: graine(),
    parametres: { questions_par_strate: 10, questions_attribution_par_theme: 10 },
  });
  return resultat.tirage.entrees.some((e) => e.question_id === questionPosee.id);
}

const CAS: readonly { readonly nom: string; readonly item: Item; readonly attendu: boolean }[] = [
  { nom: "item vérifié non contesté", item: item("verifie"), attendu: true },
  {
    nom: "item vérifié contesté, en attente du panel",
    item: item("conteste", { statut_contestation: "contestee" }),
    attendu: false,
  },
  {
    nom: "item arbitré maintenu",
    item: arbitre(item("maintenu"), [contestation("maintenu", "maintien", "2026-10-01T10:00:00+02:00")]),
    attendu: true,
  },
  {
    nom: "item non vérifié (à confirmer)",
    item: item("a-confirmer", { statut_validation: "a_confirmer" }),
    attendu: false,
  },
];

describe("constat 6 : une seule règle « item tirable »", () => {
  for (const cas of CAS) {
    it(`tirage et engendrement rendent le même verdict : ${cas.nom}`, () => {
      expect(itemEngendreDesQuestions(cas.item)).toBe(cas.attendu);
      expect(tiree(questionSur(cas.item), [cas.item])).toBe(cas.attendu);
    });
  }

  it("applique la règle à tous les items de la question, pas seulement au principal", () => {
    const principal = item("principal-sain");
    const autre = item("autre-conteste", { statut_contestation: "contestee" });
    expect(tiree(questionSur(principal, [entree(autre, "attendu_dans_liste")]), [principal, autre])).toBe(
      false,
    );
  });
});

describe("constat 6 : ItemIntrouvable pour une référence absente", () => {
  it("lève ItemIntrouvable quand l'item principal est absent des items fournis", () => {
    const absent = item("principal-absent");
    expect(() => tiree(questionSur(absent), [])).toThrow(ItemIntrouvable);
  });

  it("lève ItemIntrouvable même quand un item précédent de la question est déjà non tirable", () => {
    const nonVerifie = item("non-verifie", { statut_validation: "a_confirmer" });
    const absent = item("liste-absent");
    const posee = questionSur(nonVerifie, [entree(absent, "attendu_dans_liste")]);
    expect(() => tiree(posee, [nonVerifie])).toThrow(ItemIntrouvable);
  });
});
