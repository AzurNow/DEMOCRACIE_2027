/**
 * Tendance (§8, QR7/H5, 0.9) : « comparaison du premier et du dernier run par outil et par mode,
 * sur le seul canal API, sur les questions communes aux deux runs, avec intervalle par
 * bootstrap ».
 *
 * « Question commune » se lit comme le schéma l'impose : même identifiant ET même empreinte de
 * texte. Une correction d'item qui change le libellé casse la reprise explicitement, plutôt que
 * de faire passer notre propre correction pour une amélioration de l'outil.
 */

import { describe, expect, it } from "vitest";
import { differenceAppariee, reechantillonnerDifference } from "../../analysis/bootstrap.ts";
import { questionsCommunes, tendanceParOutilEtMode } from "../../analysis/tendance.ts";
import type { UniteAnalyse } from "../../analysis/filtre.ts";
import type { PartageCouples } from "../../analysis/seuils.ts";
import type { Question } from "../../analysis/types.ts";
import { exactitude } from "../../analysis/metriques.ts";
import { empreinte, idQuestion, question, tousCompares, ulid, unite } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 100, graine_du_run: 20261201, cle: ["test", "tendance"] };

interface Jeu {
  readonly questions: readonly Question[];
  readonly unites: readonly UniteAnalyse[];
}

/**
 * Les lignes de la tendance quand le seuil de 20 % n'est pas le sujet : chaque couple présent dans
 * un run y est comparable (`tousCompares`). Les couples incomplets ont leurs propres tests.
 */
function tendance(premier: Jeu, dernier: Jeu, ...reste: [typeof exactitude, typeof OPTIONS]) {
  const resultat = tendanceParOutilEtMode(
    { ...premier, couples: tousCompares(premier.unites) },
    { ...dernier, couples: tousCompares(dernier.unites) },
    ...reste,
  );
  expect(resultat.couples_exclus).toEqual([]);
  return resultat.par_outil_et_mode;
}

function questionAvecTexte(cle: string, texte: string) {
  return question({
    id: idQuestion(cle),
    grappe_id: ulid(cle),
    formulations: [
      { id: ulid(`${cle}-neutre`), registre: "neutre", empreinte_texte: empreinte(`${texte}-neutre`) },
      { id: ulid(`${cle}-familier`), registre: "familier", empreinte_texte: empreinte(`${texte}-familier`) },
      {
        id: ulid(`${cle}-oriente`),
        registre: "oriente",
        empreinte_texte: empreinte(`${texte}-oriente`),
        // Protocole 0.11 (n° 37) : la prémisse se résout au gel, dans le tirage, plus sur la question.
      },
    ],
  });
}

function reponseA(cle: string, exacte: boolean) {
  return unite({
    question_id: idQuestion(cle),
    grappe_id: ulid(cle),
    item_principal_id: ulid(cle),
    categorie: exacte ? "exacte" : "inexacte",
  });
}

describe("questions communes aux deux runs", () => {
  it("exclut la question neuve du dernier run et celle dont le texte a changé", () => {
    const premier = [questionAvecTexte("q1", "v1"), questionAvecTexte("q2", "v1")];
    const dernier = [
      questionAvecTexte("q1", "v1"),
      questionAvecTexte("q2", "v2"), // même identifiant, texte corrigé : plus commune
      questionAvecTexte("q3", "v1"), // question neuve du dernier run
    ];

    const communes = questionsCommunes(premier, dernier);

    expect([...communes]).toEqual([idQuestion("q1")]);
  });
});

describe("tendance par outil", () => {
  it("ne compare que sur les questions communes, jamais sur celles d'un seul run", () => {
    // Premier run : q1 exacte, q2 exacte. Dernier run : q1 inexacte, q2 inexacte, q3 inexacte.
    // Seule q1 est commune : exactitude 1/1 au premier, 0/1 au dernier, différence −1.
    // Sans le filtre, le dernier run serait à 0/3 et le premier à 1/2 : différence −0,5.
    const premier = {
      questions: [questionAvecTexte("q1", "v1"), questionAvecTexte("q2", "v1")],
      unites: [reponseA("q1", true), reponseA("q2", true)],
    };
    const dernier = {
      questions: [questionAvecTexte("q1", "v1"), questionAvecTexte("q2", "v2"), questionAvecTexte("q3", "v1")],
      unites: [reponseA("q1", false), reponseA("q2", false), reponseA("q3", false)],
    };

    const [ligne] = tendance(premier, dernier, exactitude, OPTIONS);

    expect(ligne?.outil_id).toBe("outil-alpha");
    expect(ligne?.questions_communes).toBe(1);
    expect(ligne?.difference.taux_a).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
    expect(ligne?.difference.taux_b).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    expect(ligne?.difference.difference).toBe(-1);
    // Une seule question commune, donc une seule grappe. Jusqu'à la 0.8, ce test figeait ici
    // « etablie » (constat n° 44). §8 (0.9) : « Un intervalle calculé sur une seule grappe est
    // dégénéré : la différence correspondante n'est qualifiée ni d'« établie » ni de « non
    // établie », elle est publiée avec la mention « une seule grappe ». »
    expect(ligne?.difference.intervalle?.degenere).toBe("grappe_unique");
    expect(ligne?.difference.qualificatif).toBeNull();
  });

  it("ne qualifie rien pour un outil absent de l'un des deux runs", () => {
    const commune = questionAvecTexte("q1", "v1");
    const premier = { questions: [commune], unites: [reponseA("q1", true)] };
    const dernier = {
      questions: [commune],
      unites: [{ ...reponseA("q1", false), outil_id: "outil-beta" }],
    };

    const tendances = tendance(premier, dernier, exactitude, OPTIONS);

    expect(tendances.map((t) => t.outil_id).sort()).toEqual(["outil-alpha", "outil-beta"]);
    for (const tendance of tendances) {
      expect(tendance.mode).toBe("web_desactivee");
      expect(tendance.difference.difference).toBeNull();
      expect(tendance.difference.qualificatif).toBeNull();
    }
  });
});

describe("appariement des deux runs, comme les effets de condition (conformité n° 21)", () => {
  // Décision de l'auteur du 2026-10-02, conformité n° 21, texte en 0.15 : une question commune
  // dont l'outil n'a de réponse obtenue qu'à l'un des deux runs (manquante à l'autre, §6 : une
  // réponse manquante ne forme pas d'unité) sort de la comparaison, comme
  // `conditions.ts:comparerConditions` sort l'item absent d'un bras.
  const questions = ["q1", "q2", "q3"].map((c) => questionAvecTexte(c, "v1"));

  it("une question commune obtenue à un seul run sort de la tendance", () => {
    // q1 : inexacte aux deux runs. q2 : exacte au premier, manquante au dernier. q3 : manquante au
    // premier, exacte au dernier. Sans appariement : premier 1/2, dernier 1/2, et la différence
    // comparerait {q1, q2} à {q1, q3}. Apparié : 0/1 contre 0/1 sur q1 seule, différence 0.
    const premier = { questions, unites: [reponseA("q1", false), reponseA("q2", true)] };
    const dernier = { questions, unites: [reponseA("q1", false), reponseA("q3", true)] };

    const [ligne] = tendance(premier, dernier, exactitude, OPTIONS);

    expect(ligne?.difference.taux_a).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
    expect(ligne?.difference.taux_b).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
    expect(ligne?.difference.difference).toBe(0);
    expect(ligne?.difference.intervalle?.nombre_grappes).toBe(1);
    expect(ligne?.questions_exclues).toEqual([idQuestion("q2"), idQuestion("q3")]);
  });

  it("l'effectif publié est celui de la différence", () => {
    // q1, q2 : obtenues aux deux runs. q3 : obtenue au premier seul. L'effectif publié compte les
    // questions sur lesquelles porte la différence (2), pas celles rencontrées à l'un des runs (3),
    // et la différence porte exactement sur elles : ses dénominateurs comptent leurs réponses.
    const premier = { questions, unites: [reponseA("q1", true), reponseA("q2", true), reponseA("q3", false)] };
    const dernier = { questions, unites: [reponseA("q1", true), reponseA("q2", false)] };

    const [ligne] = tendance(premier, dernier, exactitude, OPTIONS);

    expect(ligne?.questions_communes).toBe(2);
    expect(ligne?.difference.taux_b).toEqual({ numerateur: 2, denominateur: 2, valeur: 1 });
    expect(ligne?.difference.taux_a).toEqual({ numerateur: 1, denominateur: 2, valeur: 0.5 });
    expect(ligne?.difference.intervalle?.nombre_grappes).toBe(2);
    expect(ligne?.questions_exclues).toEqual([idQuestion("q3")]);
  });

  it("apparie par question, pas par grappe : une question d'une grappe appariée, obtenue à un seul run, sort", () => {
    // Deux questions du même item (même grappe, deux gabarits). qa obtenue aux deux runs, qb au
    // premier seul. Apparier par grappe garderait qb au premier run, puisque la grappe y est
    // présente aux deux : la différence comparerait encore deux ensembles de questions différents.
    const grappe_id = ulid("item-partage");
    const qa = { ...questionAvecTexte("qa", "v1"), grappe_id };
    const qb = { ...questionAvecTexte("qb", "v1"), grappe_id };
    const surItem = (cle: string, exacte: boolean) => ({ ...reponseA(cle, exacte), grappe_id });
    const premier = { questions: [qa, qb], unites: [surItem("qa", true), surItem("qb", false)] };
    const dernier = { questions: [qa, qb], unites: [surItem("qa", true)] };

    const [ligne] = tendance(premier, dernier, exactitude, OPTIONS);

    expect(ligne?.questions_communes).toBe(1);
    expect(ligne?.difference.taux_b).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    expect(ligne?.difference.difference).toBe(0);
    expect(ligne?.questions_exclues).toEqual([qb.id]);
  });
});

describe("tendance par outil et par mode, sur le seul canal API (constat n° 46)", () => {
  const cles = ["q1", "q2", "q3"];
  const questions = cles.map((c) => questionAvecTexte(c, "v1"));

  function enMode(mode: "web_activee" | "web_desactivee", exactes: readonly boolean[]) {
    return cles.map((c, i) => ({ ...reponseA(c, exactes[i] === true), mode }));
  }

  it("rend une ligne distincte par mode pour un outil interrogé dans les deux", () => {
    // web_desactivee : 3/3 exactes au premier run, 0/3 au dernier → −1.
    // web_activee : 3/3 exactes aux deux runs → 0. Mêlés, les deux modes donneraient −0,5.
    const premier = {
      questions,
      unites: [...enMode("web_desactivee", [true, true, true]), ...enMode("web_activee", [true, true, true])],
    };
    const dernier = {
      questions,
      unites: [...enMode("web_desactivee", [false, false, false]), ...enMode("web_activee", [true, true, true])],
    };

    const tendances = tendance(premier, dernier, exactitude, OPTIONS);
    const parMode = new Map(tendances.map((t) => [t.mode, t]));

    expect(tendances).toHaveLength(2);
    expect(tendances.every((t) => t.outil_id === "outil-alpha")).toBe(true);
    expect(parMode.get("web_desactivee")?.difference.difference).toBe(-1);
    expect(parMode.get("web_desactivee")?.questions_communes).toBe(3);
    expect(parMode.get("web_activee")?.difference.difference).toBe(0);
    expect(parMode.get("web_activee")?.questions_communes).toBe(3);
  });

  it("ignore les réponses du canal application, sans qu'elles changent le résultat", () => {
    // QR8 : le canal application est exploratoire. Ses réponses (sans mode, §6) sont ici toutes
    // inexactes au dernier run ; comptées, elles tireraient l'exactitude du dernier run vers 0.
    const premier = { questions, unites: enMode("web_desactivee", [true, true, false]) };
    const dernier = { questions, unites: enMode("web_desactivee", [true, false, false]) };
    const application = cles.map((c) => ({
      ...reponseA(c, false),
      canal: "application" as const,
      mode: null,
    }));
    const autreOutilApplication = application.map((u) => ({ ...u, outil_id: "outil-gamma" }));

    const sans = tendance(premier, dernier, exactitude, OPTIONS);
    const avec = tendance(
      { questions, unites: [...premier.unites, ...application] },
      { questions, unites: [...dernier.unites, ...application, ...autreOutilApplication] },
      exactitude,
      OPTIONS,
    );

    expect(avec).toEqual(sans);
    expect(avec.map((t) => [t.outil_id, t.mode])).toEqual([["outil-alpha", "web_desactivee"]]);
  });

  it("rend une ligne sans différence pour un mode présent à un seul run, jamais une valeur plausible", () => {
    // web_activee n'existe qu'au dernier run : rien à comparer. La ligne existe (le mode a été
    // interrogé), sa différence, son intervalle et son qualificatif sont absents, pas à zéro.
    const premier = { questions, unites: enMode("web_desactivee", [true, true, true]) };
    const dernier = {
      questions,
      unites: [...enMode("web_desactivee", [true, true, true]), ...enMode("web_activee", [false, false, false])],
    };

    const tendances = tendance(premier, dernier, exactitude, OPTIONS);
    const seule = tendances.find((t) => t.mode === "web_activee");

    expect(tendances).toHaveLength(2);
    expect(seule?.questions_communes).toBe(0);
    expect(seule?.difference.taux_b).toEqual({ numerateur: 0, denominateur: 0 });
    expect(seule?.difference.difference).toBeNull();
    expect(seule?.difference.intervalle).toBeNull();
    expect(seule?.difference.qualificatif).toBeNull();
  });

  it("refuse une réponse du canal API sans mode plutôt que de lui en supposer un", () => {
    // §6 : le mode est obligatoire pour le canal api. Son absence est une donnée corrompue.
    const premier = { questions, unites: [{ ...reponseA("q1", true), mode: null }] };
    const dernier = { questions, unites: enMode("web_desactivee", [true, true, true]) };

    expect(() => tendance(premier, dernier, exactitude, OPTIONS)).toThrow(/canal api sans mode/);
  });
});

describe("graine de chaque tendance (constats n° 6 et 46)", () => {
  it("dérive la graine de la clé de l'appelant suivie de l'outil puis du mode", () => {
    const cles = ["q1", "q2", "q3", "q4", "q5", "q6"];
    const questions = cles.map((c) => questionAvecTexte(c, "v1"));
    const avant = cles.map((c, i) => reponseA(c, i % 2 === 0));
    const apres = cles.map((c, i) => reponseA(c, i % 3 === 0));
    const cleAttendue = [...OPTIONS.cle, "outil-alpha", "web_desactivee"];

    const [ligne] = tendance({ questions, unites: avant }, { questions, unites: apres }, exactitude, OPTIONS);
    const attendue = differenceAppariee(apres, avant, exactitude, { ...OPTIONS, cle: cleAttendue });

    expect(ligne?.difference).toEqual(attendue);
    // L'outil fait partie de la clé : le flux diffère de celui de la seule clé de l'appelant.
    expect(reechantillonnerDifference(apres, avant, exactitude, { ...OPTIONS, cle: cleAttendue }).valeurs).not.toEqual(
      reechantillonnerDifference(apres, avant, exactitude, OPTIONS).valeurs,
    );
  });

  it("donne à deux modes du même outil deux graines distinctes", () => {
    // Mêmes réponses dans les deux modes : seules les graines peuvent séparer les deux flux.
    const cles = ["q1", "q2", "q3", "q4", "q5", "q6"];
    const questions = cles.map((c) => questionAvecTexte(c, "v1"));
    const avant = cles.map((c, i) => reponseA(c, i % 2 === 0));
    const apres = cles.map((c, i) => reponseA(c, i % 3 === 0));
    const dans = (mode: "web_activee" | "web_desactivee", unites: typeof avant) =>
      unites.map((u) => ({ ...u, mode }));

    const tendances = tendance(
      { questions, unites: [...dans("web_desactivee", avant), ...dans("web_activee", avant)] },
      { questions, unites: [...dans("web_desactivee", apres), ...dans("web_activee", apres)] },
      exactitude,
      OPTIONS,
    );
    const parMode = new Map(tendances.map((t) => [t.mode, t.difference]));

    expect(parMode.get("web_activee")?.difference).toBe(parMode.get("web_desactivee")?.difference);
    expect(parMode.get("web_activee")).toEqual(
      differenceAppariee(dans("web_activee", apres), dans("web_activee", avant), exactitude, {
        ...OPTIONS,
        cle: [...OPTIONS.cle, "outil-alpha", "web_activee"],
      }),
    );
    expect(parMode.get("web_activee")?.intervalle).not.toEqual(parMode.get("web_desactivee")?.intervalle);
  });
});

describe("couple marqué run incomplet à l'un des deux runs (conformité 2026-09-29, n° 12)", () => {
  // §8 : un couple au-delà de 20 % de manquantes est « exclu des comparaisons de ce run ». Le
  // protocole ne dit pas lequel des deux runs compte pour la tendance : un couple incomplet à l'un
  // ou à l'autre sort, et les deux drapeaux disent où (recommandation de la conformité, à écrire).
  const cles = ["q1", "q2", "q3"];
  const questions = cles.map((c) => questionAvecTexte(c, "v1"));
  const ACTIVEE = { outil_id: "outil-alpha", mode: "web_activee" } as const;
  const DESACTIVEE = { outil_id: "outil-alpha", mode: "web_desactivee" } as const;
  const dans = (mode: "web_activee" | "web_desactivee", exacte: boolean) =>
    cles.map((c) => ({ ...reponseA(c, exacte), mode }));
  const unitesPremier = [...dans("web_activee", true), ...dans("web_desactivee", true)];
  const unitesDernier = [...dans("web_activee", false), ...dans("web_desactivee", false)];

  const cas: readonly (readonly [string, PartageCouples, PartageCouples, boolean, boolean])[] = [
    ["au dernier run", { compares: [ACTIVEE, DESACTIVEE], incomplets: [] }, { compares: [DESACTIVEE], incomplets: [ACTIVEE] }, false, true],
    ["au premier run", { compares: [DESACTIVEE], incomplets: [ACTIVEE] }, { compares: [ACTIVEE, DESACTIVEE], incomplets: [] }, true, false],
  ];
  for (const [quand, avant, apres, auPremier, auDernier] of cas) {
    it(`sort de la tendance un couple incomplet ${quand}, l'autre mode restant comparé`, () => {
      const resultat = tendanceParOutilEtMode(
        { questions, unites: unitesPremier, couples: avant },
        { questions, unites: unitesDernier, couples: apres },
        exactitude,
        OPTIONS,
      );

      expect(resultat.par_outil_et_mode.map((l) => l.mode)).toEqual(["web_desactivee"]);
      expect(resultat.par_outil_et_mode[0]?.difference.difference).toBe(-1);
      expect(resultat.couples_exclus).toEqual([
        { outil_id: "outil-alpha", mode: "web_activee", incomplet_au_premier: auPremier, incomplet_au_dernier: auDernier },
      ]);
    });
  }

  it("sort un couple incomplet au dernier run même quand il n'y a obtenu aucune réponse", () => {
    // Toutes les réponses manquent au dernier run : aucune unité, mais le couple est au partage.
    const resultat = tendanceParOutilEtMode(
      { questions, unites: unitesPremier, couples: { compares: [ACTIVEE, DESACTIVEE], incomplets: [] } },
      { questions, unites: dans("web_desactivee", false), couples: { compares: [DESACTIVEE], incomplets: [ACTIVEE] } },
      exactitude,
      OPTIONS,
    );

    expect(resultat.par_outil_et_mode.map((l) => l.mode)).toEqual(["web_desactivee"]);
    expect(resultat.couples_exclus).toEqual([
      { outil_id: "outil-alpha", mode: "web_activee", incomplet_au_premier: false, incomplet_au_dernier: true },
    ]);
  });

  it("refuse une unité API d'un couple absent du partage de son run", () => {
    expect(() =>
      tendanceParOutilEtMode(
        { questions, unites: unitesPremier, couples: { compares: [DESACTIVEE], incomplets: [] } },
        { questions, unites: unitesDernier, couples: { compares: [ACTIVEE, DESACTIVEE], incomplets: [] } },
        exactitude,
        OPTIONS,
      ),
    ).toThrow(/outil-alpha\/web_activee absent du partage/);
  });
});
