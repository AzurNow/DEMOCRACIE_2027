/**
 * Tirage stratifié (candidat × thème × gabarit), reproductible à graine, avec reprise de 80 %
 * des questions du run précédent (§5).
 *
 * Les sept cas limites du lot : reproductibilité, arrondi de la reprise aux deux bornes,
 * candidat nouveau, candidat sous le seuil, candidat non interrogé, item contesté après
 * engendrement, et strate vide signalée plutôt que comblée.
 */

import { describe, expect, it } from "vitest";
import {
  ArbitrageSansDecision,
  DecisionPanelPosterieureAuGel,
  DecisionsPanelSimultanees,
  empreinteNeutre,
  PART_REPRISE,
  tirer,
  tiragePrecedentDepuis,
} from "../../pipeline/questions/tirage.ts";
import type { TiragePrecedent } from "../../pipeline/questions/tirage.ts";
import type { Item, Question } from "../../pipeline/questions/types.ts";
import { candidat, contestation, graine, jeu, run, THEMES_DE_TEST } from "./fabriques.ts";

const MESURES_PAR_THEME = 10;
const GEL = "2026-12-01T06:00:00+01:00";
const CANDIDATS = ["demo-alpha", "demo-beta"];

const JEU = jeu({ candidats: CANDIDATS, themes: THEMES_DE_TEST, mesures_par_theme: MESURES_PAR_THEME });
const RUN = run(CANDIDATS.map((candidat_id) => candidat({ candidat_id })), GEL);

/** La première moitié des mesures de chaque thème tient lieu de « déjà posée au run précédent ». */
function precedent(questions: readonly Question[], items: readonly Item[]): TiragePrecedent {
  const anciennes = new Set(
    JEU.mesures.filter((_, rang) => rang % MESURES_PAR_THEME < MESURES_PAR_THEME / 2).map((m) => m.id),
  );
  const parId = new Map(items.map((item) => [item.id, item]));
  const reprises = questions.filter((question) => {
    const principal = parId.get(question.grappe_id);
    return principal !== undefined && anciennes.has(principal.mesure_id);
  });
  return {
    run_id: "44CX8VSV75Q6ZAHDEJ8VA81YQE",
    empreintes_texte: new Map(reprises.map((question) => [question.id, empreinteNeutre(question)])),
  };
}

function tirage(questions_par_strate: number, tirage_precedent?: TiragePrecedent) {
  return tirer({
    questions: JEU.questions,
    items: JEU.items,
    mesures: JEU.mesures,
    run: RUN,
    graine: graine(),
    parametres: { questions_par_strate },
    ...(tirage_precedent === undefined ? {} : { tirage_precedent }),
  });
}

function comptePour(resultat: ReturnType<typeof tirage>, candidat_id: string): number {
  return resultat.tirage.entrees.filter((entree) => entree.candidat_id === candidat_id).length;
}

function reprisesPour(resultat: ReturnType<typeof tirage>, candidat_id: string): number {
  return resultat.tirage.entrees.filter(
    (entree) => entree.candidat_id === candidat_id && entree.reprise,
  ).length;
}

describe("reproductibilité", () => {
  it("rend un tirage identique octet pour octet à graine et entrées identiques", () => {
    const premier = JSON.stringify(tirage(1).tirage);
    const second = JSON.stringify(tirage(1).tirage);
    expect(second).toBe(premier);
  });

  it("rend un tirage différent avec une autre graine", () => {
    const avec = (valeur: number) =>
      JSON.stringify(
        tirer({
          questions: JEU.questions,
          items: JEU.items,
          mesures: JEU.mesures,
          run: RUN,
          graine: graine(valeur),
          parametres: { questions_par_strate: 1 },
        }).tirage,
      );
    expect(avec(20270101)).not.toBe(avec(20261201));
  });

  it("recopie la graine et la date de gel dans le fichier de tirage", () => {
    const resultat = tirage(1);
    expect(resultat.tirage.graine_tirage).toEqual(graine());
    expect(resultat.tirage.date_gel).toBe(GEL);
    expect(resultat.tirage.run_id).toBe(RUN.id);
  });
});

describe("stratification", () => {
  it("tire le quota demandé dans chaque strate candidat × thème × gabarit", () => {
    const resultat = tirage(1);
    // Trois gabarits nommant un candidat pour un item P (Q-DIR, Q-FER, Q-NEG) × deux thèmes.
    for (const candidat_id of CANDIDATS) expect(comptePour(resultat, candidat_id)).toBe(6);
  });

  it("tire le même nombre de questions pour deux candidats aux items identiques", () => {
    const resultat = tirage(5);
    expect(comptePour(resultat, "demo-alpha")).toBe(comptePour(resultat, "demo-beta"));
  });

  it("signale une strate vide au lieu de la combler avec une autre strate", () => {
    const lacunaire = jeu({
      candidats: CANDIDATS,
      themes: THEMES_DE_TEST,
      mesures_par_theme: MESURES_PAR_THEME,
      themes_manquants: { "demo-beta": ["retraites"] },
    });
    const resultat = tirer({
      questions: lacunaire.questions,
      items: lacunaire.items,
      mesures: lacunaire.mesures,
      run: RUN,
      graine: graine(),
      parametres: { questions_par_strate: 1 },
    });

    const vides = resultat.rapport.strates_vides.filter(
      (strate) => strate.candidat_id === "demo-beta",
    );
    expect(vides.map((strate) => strate.theme)).toEqual(["retraites", "retraites", "retraites"]);
    expect(comptePour(resultat, "demo-beta")).toBe(3);
    expect(comptePour(resultat, "demo-alpha")).toBe(6);
  });
});

describe("reprise de 80 % des questions du run précédent", () => {
  it("arrondit vers le bas par candidat quand le produit n'est pas entier", () => {
    const resultat = tirage(1, precedent(JEU.questions, JEU.items));
    const cible = comptePour(resultat, "demo-alpha");
    expect(cible).toBe(6);
    expect(Math.floor(PART_REPRISE * cible)).toBe(4);
    expect(reprisesPour(resultat, "demo-alpha")).toBe(4);
    expect(reprisesPour(resultat, "demo-beta")).toBe(4);
  });

  it("atteint exactement le quota quand le produit est entier", () => {
    const resultat = tirage(5, precedent(JEU.questions, JEU.items));
    const cible = comptePour(resultat, "demo-alpha");
    expect(cible).toBe(30);
    expect(PART_REPRISE * cible).toBe(24);
    expect(reprisesPour(resultat, "demo-alpha")).toBe(24);
  });

  it("épingle le run d'origine et l'empreinte du texte précédent sur chaque reprise", () => {
    const attendu = precedent(JEU.questions, JEU.items);
    const resultat = tirage(1, attendu);
    const reprises = resultat.tirage.entrees.filter((entree) => entree.reprise);
    expect(reprises.length).toBeGreaterThan(0);
    for (const entree of reprises) {
      expect(entree.run_origine_id).toBe(attendu.run_id);
      expect(entree.empreinte_texte_precedente).toBe(
        attendu.empreintes_texte.get(entree.question_id),
      );
    }
  });

  it("n'épingle aucune origine sur une question neuve", () => {
    const resultat = tirage(1, precedent(JEU.questions, JEU.items));
    for (const entree of resultat.tirage.entrees.filter((e) => !e.reprise)) {
      expect(entree.run_origine_id).toBeUndefined();
      expect(entree.empreinte_texte_precedente).toBeUndefined();
    }
  });

  it("exclut un candidat nouveau du ratio de reprise", () => {
    const perimetre = run(
      [
        candidat({ candidat_id: "demo-alpha" }),
        candidat({ candidat_id: "demo-beta", statut_au_gel: "nouveau" }),
      ],
      GEL,
    );
    const resultat = tirer({
      questions: JEU.questions,
      items: JEU.items,
      mesures: JEU.mesures,
      run: perimetre,
      graine: graine(),
      parametres: { questions_par_strate: 1 },
      tirage_precedent: precedent(JEU.questions, JEU.items),
    });
    expect(reprisesPour(resultat, "demo-beta")).toBe(0);
    expect(reprisesPour(resultat, "demo-alpha")).toBe(4);
    expect(resultat.rapport.reprises_par_candidat).toContainEqual({
      candidat_id: "demo-beta",
      cible: 6,
      budget_reprise: 0,
      reprises: 0,
    });
  });

  /*
   * §5 (0.3) : « Les questions d'attribution […] suivent le même budget de reprise, stratifiées
   * par thème. » Un seul thème : la strate d'attribution et son groupe coïncident, et
   * l'arrondi par défaut se voit — cible 7, budget ⌊0,8 × 7⌋ = 5 reprises, pas 6 ni 7, alors que
   * 8 questions reprenables et 8 neuves sont disponibles.
   */
  it("applique le budget de reprise de 80 % aux questions d'attribution, par thème", () => {
    const unTheme = jeu({ candidats: CANDIDATS, themes: ["fiscalite_pouvoir_achat"], mesures_par_theme: 8 });
    const attributions = unTheme.questions
      .filter((question) => question.gabarit === "Q-ATT")
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(attributions).toHaveLength(16);
    const anciennes = attributions.slice(0, 8);
    const resultat = tirer({
      questions: unTheme.questions,
      items: unTheme.items,
      mesures: unTheme.mesures,
      run: RUN,
      graine: graine(),
      parametres: { questions_par_strate: 7 },
      tirage_precedent: {
        run_id: "44CX8VSV75Q6ZAHDEJ8VA81YQE",
        empreintes_texte: new Map(anciennes.map((question) => [question.id, empreinteNeutre(question)])),
      },
    });
    const tirees = resultat.tirage.entrees.filter((entree) => entree.gabarit === "Q-ATT");
    expect(tirees).toHaveLength(7);
    expect(Math.floor(PART_REPRISE * 7)).toBe(5);
    expect(tirees.filter((entree) => entree.reprise)).toHaveLength(5);
  });

  it("reconstruit un tirage précédent depuis un tirage publié et ses questions", () => {
    const resultat = tirage(1);
    const reconstruit = tiragePrecedentDepuis(resultat.tirage, JEU.questions);
    expect(reconstruit.run_id).toBe(RUN.id);
    expect(reconstruit.empreintes_texte.size).toBe(resultat.tirage.entrees.length);
  });
});

describe("statut des candidats au gel", () => {
  it("tire à part un candidat sous le seuil de couverture et le signale", () => {
    const perimetre = run(
      [
        candidat({ candidat_id: "demo-alpha" }),
        candidat({ candidat_id: "demo-beta", items_p_verifies: 8 }),
      ],
      GEL,
    );
    const resultat = tirer({
      questions: JEU.questions,
      items: JEU.items,
      mesures: JEU.mesures,
      run: perimetre,
      graine: graine(),
      parametres: { questions_par_strate: 1 },
    });
    expect(resultat.rapport.candidats_a_part).toEqual(["demo-beta"]);
    expect(comptePour(resultat, "demo-beta")).toBe(6);
  });

  it("ne tire aucune question pour un candidat non interrogé (§3, candidat retiré)", () => {
    const perimetre = run(
      [
        candidat({ candidat_id: "demo-alpha" }),
        candidat({ candidat_id: "demo-beta", statut_au_gel: "retire", interroge: false }),
      ],
      GEL,
    );
    const resultat = tirer({
      questions: JEU.questions,
      items: JEU.items,
      mesures: JEU.mesures,
      run: perimetre,
      graine: graine(),
      parametres: { questions_par_strate: 1 },
    });
    expect(comptePour(resultat, "demo-beta")).toBe(0);
    expect(resultat.rapport.candidats_non_interroges).toEqual(["demo-beta"]);
  });
});

describe("exclusion des items non tirables", () => {
  it("ne tire jamais un item contesté après engendrement, même repris du run précédent", () => {
    const contestation = JEU.items[0] as Item;
    const items = JEU.items.map((item) =>
      item.id === contestation.id ? { ...item, statut_contestation: "contestee" as const } : item,
    );
    const resultat = tirer({
      questions: JEU.questions,
      items,
      mesures: JEU.mesures,
      run: RUN,
      graine: graine(),
      parametres: { questions_par_strate: MESURES_PAR_THEME },
      tirage_precedent: precedent(JEU.questions, JEU.items),
    });
    const grappes = resultat.tirage.entrees.map((entree) => entree.grappe_id);
    expect(grappes).not.toContain(contestation.id);
    for (const entree of resultat.tirage.entrees) {
      for (const item of entree.items_au_gel) {
        expect(item.reference.item_id).not.toBe(contestation.id);
      }
    }
  });

  it("ne tire jamais un item dont la validation n'est pas acquise", () => {
    const attente = JEU.items[1] as Item;
    const items = JEU.items.map((item) =>
      item.id === attente.id ? { ...item, statut_validation: "en_attente" } : item,
    );
    const resultat = tirer({
      questions: JEU.questions,
      items,
      mesures: JEU.mesures,
      run: RUN,
      graine: graine(),
      parametres: { questions_par_strate: MESURES_PAR_THEME },
    });
    expect(resultat.tirage.entrees.map((entree) => entree.grappe_id)).not.toContain(attente.id);
  });

  it("refuse un paramètre de quota qui ne tire rien", () => {
    expect(() => tirage(0)).toThrow(/quota/i);
  });
});

/* ------------------------------------------------ item sorti de l'arbitrage */

const ARBITRE = JEU.items[2] as Item;

function avecContestations(contestations: readonly unknown[]): readonly Item[] {
  return JEU.items.map((item) =>
    item.id === ARBITRE.id
      ? { ...item, statut_contestation: "arbitree" as const, contestations }
      : item,
  );
}

function grappesTirees(items: readonly Item[]): readonly string[] {
  return tirer({
    questions: JEU.questions,
    items,
    mesures: JEU.mesures,
    run: RUN,
    graine: graine(),
    parametres: { questions_par_strate: MESURES_PAR_THEME },
  }).tirage.entrees.map((entree) => entree.grappe_id);
}

function tireAvec(contestations: readonly unknown[]): boolean {
  return grappesTirees(avecContestations(contestations)).includes(ARBITRE.id);
}

describe("item sorti de l'arbitrage du panel (§5, annexe E point 6)", () => {
  it("cas 5 : tire un item arbitré dont la dernière décision vaut maintien", () => {
    expect(tireAvec([contestation("m", "maintien", "2026-10-05T10:00:00+02:00")])).toBe(true);
  });

  it("cas 5 : tire un item arbitré dont la dernière décision vaut correction", () => {
    expect(tireAvec([contestation("c", "correction", "2026-10-05T10:00:00+02:00")])).toBe(true);
  });

  it("cas 6 : ne tire pas un item arbitré dont la dernière décision vaut retrait", () => {
    expect(tireAvec([contestation("r", "retrait", "2026-10-05T10:00:00+02:00")])).toBe(false);
  });

  it("cas 6 : ne tire pas un item arbitré dont la dernière décision vaut non-évaluabilité", () => {
    expect(tireAvec([contestation("n", "non_evaluabilite", "2026-10-05T10:00:00+02:00")])).toBe(
      false,
    );
  });

  it("cas 7 : un retrait puis un maintien rend l'item tirable, quel que soit l'ordre du tableau", () => {
    const retrait = contestation("7a", "retrait", "2026-10-05T10:00:00+02:00");
    const maintien = contestation("7b", "maintien", "2026-10-20T10:00:00+02:00");
    expect(tireAvec([retrait, maintien])).toBe(true);
    expect(tireAvec([maintien, retrait])).toBe(true);
  });

  it("cas 7 : un maintien puis un retrait sort l'item, quel que soit l'ordre du tableau", () => {
    const maintien = contestation("7c", "maintien", "2026-10-05T10:00:00+02:00");
    const retrait = contestation("7d", "retrait", "2026-10-20T10:00:00+02:00");
    expect(tireAvec([maintien, retrait])).toBe(false);
    expect(tireAvec([retrait, maintien])).toBe(false);
  });

  it("ordonne les décisions sur l'instant, pas sur la chaîne : 10 h à Paris précède 9 h UTC", () => {
    const retrait = contestation("i1", "retrait", "2026-10-05T10:00:00+02:00");
    const maintien = contestation("i2", "maintien", "2026-10-05T09:00:00Z");
    expect(tireAvec([retrait, maintien])).toBe(true);
  });

  it("refuse deux décisions différentes au même instant plutôt que d'inventer un ordre", () => {
    const retrait = contestation("s1", "retrait", "2026-10-05T10:00:00+02:00");
    const maintien = contestation("s2", "maintien", "2026-10-05T08:00:00Z");
    expect(() => tireAvec([retrait, maintien])).toThrow(DecisionsPanelSimultanees);
  });

  it("cas 8 : refuse un item arbitré sans aucune contestation par une erreur nommée", () => {
    expect(() => tireAvec([])).toThrow(ArbitrageSansDecision);
  });

  it("cas 8 : refuse un item arbitré dont une contestation ne porte aucune décision du panel", () => {
    const sansDecision = { ...contestation("sd", "maintien", "2026-10-05T10:00:00+02:00") };
    delete sansDecision["decision_panel"];
    expect(() => tireAvec([sansDecision])).toThrow(ArbitrageSansDecision);
    expect(() =>
      tireAvec([contestation("sd2", "maintien", "2026-10-01T10:00:00+02:00"), sansDecision]),
    ).toThrow(ArbitrageSansDecision);
  });

  it("cas 8 : refuse un item arbitré dont le champ contestations est absent", () => {
    const items = JEU.items.map((item): Item => {
      if (item.id !== ARBITRE.id) return item;
      const { contestations: _absent, ...reste } = item;
      return { ...reste, statut_contestation: "arbitree" };
    });
    expect(() => grappesTirees(items)).toThrow(ArbitrageSansDecision);
  });

  it("refuse une décision du panel hors de l'énumération du schéma", () => {
    const inconnue = {
      ...contestation("x", "maintien", "2026-10-05T10:00:00+02:00"),
      decision_panel: { date: "2026-10-05T10:00:00+02:00", decision: "ajournement", motivation: "m" },
    };
    expect(() => tireAvec([inconnue])).toThrow(/ajournement/);
  });

  it("cas 9 : ne tire jamais un item contesté, même porteur d'une décision de maintien antérieure", () => {
    const items = JEU.items.map((item) =>
      item.id === ARBITRE.id
        ? {
            ...item,
            statut_contestation: "contestee" as const,
            contestations: [contestation("9", "maintien", "2026-10-05T10:00:00+02:00")],
          }
        : item,
    );
    expect(grappesTirees(items)).not.toContain(ARBITRE.id);
  });
});

/* ------------------------------------------- décision du panel figée au gel */

function entreesTirees(items: readonly Item[]) {
  return tirer({
    questions: JEU.questions,
    items,
    mesures: JEU.mesures,
    run: RUN,
    graine: graine(),
    parametres: { questions_par_strate: MESURES_PAR_THEME },
  }).tirage.entrees;
}

function itemsAuGelDe(items: readonly Item[], item_id: string) {
  return entreesTirees(items)
    .flatMap((entree) => entree.items_au_gel)
    .filter((item) => item.reference.item_id === item_id);
}

describe("décision du panel figée dans items_au_gel", () => {
  it("fige la décision et sa date pour un item arbitré maintenu", () => {
    const date = "2026-10-05T10:00:00+02:00";
    const figes = itemsAuGelDe(avecContestations([contestation("f1", "maintien", date)]), ARBITRE.id);
    expect(figes.length).toBeGreaterThan(0);
    for (const item of figes) {
      expect(item.statut_contestation_au_gel).toBe("arbitree");
      expect(item.decision_panel_au_gel).toEqual({ decision: "maintien", date });
    }
  });

  it("fige la dernière décision, pas la première du tableau", () => {
    const figes = itemsAuGelDe(
      avecContestations([
        contestation("f3", "correction", "2026-10-20T10:00:00+02:00"),
        contestation("f2", "retrait", "2026-10-05T10:00:00+02:00"),
      ]),
      ARBITRE.id,
    );
    for (const item of figes) {
      expect(item.decision_panel_au_gel).toEqual({
        decision: "correction",
        date: "2026-10-20T10:00:00+02:00",
      });
    }
  });

  it("ne porte aucune décision figée pour un item non arbitré", () => {
    for (const entree of entreesTirees(JEU.items)) {
      for (const item of entree.items_au_gel) expect(item).not.toHaveProperty("decision_panel_au_gel");
    }
  });

  it("refuse de figer une décision du panel datée après le gel", () => {
    const apres = contestation("f4", "maintien", "2026-12-01T06:00:01+01:00");
    expect(() => entreesTirees(avecContestations([apres]))).toThrow(DecisionPanelPosterieureAuGel);
  });

  it("accepte une décision datée exactement à l'instant du gel", () => {
    const pile = contestation("f5", "maintien", "2026-12-01T05:00:00Z");
    const figes = itemsAuGelDe(avecContestations([pile]), ARBITRE.id);
    expect(figes.length).toBeGreaterThan(0);
  });
});

describe("contenu des entrées tirées", () => {
  it("porte le thème, la grappe, les statuts au gel et la réponse attendue", () => {
    const resultat = tirage(1);
    const parId = new Map(JEU.items.map((item) => [item.id, item]));
    for (const entree of resultat.tirage.entrees) {
      expect(parId.has(entree.grappe_id)).toBe(true);
      expect(entree.reponse_attendue.resolution_temporelle.date_gel).toBe(GEL);
      for (const item of entree.items_au_gel) {
        expect(item.statut_validation_au_gel).toBe("verifie");
        expect(item.statut_contestation_au_gel).toBe("aucune");
      }
    }
  });

  it("n'attribue aucun candidat aux entrées d'attribution", () => {
    const resultat = tirage(1);
    const attribution = resultat.tirage.entrees.filter((entree) => entree.gabarit === "Q-ATT");
    expect(attribution.length).toBeGreaterThan(0);
    for (const entree of attribution) expect(entree.candidat_id).toBeUndefined();
  });

  it("refuse une question dont l'item principal est absent du jeu d'items", () => {
    expect(() =>
      tirer({
        questions: JEU.questions,
        items: [],
        mesures: JEU.mesures,
        run: RUN,
        graine: graine(),
        parametres: { questions_par_strate: 1 },
      }),
    ).toThrow(/introuvable/i);
  });

  it("refuse une question dont la mesure de l'item principal est absente du référentiel", () => {
    expect(() =>
      tirer({
        questions: JEU.questions,
        items: JEU.items,
        mesures: [],
        run: RUN,
        graine: graine(),
        parametres: { questions_par_strate: 1 },
      }),
    ).toThrow(/mesure/i);
  });
});
