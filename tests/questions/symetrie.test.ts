/**
 * Garanties de symétrie du §5, « testées en intégration continue » : le pipeline refuse de
 * lancer un run si l'une des conditions échoue.
 *
 * Chaque cas limite casse un seul axe à la fois, à partir d'un tirage parfaitement symétrique.
 */

import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { entreesPour } from "../../pipeline/questions/tirage.ts";
import { verifierSymetrie } from "../../pipeline/questions/symetrie.ts";
import type {
  CodeCondition,
  CodeGabarit,
  EntreeTirage,
  Item,
  Question,
  Symetrie,
  Tirage,
} from "../../pipeline/questions/types.ts";
import { candidat, completer, graine, itemA, itemF, itemP, mesure, question, run } from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const CANDIDATS = ["demo-alpha", "demo-beta"];

const MESURE_P1 = mesure({ cle: "p1", theme: "fiscalite_pouvoir_achat", libelle: "tarif de base" });
const MESURE_P2 = mesure({ cle: "p2", theme: "retraites", libelle: "durée de cotisation" });
const MESURE_A = mesure({ cle: "abs", theme: "fiscalite_pouvoir_achat", libelle: "taxe sur les fibres" });
const MESURE_F = mesure({
  cle: "fic",
  theme: "fiscalite_pouvoir_achat",
  libelle: "prime aux marcheurs",
  fictive: true,
});
const MESURES = [MESURE_P1, MESURE_P2, MESURE_A, MESURE_F];

const ITEMS: readonly Item[] = CANDIDATS.flatMap((candidat_id) => [
  itemP({ cle: `${candidat_id}-p1`, candidat_id, mesure: MESURE_P1 }),
  itemP({ cle: `${candidat_id}-p2`, candidat_id, mesure: MESURE_P2 }),
  itemA({ cle: `${candidat_id}-a`, candidat_id, mesure: MESURE_A }),
  itemF({ cle: `${candidat_id}-f`, candidat_id, mesure: MESURE_F }),
]);

const QUESTIONS: readonly Question[] = engendrer(ITEMS, MESURES).map(completer);
const RUN = run(CANDIDATS.map((candidat_id) => candidat({ candidat_id })), GEL);

function choisir(item: Item, gabarit: CodeGabarit): Question {
  const trouvee = QUESTIONS.find(
    (candidate) => candidate.grappe_id === item.id && candidate.gabarit === gabarit,
  );
  if (trouvee === undefined) throw new Error(`Question ${gabarit} absente pour l'item ${item.id}.`);
  return trouvee;
}

function itemsDe(candidat_id: string): Readonly<Record<"p1" | "p2" | "a" | "f", Item>> {
  const siens = ITEMS.filter((item) => item.candidat_id === candidat_id);
  const positions = siens.filter((item) => item.type === "P");
  const unique = (type: Item["type"]): Item => {
    const trouve = siens.find((item) => item.type === type);
    if (trouve === undefined) throw new Error(`Item ${type} absent pour ${candidat_id}.`);
    return trouve;
  };
  return {
    p1: positions[0] as Item,
    p2: positions[1] as Item,
    a: unique("A"),
    f: unique("F"),
  };
}

/** Six questions par candidat : trois Q-DIR, deux Q-FER, une Q-ORI. */
function questionsSymetriques(candidat_id: string): readonly Question[] {
  const jeu = itemsDe(candidat_id);
  return [
    choisir(jeu.p1, "Q-DIR"),
    choisir(jeu.p1, "Q-FER"),
    choisir(jeu.p2, "Q-DIR"),
    choisir(jeu.p2, "Q-FER"),
    choisir(jeu.a, "Q-DIR"),
    choisir(jeu.f, "Q-ORI"),
  ];
}

function tirageDe(questions: readonly Question[], items: readonly Item[] = ITEMS): Tirage {
  return {
    run_id: RUN.id,
    date_gel: GEL,
    graine_tirage: graine(),
    entrees: entreesPour(questions, items, MESURES, GEL),
  };
}

function conditionDe(symetrie: Symetrie, code: CodeCondition) {
  const trouvee = symetrie.conditions.find((condition) => condition.code === code);
  if (trouvee === undefined) throw new Error(`Condition ${code} absente du rapport de symétrie.`);
  return trouvee;
}

const SYMETRIQUES: readonly Question[] = [
  ...questionsSymetriques("demo-alpha"),
  ...questionsSymetriques("demo-beta"),
  choisir(itemsDe("demo-alpha").p1, "Q-ATT"),
];

function verifier(questions: readonly Question[], items: readonly Item[] = ITEMS): Symetrie {
  return verifierSymetrie(tirageDe(questions, items), QUESTIONS, items, RUN);
}

describe("tirage parfaitement symétrique", () => {
  it("rend les six conditions vertes et un statut global vert", () => {
    const symetrie = verifier(SYMETRIQUES);
    expect(symetrie.conditions).toHaveLength(6);
    for (const condition of symetrie.conditions) expect(condition.statut).toBe("vert");
    expect(symetrie.statut_global).toBe("vert");
  });

  it("compte la part des items A et F au-dessus du seuil du §5", () => {
    const condition = conditionDe(verifier(SYMETRIQUES), "part_items_a_f_minimale");
    expect(condition.seuil).toBe(0.2);
    expect(condition.mesure).toBeCloseTo(4 / 13, 10);
  });
});

describe("nombre de questions par candidat", () => {
  it("passe au rouge dès qu'un candidat porte une question de plus sur un gabarit", () => {
    const enPlus = [...SYMETRIQUES, choisir(itemsDe("demo-alpha").a, "Q-FER")];
    const symetrie = verifier(enPlus);
    expect(conditionDe(symetrie, "nombre_questions_par_candidat").statut).toBe("rouge");
    expect(conditionDe(symetrie, "nombre_questions_par_candidat").mesure).toBe(1);
  });

  it("rend le statut global rouge, le rouge l'emportant sur un écart toléré", () => {
    // Une question de plus se pose forcément sur un thème : l'écart de thèmes suit, toléré.
    const enPlus = [...SYMETRIQUES, choisir(itemsDe("demo-alpha").a, "Q-FER")];
    const symetrie = verifier(enPlus);
    expect(conditionDe(symetrie, "nombre_questions_par_candidat").statut).toBe("rouge");
    expect(conditionDe(symetrie, "repartition_themes").statut).toBe("ecart_tolere");
    expect(symetrie.statut_global).toBe("rouge");
  });

  it("ignore les questions d'attribution, qui ne sont attribuables à aucun candidat", () => {
    const attributions = [
      ...SYMETRIQUES,
      choisir(itemsDe("demo-alpha").p2, "Q-ATT"),
      choisir(itemsDe("demo-beta").p1, "Q-ATT"),
      choisir(itemsDe("demo-beta").p2, "Q-ATT"),
    ];
    const symetrie = verifier(attributions);
    expect(conditionDe(symetrie, "nombre_questions_par_candidat").statut).toBe("vert");
  });
});

describe("répartition par thème", () => {
  it("tolère l'écart, l'imprime par candidat, et ne passe jamais au rouge", () => {
    const jeuBeta = itemsDe("demo-beta");
    const deplacees = [
      ...questionsSymetriques("demo-alpha"),
      choisir(jeuBeta.p1, "Q-DIR"),
      choisir(jeuBeta.p1, "Q-FER"),
      choisir(jeuBeta.p1, "Q-NEG"),
      choisir(jeuBeta.a, "Q-DIR"),
      choisir(jeuBeta.a, "Q-FER"),
      choisir(jeuBeta.f, "Q-ORI"),
    ];
    const condition = conditionDe(verifier(deplacees), "repartition_themes");
    expect(condition.statut).toBe("ecart_tolere");
    expect(condition.mesure).toBe(2);
    expect(condition.detail_par_candidat?.map((detail) => detail.candidat_id).sort()).toEqual(
      [...CANDIDATS].sort(),
    );
    expect(verifier(deplacees).statut_global).toBe("ecart_tolere");
  });
});

describe("items contestés ou en attente", () => {
  it("passe au rouge à la première occurrence et nomme l'item", () => {
    const cible = itemsDe("demo-alpha").p1;
    const items = ITEMS.map((item) =>
      item.id === cible.id ? { ...item, statut_contestation: "contestee" as const } : item,
    );
    const condition = conditionDe(
      verifier(SYMETRIQUES, items),
      "aucun_item_conteste_ou_en_attente",
    );
    expect(condition.statut).toBe("rouge");
    expect(condition.commentaire).toContain(cible.id);
  });

  it("passe au rouge pour un item resté en attente de validation", () => {
    const cible = itemsDe("demo-beta").p2;
    const items = ITEMS.map((item) =>
      item.id === cible.id ? { ...item, statut_validation: "en_attente" } : item,
    );
    expect(
      conditionDe(verifier(SYMETRIQUES, items), "aucun_item_conteste_ou_en_attente").statut,
    ).toBe("rouge");
  });
});

describe("noms de candidats dans les questions d'attribution", () => {
  it("passe au rouge quand un libellé de candidat figure dans le texte d'une Q-ATT", () => {
    const fuite = question({
      id: "q_" + "f".repeat(32),
      gabarit: "Q-ATT",
      items: choisir(itemsDe("demo-alpha").p1, "Q-ATT").items,
      grappe_id: itemsDe("demo-alpha").p1.id,
      texte_neutre: "Quels candidats, dont Candidat demo-alpha, proposent le tarif de base ?",
    });
    const tirage = tirageDe([...SYMETRIQUES, fuite]);
    const symetrie = verifierSymetrie(tirage, [...QUESTIONS, fuite], ITEMS, RUN);
    expect(conditionDe(symetrie, "aucun_nom_candidat_dans_q_att").statut).toBe("rouge");
    // Une seule condition rouge suffit, toutes les autres étant vertes.
    const autres = symetrie.conditions.filter(
      (condition) => condition.code !== "aucun_nom_candidat_dans_q_att",
    );
    for (const condition of autres) expect(condition.statut).toBe("vert");
    expect(symetrie.statut_global).toBe("rouge");
  });

  it("reste vert quand le libellé de la mesure contient seulement un morceau d'un nom", () => {
    const mesureAmbigue = mesure({
      cle: "prime-alpha",
      theme: "fiscalite_pouvoir_achat",
      libelle: "prime alpha",
      formulation_canonique: "verser une prime alpha aux ménages",
    });
    const item = itemP({
      cle: "ambigu",
      candidat_id: "demo-alpha",
      mesure: mesureAmbigue,
      libelle_lisible: "Camille Alpha",
    });
    const items = [...ITEMS, item];
    const engendrees = engendrer(items, [...MESURES, mesureAmbigue]).map(completer);
    const attribution = engendrees.find(
      (candidate) => candidate.grappe_id === item.id && candidate.gabarit === "Q-ATT",
    ) as Question;
    const tirage: Tirage = {
      run_id: RUN.id,
      date_gel: GEL,
      graine_tirage: graine(),
      entrees: entreesPour([...SYMETRIQUES, attribution], items, [...MESURES, mesureAmbigue], GEL),
    };
    const symetrie = verifierSymetrie(tirage, [...QUESTIONS, ...engendrees], items, RUN);
    expect(conditionDe(symetrie, "aucun_nom_candidat_dans_q_att").statut).toBe("vert");
  });
});

describe("part minimale des items A et F", () => {
  function pool(nombreP: number, nombreAF: number): readonly Question[] {
    const directes = CANDIDATS.flatMap((candidat_id) => {
      const jeu = itemsDe(candidat_id);
      return [
        choisir(jeu.p1, "Q-DIR"),
        choisir(jeu.p1, "Q-FER"),
        choisir(jeu.p1, "Q-NEG"),
        choisir(jeu.p1, "Q-ATT"),
        choisir(jeu.p2, "Q-DIR"),
        choisir(jeu.p2, "Q-FER"),
        choisir(jeu.p2, "Q-NEG"),
        choisir(jeu.p2, "Q-ATT"),
      ];
    });
    const absencesEtFictifs = CANDIDATS.flatMap((candidat_id) => {
      const jeu = itemsDe(candidat_id);
      return [choisir(jeu.a, "Q-DIR"), choisir(jeu.a, "Q-FER"), choisir(jeu.f, "Q-ORI"), choisir(jeu.f, "Q-ATT")];
    });
    return [...directes.slice(0, nombreP), ...absencesEtFictifs.slice(0, nombreAF)];
  }

  it("reste verte à exactement 20 %", () => {
    const condition = conditionDe(verifier(pool(16, 4)), "part_items_a_f_minimale");
    expect(condition.mesure).toBe(0.2);
    expect(condition.statut).toBe("vert");
  });

  it("passe au rouge juste sous 20 %", () => {
    const condition = conditionDe(verifier(pool(13, 3)), "part_items_a_f_minimale");
    expect(condition.mesure).toBeLessThan(0.2);
    expect(condition.statut).toBe("rouge");
  });
});

describe("candidats traités à part", () => {
  it("exclut de la comparaison un candidat sous le seuil de couverture", () => {
    const perimetre = run(
      [
        candidat({ candidat_id: "demo-alpha" }),
        candidat({ candidat_id: "demo-beta", items_p_verifies: 8 }),
      ],
      GEL,
    );
    const desequilibre = [
      ...questionsSymetriques("demo-alpha"),
      choisir(itemsDe("demo-beta").p1, "Q-DIR"),
      choisir(itemsDe("demo-alpha").p1, "Q-ATT"),
    ];
    const symetrie = verifierSymetrie(tirageDe(desequilibre), QUESTIONS, ITEMS, perimetre);
    expect(conditionDe(symetrie, "nombre_questions_par_candidat").statut).toBe("vert");
  });
});

describe("entrées du tirage sans question correspondante", () => {
  it("refuse de noter la symétrie d'un tirage dont une question est introuvable", () => {
    const orpheline: EntreeTirage = {
      ...(entreesPour([choisir(itemsDe("demo-alpha").p1, "Q-ATT")], ITEMS, MESURES, GEL)[0] as EntreeTirage),
      question_id: "q_" + "0".repeat(32),
    };
    const tirage: Tirage = {
      run_id: RUN.id,
      date_gel: GEL,
      graine_tirage: graine(),
      entrees: [orpheline],
    };
    expect(() => verifierSymetrie(tirage, QUESTIONS, ITEMS, RUN)).toThrow(/introuvable/i);
  });
});
