/**
 * Appariement des deux extractions et accord (décision D52 (2)) : deux items, un de chaque modèle,
 * sont appariés quand les intervalles de leurs citations se recouvrent et qu'ils ont le même thème ;
 * plus grand recouvrement, puis plus petit offset de début ; un-à-un, déterministe, indépendant de
 * l'ordre des items. Libellé et paraphrase ne sont jamais comparés.
 * Cas limites 12 et 13 du brief.
 */

import { describe, expect, it } from "vitest";
import { apparier, recouvrement, type Candidat } from "../../pipeline/extraction/appariement.ts";
import { accordDe } from "../../pipeline/extraction/comparaison.ts";
import type { ItemPropose } from "../../pipeline/extraction/types.ts";
import { MODELE_A, MODELE_B, propose } from "./aides.ts";

const MODELES = [MODELE_A, MODELE_B] as const;

function candidat(rang: 0 | 1, index: number, debut: number, fin: number, enPlus: Record<string, unknown> = {}): Candidat {
  return { rang, index, debut, fin, item: propose("sans objet ici", enPlus) as unknown as ItemPropose };
}

function indices(paires: ReturnType<typeof apparier>): (readonly [number | null, number | null])[] {
  return paires.map((paire) => [paire.premier?.index ?? null, paire.second?.index ?? null] as const);
}

describe("recouvrement : intervalles semi-ouverts", () => {
  it("compte les points de code communs", () => {
    expect(recouvrement({ debut: 0, fin: 10 }, { debut: 5, fin: 20 })).toBe(5);
  });

  it("fin == début : les intervalles se touchent sans se recouvrir", () => {
    expect(recouvrement({ debut: 0, fin: 10 }, { debut: 10, fin: 20 })).toBe(0);
  });
});

describe("cas 12 : appariement", () => {
  it("recouvrement partiel ⇒ appariés", () => {
    expect(indices(apparier([candidat(0, 0, 0, 30)], [candidat(1, 0, 20, 50)]))).toEqual([[0, 0]]);
  });

  it("inclusion d'une citation dans l'autre ⇒ appariés", () => {
    expect(indices(apparier([candidat(0, 0, 10, 20)], [candidat(1, 0, 0, 50)]))).toEqual([[0, 0]]);
  });

  it("intervalles qui se touchent (fin == début) ⇒ non appariés", () => {
    expect(indices(apparier([candidat(0, 0, 0, 10)], [candidat(1, 0, 10, 20)]))).toEqual([
      [0, null],
      [null, 0],
    ]);
  });

  it("mêmes citations, thèmes différents ⇒ non appariés, deux désaccords d'existence", () => {
    const autreTheme = { mesure_proposee: { libelle: "Ouvrir les centres de santé le dimanche", theme: "travail_emploi" } };
    const paires = apparier([candidat(0, 0, 0, 10)], [candidat(1, 0, 0, 10, autreTheme)]);
    expect(indices(paires)).toEqual([
      [0, null],
      [null, 0],
    ]);
    expect(paires.map((paire) => accordDe(paire, MODELES).accord)).toEqual(["desaccord_existence", "desaccord_existence"]);
  });

  it("plusieurs candidats : le plus grand recouvrement l'emporte", () => {
    const paires = apparier([candidat(0, 0, 0, 30)], [candidat(1, 0, 0, 5), candidat(1, 1, 10, 40)]);
    expect(indices(paires)).toEqual([
      [null, 0],
      [0, 1],
    ]);
  });

  it("deux candidats à recouvrement égal ⇒ le plus petit offset de début", () => {
    const paires = apparier([candidat(0, 0, 10, 20)], [candidat(1, 0, 15, 30), candidat(1, 1, 5, 15)]);
    expect(indices(paires)).toEqual([
      [0, 1],
      [null, 0],
    ]);
  });

  it("un-à-un : un item déjà apparié ne l'est pas une seconde fois", () => {
    const paires = apparier([candidat(0, 0, 0, 20), candidat(0, 1, 0, 20)], [candidat(1, 0, 0, 20)]);
    expect(paires.filter((paire) => paire.premier !== null && paire.second !== null)).toHaveLength(1);
    expect(paires).toHaveLength(2);
  });

  it("le plus grand recouvrement d'abord, même s'il prive un autre item de partenaire", () => {
    const paires = apparier([candidat(0, 0, 0, 20), candidat(0, 1, 15, 40)], [candidat(1, 0, 10, 40)]);
    expect(indices(paires)).toEqual([
      [0, null],
      [1, 0],
    ]);
  });
});

describe("cas 12 : accord d'une paire", () => {
  it("mêmes type, position et quantification ⇒ accord, libellé et paraphrase ignorés", () => {
    const autreTexte = {
      mesure_proposee: { libelle: "Un tout autre libellé", theme: "sante" },
      paraphrase: "Une tout autre paraphrase.",
    };
    const [paire] = apparier([candidat(0, 0, 0, 10)], [candidat(1, 0, 0, 10, autreTexte)]);
    expect(paire === undefined ? null : accordDe(paire, MODELES)).toEqual({ accord: "accord" });
  });

  it("mêmes citations, positions différentes ⇒ desaccord_contenu nommant position", () => {
    const [paire] = apparier([candidat(0, 0, 0, 10)], [candidat(1, 0, 0, 10, { position: "contre" })]);
    expect(paire === undefined ? null : accordDe(paire, MODELES)).toEqual({
      accord: "desaccord_contenu",
      detail_desaccord: "champs divergents : position",
    });
  });

  it("quantification présente d'un côté seulement ⇒ desaccord_contenu nommant quantification", () => {
    const quantification = { dimensions: [{ type: "montant", valeur: 150, unite: "EUR", operateur: "exact" }] };
    const [paire] = apparier([candidat(0, 0, 0, 10, { quantification })], [candidat(1, 0, 0, 10)]);
    expect(paire === undefined ? null : accordDe(paire, MODELES)).toEqual({
      accord: "desaccord_contenu",
      detail_desaccord: "champs divergents : quantification",
    });
  });

  it("type et quantification différents ⇒ les deux champs nommés, dans l'ordre fixe", () => {
    const quantification = { dimensions: [{ type: "taux", valeur: 5.5, unite: "%", operateur: "exact" }] };
    const [paire] = apparier([candidat(0, 0, 0, 10, { type: "O" })], [candidat(1, 0, 0, 10, { quantification })]);
    expect(paire === undefined ? null : accordDe(paire, MODELES)).toEqual({
      accord: "desaccord_contenu",
      detail_desaccord: "champs divergents : type, quantification",
    });
  });

  it("quantifications égales à l'ordre des clés près ⇒ accord", () => {
    const q1 = { dimensions: [{ type: "taux", valeur: 5.5, unite: "%", operateur: "exact" }] };
    const q2 = { dimensions: [{ operateur: "exact", unite: "%", valeur: 5.5, type: "taux" }] };
    const [paire] = apparier([candidat(0, 0, 0, 10, { quantification: q1 })], [candidat(1, 0, 0, 10, { quantification: q2 })]);
    expect(paire === undefined ? null : accordDe(paire, MODELES).accord).toBe("accord");
  });

  it("item sans partenaire ⇒ desaccord_existence, le détail nomme le modèle qui ne l'a pas extrait", () => {
    const [seul] = apparier([candidat(0, 0, 0, 10)], []);
    expect(seul === undefined ? null : accordDe(seul, MODELES)).toEqual({
      accord: "desaccord_existence",
      detail_desaccord: `aucun item apparié dans la sortie de ${MODELE_B}`,
    });
  });
});

describe("cas 13 : indépendance de l'ordre des items", () => {
  const PREMIERS = [
    candidat(0, 0, 0, 20),
    candidat(0, 1, 0, 20, { position: "contre" }),
    candidat(0, 2, 30, 60),
    candidat(0, 3, 100, 120, { mesure_proposee: { libelle: "Autre", theme: "education" } }),
  ];
  const SECONDS = [candidat(1, 0, 0, 20, { position: "contre" }), candidat(1, 1, 0, 20), candidat(1, 2, 40, 70), candidat(1, 3, 200, 210)];

  /** Les paires sans les rangs d'origine, qui suivent par construction l'ordre de la sortie. */
  function forme(premiers: readonly Candidat[], seconds: readonly Candidat[]): string {
    return JSON.stringify(
      apparier(premiers, seconds).map((paire) => [
        paire.premier === null ? null : { ...paire.premier, index: null },
        paire.second === null ? null : { ...paire.second, index: null },
      ]),
    );
  }

  it("mêmes paires quel que soit l'ordre des items de l'une ou l'autre sortie", () => {
    const attendue = forme(PREMIERS, SECONDS);
    expect(forme([...PREMIERS].reverse(), SECONDS)).toBe(attendue);
    expect(forme(PREMIERS, [...SECONDS].reverse())).toBe(attendue);
    expect(forme([PREMIERS[2], PREMIERS[0], PREMIERS[3], PREMIERS[1]] as Candidat[], [...SECONDS].reverse())).toBe(attendue);
  });

  it("à égalité complète, les contenus identiques s'apparient entre eux", () => {
    const paires = apparier(PREMIERS, SECONDS).filter((paire) => paire.premier !== null && paire.second !== null);
    expect(paires.map((paire) => accordDe(paire, MODELES).accord)).toEqual(["accord", "accord", "accord"]);
  });
});
