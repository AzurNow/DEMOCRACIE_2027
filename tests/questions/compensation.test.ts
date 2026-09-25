/**
 * Constat n° 38 de la conformité du 2026-09-24, protocole 0.9 (§5) : « Une strate vide ou
 * incomplète chez un candidat comparé, au regard de ce que les autres candidats comparés y
 * reçoivent, est compensée par des questions du même gabarit sur d'autres thèmes de ce candidat,
 * choisies par la graine ; si aucune n'est disponible, la condition sur le nombre de questions
 * échoue et le run ne part pas. » L'écart de thème qui en résulte est imprimé dans le rapport.
 *
 * Avant la 0.9, une strate vide était « rapportée telle quelle, jamais comblée » : le premier trou
 * de couverture bloquait le run.
 */

import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { conditionDeSymetrie, verifierSymetrie } from "../../pipeline/questions/symetrie.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import type { CandidatAuGel, Item, Mesure, Question, Theme } from "../../pipeline/questions/types.ts";
import { candidat, completer, graine, itemP, mesure, perimetre, run } from "./fabriques.ts";
import { valider } from "../../outils/schemas/valider.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const FISC: Theme = "fiscalite_pouvoir_achat";
const RETR: Theme = "retraites";

/** Nombre d'items P par candidat et par thème ; les mesures d'un thème sont partagées. */
type Couverture = Readonly<Record<string, Partial<Record<Theme, number>>>>;

interface Jeu {
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  readonly questions: readonly Question[];
}

function construire(couverture: Couverture): Jeu {
  const themes = [FISC, RETR];
  const maximum = (theme: Theme) => Math.max(...Object.values(couverture).map((parTheme) => parTheme[theme] ?? 0));
  const mesures = themes.flatMap((theme) =>
    Array.from({ length: maximum(theme) }, (_, rang) => mesure({ cle: `cmp-${theme}-${rang}`, theme })),
  );
  const items = Object.entries(couverture).flatMap(([candidat_id, parTheme]) =>
    themes.flatMap((theme) =>
      mesures
        .filter((referent) => referent.theme === theme)
        .slice(0, parTheme[theme] ?? 0)
        .map((referent) => itemP({ cle: `cmp-${candidat_id}-${referent.id}`, candidat_id, mesure: referent })),
    ),
  );
  const questions = engendrer(items, mesures, perimetre(Object.keys(couverture))).map(completer);
  return { items, mesures, questions };
}

function tirerSur(jeu: Jeu, candidats: readonly CandidatAuGel[], quota: number, valeur = 20261201) {
  const perimetreDuRun = run(candidats, GEL);
  const resultat = tirer({
    questions: jeu.questions,
    items: jeu.items,
    mesures: jeu.mesures,
    run: perimetreDuRun,
    graine: graine(valeur),
    parametres: { questions_par_strate: quota, questions_attribution_par_theme: 1 },
  });
  return { ...resultat, symetrie: verifierSymetrie(resultat.tirage, jeu.questions, jeu.items, perimetreDuRun) };
}

function compte(resultat: ReturnType<typeof tirerSur>, candidat_id: string, theme?: Theme): number {
  return resultat.tirage.entrees.filter(
    (entree) => entree.candidat_id === candidat_id && (theme === undefined || entree.theme === theme),
  ).length;
}

const COMPARES = (ids: readonly string[]) => ids.map((candidat_id) => candidat({ candidat_id }));

describe("n° 38 : strate vide chez un candidat comparé, compensable", () => {
  const jeu = construire({ "demo-alpha": { [FISC]: 1, [RETR]: 1 }, "demo-beta": { [FISC]: 2 } });
  const resultat = tirerSur(jeu, COMPARES(["demo-alpha", "demo-beta"]), 1);

  it("les totaux sont égaux et la condition sur le nombre de questions est verte", () => {
    expect(compte(resultat, "demo-alpha")).toBe(6);
    expect(compte(resultat, "demo-beta")).toBe(6);
    expect(conditionDeSymetrie(resultat.symetrie, "nombre_questions_par_candidat")?.statut).toBe("vert");
  });

  it("chaque compensation est inscrite dans le tirage : strate déficitaire, question, thème d'origine", () => {
    const compensations = resultat.tirage.compensations;
    expect(compensations).toHaveLength(3);
    expect(compensations.map((c) => c.gabarit).sort()).toEqual(["Q-DIR", "Q-FER", "Q-NEG"]);
    for (const compensation of compensations) {
      expect(compensation).toMatchObject({ candidat_id: "demo-beta", theme_deficitaire: RETR, theme_origine: FISC });
      const entree = resultat.tirage.entrees.find((e) => e.question_id === compensation.question_id);
      expect(entree).toMatchObject({ candidat_id: "demo-beta", theme: FISC, gabarit: compensation.gabarit });
    }
  });

  it("la compensation garde le gabarit, jamais un autre", () => {
    const gabarits = (candidat_id: string) =>
      resultat.tirage.entrees.filter((e) => e.candidat_id === candidat_id).map((e) => e.gabarit).sort();
    expect(gabarits("demo-beta")).toEqual(gabarits("demo-alpha"));
  });

  it("l'écart de thème est imprimé par la répartition par thème", () => {
    const condition = conditionDeSymetrie(resultat.symetrie, "repartition_themes");
    expect(condition?.statut).toBe("ecart_tolere");
    expect(condition?.mesure).toBe(3);
    expect(condition?.detail_par_candidat).toEqual([
      { candidat_id: "demo-alpha", valeur: 3 },
      { candidat_id: "demo-beta", valeur: 3 },
    ]);
    expect(condition?.commentaire).toMatch(/3 compensation/);
  });

  it("le budget de reprise porte sur le total après compensation", () => {
    expect(resultat.tirage.bilan_reprise).toContainEqual(expect.objectContaining({ candidat_id: "demo-beta", cible: 6 }));
  });

  it("le tirage publié, compensations et bilan compris, est conforme à tirage.schema.json", () => {
    expect(() => valider("tirage", JSON.parse(JSON.stringify(resultat.tirage)), "tirage compensé")).not.toThrow();
  });

  it("la strate vide reste rapportée", () => {
    const vides = resultat.rapport.strates_vides.filter((strate) => strate.candidat_id === "demo-beta");
    expect(vides.map((strate) => strate.theme)).toEqual([RETR, RETR, RETR]);
  });
});

describe("n° 38 : strate incomplète", () => {
  it("2 questions disponibles contre un quota de 3 reçu par les autres : compensée d'une question", () => {
    const jeu = construire({ "demo-alpha": { [FISC]: 3, [RETR]: 3 }, "demo-gamma": { [FISC]: 2, [RETR]: 4 } });
    const resultat = tirerSur(jeu, COMPARES(["demo-alpha", "demo-gamma"]), 3);
    expect(compte(resultat, "demo-alpha")).toBe(18);
    expect(compte(resultat, "demo-gamma")).toBe(18);
    expect(compte(resultat, "demo-gamma", FISC)).toBe(6);
    expect(compte(resultat, "demo-gamma", RETR)).toBe(12);
    const parGabarit = resultat.tirage.compensations.map((c) => `${c.gabarit}:${c.theme_deficitaire}:${c.theme_origine}`);
    expect(parGabarit.sort()).toEqual([
      `Q-DIR:${FISC}:${RETR}`,
      `Q-FER:${FISC}:${RETR}`,
      `Q-NEG:${FISC}:${RETR}`,
    ]);
  });
});

describe("n° 38 : déficit non compensable", () => {
  it("aucune question du gabarit ailleurs : rien n'est forcé, symétrie rouge, pas d'exception", () => {
    const jeu = construire({ "demo-alpha": { [FISC]: 1, [RETR]: 1 }, "demo-beta": { [FISC]: 1 } });
    const resultat = tirerSur(jeu, COMPARES(["demo-alpha", "demo-beta"]), 1);
    expect(resultat.tirage.compensations).toEqual([]);
    expect(compte(resultat, "demo-beta")).toBe(3);
    expect(conditionDeSymetrie(resultat.symetrie, "nombre_questions_par_candidat")?.statut).toBe("rouge");
    expect(resultat.symetrie.statut_global).toBe("rouge");
  });
});

describe("n° 38 : qui est cible, qui est source", () => {
  it("strate que personne parmi les comparés ne couvre : aucune compensation", () => {
    const jeu = construire({
      "demo-alpha": { [FISC]: 2 },
      "demo-beta": { [FISC]: 2 },
      "demo-gamma": { [FISC]: 1, [RETR]: 1 },
    });
    const candidats = [...COMPARES(["demo-alpha", "demo-beta"]), candidat({ candidat_id: "demo-gamma", sous_seuil: true })];
    const resultat = tirerSur(jeu, candidats, 1);
    expect(resultat.tirage.compensations).toEqual([]);
    expect(compte(resultat, "demo-alpha")).toBe(3);
  });

  it("candidat non comparé : ni compensé, ni source de la cible des autres", () => {
    const jeu = construire({
      "demo-alpha": { [FISC]: 1, [RETR]: 4 },
      "demo-beta": { [FISC]: 1, [RETR]: 4 },
      "demo-gamma": { [FISC]: 4 },
    });
    const candidats = [...COMPARES(["demo-alpha", "demo-beta"]), candidat({ candidat_id: "demo-gamma", sous_seuil: true })];
    const resultat = tirerSur(jeu, candidats, 3);
    // Si gamma était source, la cible de FISC monterait à 3 et alpha, beta seraient compensés
    // depuis RETR ; s'il était cible, sa strate RETR vide le serait depuis FISC.
    expect(resultat.tirage.compensations).toEqual([]);
    expect(compte(resultat, "demo-alpha")).toBe(12);
    expect(compte(resultat, "demo-gamma")).toBe(9);
  });

  it("candidat non interrogé : ni compensé, ni source", () => {
    const jeu = construire({ "demo-alpha": { [FISC]: 1, [RETR]: 2 }, "demo-beta": { [FISC]: 3 } });
    const candidats = [
      candidat({ candidat_id: "demo-alpha" }),
      candidat({ candidat_id: "demo-beta", statut_au_gel: "retire", interroge: false }),
    ];
    const resultat = tirerSur(jeu, candidats, 3);
    expect(resultat.tirage.compensations).toEqual([]);
  });
});

describe("n° 38 : reproductibilité", () => {
  it("tirage rejoué avec la même graine : identique à l'octet, compensations comprises", () => {
    const jeu = construire({ "demo-alpha": { [FISC]: 2, [RETR]: 2 }, "demo-beta": { [FISC]: 4 } });
    const candidats = COMPARES(["demo-alpha", "demo-beta"]);
    const premier = JSON.stringify(tirerSur(jeu, candidats, 2).tirage);
    expect(JSON.stringify(tirerSur(jeu, candidats, 2).tirage)).toBe(premier);
    expect(tirerSur(jeu, candidats, 2).tirage.compensations).toHaveLength(6);
  });

  it("la graine choisit les questions compensatrices parmi les candidates disponibles", () => {
    const jeu = construire({ "demo-alpha": { [FISC]: 1, [RETR]: 1 }, "demo-beta": { [FISC]: 6 } });
    const candidats = COMPARES(["demo-alpha", "demo-beta"]);
    const choix = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((valeur) =>
        tirerSur(jeu, candidats, 1, valeur)
          .tirage.compensations.map((c) => c.question_id)
          .sort()
          .join(","),
      ),
    );
    expect(choix.size).toBeGreaterThan(1);
  });
});
