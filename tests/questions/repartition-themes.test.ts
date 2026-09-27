/**
 * Constat n° 23 de la conformité du 2026-09-24. §5 : « répartition par thème identique par candidat
 * quand les items le permettent ; sinon, l'écart est imprimé dans le rapport du run. » La condition
 * rendait `ecart_tolere` dès qu'un écart existait, sans comparer le tirage aux items disponibles :
 * un tirage fautif passait la barrière comme un tirage contraint par la couverture.
 *
 * Ce qui est jugé, strate par strate (thème × gabarit, la stratification du §5) : un candidat comparé
 * en retard sur un thème est fautif si, dans une strate de ce thème, il a reçu moins de questions
 * qu'un autre candidat comparé alors que ses questions tirables de cette strate auraient suffi à
 * l'égaler. Les questions compensatrices (§5, protocole 0.9, `tirage.compensations`) ne comptent pas
 * dans la strate dont elles viennent : c'est le mécanisme même qui crée l'écart toléré.
 */

import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { conditionDeSymetrie, verifierSymetrie } from "../../pipeline/questions/symetrie.ts";
import { entreesPour, tirer } from "../../pipeline/questions/tirage.ts";
import type { CodeGabarit, Item, Mesure, Question, Theme, Tirage } from "../../pipeline/questions/types.ts";
import { candidat, completer, graine, identifiant, itemP, mesure, perimetre, run } from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const FISC: Theme = "fiscalite_pouvoir_achat";
const RETR: Theme = "retraites";
const CANDIDATS = ["demo-alpha", "demo-beta"];
const RUN = run(CANDIDATS.map((candidat_id) => candidat({ candidat_id })), GEL);

const MESURES: readonly Mesure[] = [
  mesure({ cle: "rt-fisc-0", theme: FISC }),
  mesure({ cle: "rt-fisc-1", theme: FISC }),
  mesure({ cle: "rt-retr-0", theme: RETR }),
  mesure({ cle: "rt-retr-1", theme: RETR }),
];
const [FISC_0, FISC_1, RETR_0, RETR_1] = MESURES as [Mesure, Mesure, Mesure, Mesure];

/** alpha : deux items sur la fiscalité, un sur les retraites. beta : deux et deux. */
function items(betaFisc1: Partial<Parameters<typeof itemP>[0]> = {}): readonly Item[] {
  return [
    itemP({ cle: "rt-alpha-f0", candidat_id: "demo-alpha", mesure: FISC_0 }),
    itemP({ cle: "rt-alpha-f1", candidat_id: "demo-alpha", mesure: FISC_1 }),
    itemP({ cle: "rt-alpha-r0", candidat_id: "demo-alpha", mesure: RETR_0 }),
    itemP({ cle: "rt-beta-f0", candidat_id: "demo-beta", mesure: FISC_0 }),
    itemP({ cle: "rt-beta-f1", candidat_id: "demo-beta", mesure: FISC_1, ...betaFisc1 }),
    itemP({ cle: "rt-beta-r0", candidat_id: "demo-beta", mesure: RETR_0 }),
    itemP({ cle: "rt-beta-r1", candidat_id: "demo-beta", mesure: RETR_1 }),
  ];
}

function questionsDe(jeu: readonly Item[]): readonly Question[] {
  return engendrer(jeu, MESURES, perimetre(CANDIDATS)).map(completer);
}

function q(questions: readonly Question[], jeu: readonly Item[], cle: string, gabarit: CodeGabarit): Question {
  const item_id = identifiant(`item:${cle}`);
  if (!jeu.some((item) => item.id === item_id)) throw new Error(`Item ${cle} absent du jeu.`);
  const trouvee = questions.find((question) => question.grappe_id === item_id && question.gabarit === gabarit);
  if (trouvee === undefined) throw new Error(`Question ${gabarit} absente pour ${cle}.`);
  return trouvee;
}

/**
 * Tirage écrit à la main, trois Q-DIR chacun : alpha fiscalité 2, retraites 1 ; beta fiscalité 1,
 * retraites 2. Sans compensation inscrite.
 */
function tirageEnRetard(jeu: readonly Item[], questions: readonly Question[]): Tirage {
  const choisies = [
    q(questions, jeu, "rt-alpha-f0", "Q-DIR"),
    q(questions, jeu, "rt-alpha-f1", "Q-DIR"),
    q(questions, jeu, "rt-alpha-r0", "Q-DIR"),
    q(questions, jeu, "rt-beta-f0", "Q-DIR"),
    q(questions, jeu, "rt-beta-r0", "Q-DIR"),
    q(questions, jeu, "rt-beta-r1", "Q-DIR"),
  ];
  return {
    run_id: RUN.id,
    date_gel: GEL,
    graine_tirage: graine(),
    entrees: entreesPour(choisies, jeu, MESURES, RUN),
    exclusions: [],
    bilan_reprise: [],
    compensations: [],
  };
}

function repartition(jeu: readonly Item[], tirage?: Tirage) {
  const questions = questionsDe(jeu);
  const symetrie = verifierSymetrie(tirage ?? tirageEnRetard(jeu, questions), questions, jeu, MESURES, RUN);
  const condition = conditionDeSymetrie(symetrie, "repartition_themes");
  if (condition === undefined) throw new Error("Condition repartition_themes absente.");
  return condition;
}

describe("n° 23 : l'écart de thème est jugé contre les items tirables", () => {
  it("passe au rouge quand les items tirables du candidat en retard auraient comblé l'écart", () => {
    // beta : 1 Q-DIR fiscalité contre 2 pour alpha, alors que ses deux items fiscalité sont tirables.
    const condition = repartition(items());
    expect(condition.statut).toBe("rouge");
    expect(condition.mesure).toBe(1);
    expect(condition.commentaire).toContain("demo-beta");
    expect(condition.commentaire).toContain(`${FISC} × Q-DIR`);
    // alpha est en retard sur les retraites, mais il n'y a qu'un item : l'écart-là n'est pas fautif.
    expect(condition.commentaire).not.toContain("demo-alpha");
  });

  it("tolère et imprime l'écart dû à un manque d'items tirables", () => {
    // Même tirage ; beta n'a plus qu'un item fiscalité. Chacun a reçu tout ce que ses items permettaient.
    const sansItem = items().filter((item) => item.id !== identifiant("item:rt-beta-f1"));
    const condition = repartition(sansItem);
    expect(condition.statut).toBe("ecart_tolere");
    expect(condition.mesure).toBe(1);
    expect(condition.detail_par_candidat).toEqual([
      { candidat_id: "demo-alpha", valeur: 1 },
      { candidat_id: "demo-beta", valeur: 1 },
    ]);
  });

  it("tolère l'écart combleable seulement par une question non tirable : item contesté", () => {
    expect(repartition(items({ statut_contestation: "contestee" })).statut).toBe("ecart_tolere");
  });

  it("tolère l'écart combleable seulement par une question non tirable : item hors validité au gel", () => {
    expect(repartition(items({ valide_au: "2026-11-15" })).statut).toBe("ecart_tolere");
  });

  it("ne juge fautif que le candidat en retard sur le thème, pas celui qui y est en avance", () => {
    // alpha : ses deux items fiscalité sont « sans objet », donc sans Q-FER tirable (§5, 0.9).
    // beta reçoit 3 questions fiscalité contre 2 : en avance sur le thème, même si sa strate
    // fiscalité × Q-DIR (1 contre 2) aurait pu recevoir une question de plus. alpha, en retard,
    // n'avait aucune Q-FER tirable : l'écart est toléré.
    const jeu = [
      itemP({ cle: "rt-alpha-f0", candidat_id: "demo-alpha", mesure: FISC_0, position: "sans_objet" }),
      itemP({ cle: "rt-alpha-f1", candidat_id: "demo-alpha", mesure: FISC_1, position: "sans_objet" }),
      itemP({ cle: "rt-alpha-r0", candidat_id: "demo-alpha", mesure: RETR_0 }),
      itemP({ cle: "rt-beta-f0", candidat_id: "demo-beta", mesure: FISC_0 }),
      itemP({ cle: "rt-beta-f1", candidat_id: "demo-beta", mesure: FISC_1 }),
      itemP({ cle: "rt-beta-r0", candidat_id: "demo-beta", mesure: RETR_0 }),
    ];
    const questions = questionsDe(jeu);
    const choisies = [
      q(questions, jeu, "rt-alpha-f0", "Q-DIR"),
      q(questions, jeu, "rt-alpha-f1", "Q-DIR"),
      q(questions, jeu, "rt-alpha-r0", "Q-DIR"),
      q(questions, jeu, "rt-beta-f0", "Q-DIR"),
      q(questions, jeu, "rt-beta-f0", "Q-FER"),
      q(questions, jeu, "rt-beta-f1", "Q-FER"),
      q(questions, jeu, "rt-beta-r0", "Q-DIR"),
    ];
    const tirage: Tirage = { ...tirageEnRetard(items(), questionsDe(items())), entrees: entreesPour(choisies, jeu, MESURES, RUN) };
    expect(repartition(jeu, tirage).statut).toBe("ecart_tolere");
  });

  it("reste vert à répartition identique", () => {
    const jeu = items();
    const questions = questionsDe(jeu);
    const egal: Tirage = {
      ...tirageEnRetard(jeu, questions),
      entrees: entreesPour(
        [
          q(questions, jeu, "rt-alpha-f0", "Q-DIR"),
          q(questions, jeu, "rt-alpha-r0", "Q-DIR"),
          q(questions, jeu, "rt-beta-f0", "Q-DIR"),
          q(questions, jeu, "rt-beta-r0", "Q-DIR"),
        ],
        jeu,
        MESURES,
        RUN,
      ),
    };
    const condition = repartition(jeu, egal);
    expect(condition.statut).toBe("vert");
    expect(condition.mesure).toBe(0);
  });
});

describe("n° 23 : interaction avec une strate compensée (§5, protocole 0.9)", () => {
  // beta n'a aucun item sur les retraites : ses strates retraites sont compensées depuis la fiscalité.
  // alpha a deux items fiscalité, assez pour égaler le total fiscalité de beta si l'on oubliait que le
  // second y serait entré au-delà du quota de sa strate : c'est le cas où la règle naïve contredirait
  // la compensation.
  const alpha = [FISC_0, FISC_1, RETR_0].map((m, rang) => itemP({ cle: `rtc-alpha-${rang}`, candidat_id: "demo-alpha", mesure: m }));
  const beta = [FISC_0, FISC_1].map((m, rang) => itemP({ cle: `rtc-beta-${rang}`, candidat_id: "demo-beta", mesure: m }));
  const jeu = [...alpha, ...beta];
  const questions = questionsDe(jeu);
  const { tirage } = tirer({
    questions,
    items: jeu,
    mesures: MESURES,
    run: RUN,
    graine: graine(),
    parametres: { questions_par_strate: 1, questions_attribution_par_theme: 1 },
  });

  it("le tirage réel compense, et l'écart de thème qui en résulte est toléré, pas rouge", () => {
    expect(tirage.compensations.length).toBeGreaterThan(0);
    const symetrie = verifierSymetrie(tirage, questions, jeu, MESURES, RUN);
    const condition = conditionDeSymetrie(symetrie, "repartition_themes");
    // alpha est en retard sur la fiscalité, où beta a reçu ses compensations ; alpha n'avait pas
    // d'autre question fiscalité à y mettre sans dépasser le quota de ses strates.
    expect(condition?.statut).toBe("ecart_tolere");
    expect(condition?.commentaire).toMatch(/compensation/);
    // Totaux égaux : la compensation a joué. (Le jeu, sans item A ni F, rougit la part minimale : hors sujet.)
    expect(conditionDeSymetrie(symetrie, "nombre_questions_par_candidat")?.statut).toBe("vert");
  });

  it("une compensation n'excuse pas une strate propre incomplète", () => {
    // Le même tirage, où alpha perd sa question fiscalité × Q-DIR alors qu'elle était tirable.
    const fautive = tirage.entrees.find(
      (entree) => entree.candidat_id === "demo-alpha" && entree.gabarit === "Q-DIR" && entree.theme === FISC,
    );
    expect(fautive).toBeDefined();
    const tronque: Tirage = { ...tirage, entrees: tirage.entrees.filter((entree) => entree !== fautive) };
    const condition = conditionDeSymetrie(verifierSymetrie(tronque, questions, jeu, MESURES, RUN), "repartition_themes");
    expect(condition?.statut).toBe("rouge");
    expect(condition?.commentaire).toContain("demo-alpha");
  });
});
