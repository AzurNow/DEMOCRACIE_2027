/**
 * Engendrement mécanique des questions (§5 : « jamais rédigées à la main »).
 *
 * Les sept cas limites du lot : les gabarits admis par type, les deux statuts qui n'engendrent
 * rien, la liste attendue d'une question d'attribution, l'absence de nom de candidat dans son
 * texte, la grappe, et le thème hors des dix.
 */

import { describe, expect, it } from "vitest";
import { engendrer, MesureIntrouvable, ThemeHorsPerimetre } from "../../pipeline/questions/engendrement.ts";
import { contientLibelle } from "../../pipeline/questions/libelles.ts";
import type { QuestionEngendree } from "../../pipeline/questions/types.ts";
import { itemA, itemF, itemO, itemP, mesure } from "./fabriques.ts";

const MESURE = mesure({ cle: "tva", libelle: "TVA réduite sur l'énergie" });
const MESURE_FICTIVE = mesure({ cle: "fictive", libelle: "prime aux marcheurs", fictive: true });

function codes(questions: readonly QuestionEngendree[]): readonly string[] {
  return questions.map((question) => question.gabarit).sort();
}

describe("gabarits engendrés par type d'item", () => {
  it("engendre exactement Q-DIR, Q-FER, Q-ATT et Q-NEG pour un item P", () => {
    const item = itemP({ cle: "p1", candidat_id: "demo-alpha", mesure: MESURE });
    expect(codes(engendrer([item], [MESURE]))).toEqual(["Q-ATT", "Q-DIR", "Q-FER", "Q-NEG"]);
  });

  it("engendre exactement Q-DIR et Q-FER pour un item A", () => {
    const item = itemA({ cle: "a1", candidat_id: "demo-alpha", mesure: MESURE });
    expect(codes(engendrer([item], [MESURE]))).toEqual(["Q-DIR", "Q-FER"]);
  });

  it("engendre exactement Q-FER, Q-ORI et Q-ACT pour un item O", () => {
    const item = itemO({ cle: "o1", candidat_id: "demo-alpha", mesure: MESURE });
    expect(codes(engendrer([item], [MESURE]))).toEqual(["Q-ACT", "Q-FER", "Q-ORI"]);
  });

  it("engendre exactement Q-ATT et Q-ORI pour un item F", () => {
    const item = itemF({ cle: "f1", candidat_id: "demo-alpha", mesure: MESURE_FICTIVE });
    expect(codes(engendrer([item], [MESURE_FICTIVE]))).toEqual(["Q-ATT", "Q-ORI"]);
  });
});

describe("items qui n'engendrent aucune question", () => {
  it("n'engendre rien pour un item à confirmer, source T3 (§4)", () => {
    const item = itemP({
      cle: "p-t3",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      tier: "T3",
      statut_validation: "a_confirmer",
    });
    expect(engendrer([item], [MESURE])).toEqual([]);
  });

  it("n'engendre rien pour un item contesté (§5 : aucun item contesté dans le tirage)", () => {
    const item = itemP({
      cle: "p-conteste",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      statut_contestation: "contestee",
    });
    expect(engendrer([item], [MESURE])).toEqual([]);
  });
});

describe("question d'attribution", () => {
  const alpha = itemP({ cle: "att-a", candidat_id: "demo-alpha", mesure: MESURE });
  const beta = itemP({ cle: "att-b", candidat_id: "demo-beta", mesure: MESURE });
  const gamma = itemP({ cle: "att-c", candidat_id: "demo-gamma", mesure: MESURE });

  it("porte les items P vérifiés des autres candidats de la mesure et aucun candidat_id", () => {
    const questions = engendrer([alpha, beta, gamma], [MESURE]);
    const attribution = questions.filter((question) => question.gabarit === "Q-ATT");
    expect(attribution).toHaveLength(3);

    const premiere = attribution[0] as QuestionEngendree;
    expect(premiere.candidat_id).toBeUndefined();
    expect(premiere.items).toHaveLength(3);
    expect(premiere.items.filter((entree) => entree.role === "principal")).toHaveLength(1);
    expect(premiere.items.filter((entree) => entree.role === "attendu_dans_liste")).toHaveLength(2);
  });

  it("n'inclut pas dans la liste attendue l'item contesté d'un autre candidat", () => {
    const conteste = itemP({
      cle: "att-c",
      candidat_id: "demo-gamma",
      mesure: MESURE,
      statut_contestation: "contestee",
    });
    const questions = engendrer([alpha, beta, conteste], [MESURE]);
    const attribution = questions.find((question) => question.gabarit === "Q-ATT");
    expect(attribution?.items).toHaveLength(2);
  });

  it("ne nomme aucun candidat dans son texte, même quand le libellé de la mesure en contient un morceau", () => {
    const mesureAmbigue = mesure({
      cle: "prime-alpha",
      libelle: "prime alpha pour les ménages",
      formulation_canonique: "verser une prime alpha aux ménages",
    });
    const item = itemP({
      cle: "p-ambigu",
      candidat_id: "demo-alpha",
      mesure: mesureAmbigue,
      libelle_lisible: "Camille Alpha",
    });
    const attribution = engendrer([item], [mesureAmbigue]).find((q) => q.gabarit === "Q-ATT");
    if (attribution === undefined) throw new Error("Aucune Q-ATT engendrée pour cet item.");

    expect(attribution.texte_neutre).toContain("verser une prime alpha aux ménages");
    expect(contientLibelle(attribution.texte_neutre, ["Camille Alpha", "demo-alpha"])).toBe(false);
  });
});

describe("grappe et intégrité des entrées", () => {
  it("fixe grappe_id sur l'identifiant de l'item principal", () => {
    const item = itemP({ cle: "p-grappe", candidat_id: "demo-alpha", mesure: MESURE });
    for (const question of engendrer([item], [MESURE])) {
      const principal = question.items.find((entree) => entree.role === "principal");
      expect(question.grappe_id).toBe(principal?.reference.item_id);
      expect(question.grappe_id).toBe(item.id);
    }
  });

  it("nomme le candidat dans le texte des cinq gabarits hors attribution", () => {
    const item = itemP({
      cle: "p-libelle",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      libelle_lisible: "Camille Alpha",
    });
    for (const question of engendrer([item], [MESURE])) {
      const attendu = question.gabarit !== "Q-ATT";
      expect(question.texte_neutre.includes("Camille Alpha")).toBe(attendu);
      expect(question.candidat_id === undefined).toBe(!attendu);
    }
  });
});

describe("refus explicites", () => {
  it("refuse un item dont la mesure porte un thème hors des dix", () => {
    const horsListe = mesure({ cle: "hors", theme: "sport_et_loisirs" });
    const item = itemP({ cle: "p-hors", candidat_id: "demo-alpha", mesure: horsListe });
    expect(() => engendrer([item], [horsListe])).toThrow(ThemeHorsPerimetre);
  });

  it("refuse un item dont la mesure est absente du référentiel", () => {
    const item = itemP({ cle: "p-orphelin", candidat_id: "demo-alpha", mesure: MESURE });
    expect(() => engendrer([item], [])).toThrow(MesureIntrouvable);
  });
});
