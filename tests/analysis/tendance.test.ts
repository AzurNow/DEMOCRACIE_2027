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
import { exactitude } from "../../analysis/metriques.ts";
import { empreinte, idQuestion, question, ulid, unite } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 100, graine_du_run: 20261201, cle: ["test", "tendance"] };

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
        premisse_fausse: true,
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

    const [tendance] = tendanceParOutilEtMode(premier, dernier, exactitude, OPTIONS);

    expect(tendance?.outil_id).toBe("outil-alpha");
    expect(tendance?.questions_communes).toBe(1);
    expect(tendance?.difference.taux_a).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
    expect(tendance?.difference.taux_b).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    expect(tendance?.difference.difference).toBe(-1);
    // Une seule question commune, donc une seule grappe. Jusqu'à la 0.8, ce test figeait ici
    // « etablie » (constat n° 44). §8 (0.9) : « Un intervalle calculé sur une seule grappe est
    // dégénéré : la différence correspondante n'est qualifiée ni d'« établie » ni de « non
    // établie », elle est publiée avec la mention « une seule grappe ». »
    expect(tendance?.difference.intervalle?.degenere).toBe("grappe_unique");
    expect(tendance?.difference.qualificatif).toBeNull();
  });

  it("ne qualifie rien pour un outil absent de l'un des deux runs", () => {
    const commune = questionAvecTexte("q1", "v1");
    const premier = { questions: [commune], unites: [reponseA("q1", true)] };
    const dernier = {
      questions: [commune],
      unites: [{ ...reponseA("q1", false), outil_id: "outil-beta" }],
    };

    const tendances = tendanceParOutilEtMode(premier, dernier, exactitude, OPTIONS);

    expect(tendances.map((t) => t.outil_id).sort()).toEqual(["outil-alpha", "outil-beta"]);
    for (const tendance of tendances) {
      expect(tendance.mode).toBe("web_desactivee");
      expect(tendance.difference.difference).toBeNull();
      expect(tendance.difference.qualificatif).toBeNull();
    }
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

    const tendances = tendanceParOutilEtMode(premier, dernier, exactitude, OPTIONS);
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

    const sans = tendanceParOutilEtMode(premier, dernier, exactitude, OPTIONS);
    const avec = tendanceParOutilEtMode(
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

    const tendances = tendanceParOutilEtMode(premier, dernier, exactitude, OPTIONS);
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

    expect(() => tendanceParOutilEtMode(premier, dernier, exactitude, OPTIONS)).toThrow(/canal api sans mode/);
  });
});

describe("graine de chaque tendance (constats n° 6 et 46)", () => {
  it("dérive la graine de la clé de l'appelant suivie de l'outil puis du mode", () => {
    const cles = ["q1", "q2", "q3", "q4", "q5", "q6"];
    const questions = cles.map((c) => questionAvecTexte(c, "v1"));
    const avant = cles.map((c, i) => reponseA(c, i % 2 === 0));
    const apres = cles.map((c, i) => reponseA(c, i % 3 === 0));
    const cleAttendue = [...OPTIONS.cle, "outil-alpha", "web_desactivee"];

    const [tendance] = tendanceParOutilEtMode({ questions, unites: avant }, { questions, unites: apres }, exactitude, OPTIONS);
    const attendue = differenceAppariee(apres, avant, exactitude, { ...OPTIONS, cle: cleAttendue });

    expect(tendance?.difference).toEqual(attendue);
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

    const tendances = tendanceParOutilEtMode(
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
