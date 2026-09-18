/**
 * Tendance (§8, QR7/H5) : « comparaison du premier et du dernier run par outil, sur les
 * questions communes aux deux runs, avec intervalle par bootstrap ».
 *
 * « Question commune » se lit comme le schéma l'impose : même identifiant ET même empreinte de
 * texte. Une correction d'item qui change le libellé casse la reprise explicitement, plutôt que
 * de faire passer notre propre correction pour une amélioration de l'outil.
 */

import { describe, expect, it } from "vitest";
import { questionsCommunes, tendanceParOutil } from "../../analysis/tendance.ts";
import { exactitude } from "../../analysis/metriques.ts";
import { empreinte, idQuestion, question, ulid, unite } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 100, graine: "graine-tendance" };

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

    const [tendance] = tendanceParOutil(premier, dernier, exactitude, OPTIONS);

    expect(tendance?.outil_id).toBe("outil-alpha");
    expect(tendance?.questions_communes).toBe(1);
    expect(tendance?.difference.taux_a).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
    expect(tendance?.difference.taux_b).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    expect(tendance?.difference.difference).toBe(-1);
    expect(tendance?.difference.qualificatif).toBe("etablie");
  });

  it("ne qualifie rien pour un outil absent de l'un des deux runs", () => {
    const commune = questionAvecTexte("q1", "v1");
    const premier = { questions: [commune], unites: [reponseA("q1", true)] };
    const dernier = {
      questions: [commune],
      unites: [{ ...reponseA("q1", false), outil_id: "outil-beta" }],
    };

    const tendances = tendanceParOutil(premier, dernier, exactitude, OPTIONS);

    expect(tendances.map((t) => t.outil_id).sort()).toEqual(["outil-alpha", "outil-beta"]);
    for (const tendance of tendances) {
      expect(tendance.difference.difference).toBeNull();
      expect(tendance.difference.qualificatif).toBeNull();
    }
  });
});
