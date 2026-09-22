/**
 * Le filtre du §8 : seul `contexte == "run"` entre dans une métrique.
 *
 * C'est « la seule barrière » entre les réponses permutées du test contrefactuel (§7) et un
 * chiffre publié (schema/README.md). Les tests portent donc sur ce qui NE passe pas.
 */

import { describe, expect, it } from "vitest";
import { assembler, estDuRun, filtrerContexteRun } from "../../analysis/filtre.ts";
import { exactitude, tauxNonReponse } from "../../analysis/metriques.ts";
import { partReponsesManquantes } from "../../analysis/seuils.ts";
import { entreeTirage, idQuestion, item, question, reponse, run, ulid, verdict } from "./fabriques.ts";

/** Jeu commun : une question, un item P, et ce que l'appelant veut y mettre. */
function entrees(reponses: ReturnType<typeof reponse>[], verdicts: ReturnType<typeof verdict>[]) {
  return {
    run: run(),
    entrees_tirage: [entreeTirage()],
    questions: [question()],
    items: [item()],
    reponses,
    verdicts,
  };
}

describe("filtre de contexte", () => {
  it("ne laisse passer que le contexte run", () => {
    expect(estDuRun({ contexte: "run" })).toBe(true);
    expect(estDuRun({ contexte: "contrefactuel_candidat" })).toBe(false);
    expect(estDuRun({ contexte: "pilote" })).toBe(false);
    expect(estDuRun({ contexte: "jeu_or" })).toBe(false);
    expect(estDuRun({ contexte: "contrefactuel_outil" })).toBe(false);
    expect(filtrerContexteRun([{ contexte: "run" }, { contexte: "jeu_or" }])).toHaveLength(1);
  });

  it("une réponse contrefactuelle n'entre dans aucune métrique, même notée inexacte", () => {
    // Une réponse du run, exacte ; une réponse permutée (§7), inexacte.
    // Exactitude attendue : 1/1 = 1. Si le contrefactuel passait, elle vaudrait 1/2.
    const reponses = [
      reponse({ id: ulid("r-run") }),
      reponse({ id: ulid("r-cf"), contexte: "contrefactuel_candidat" }),
    ];
    const verdicts = [
      verdict({ id: ulid("v-run"), objet_note: { type: "reponse", id: ulid("r-run") } }),
      verdict({
        id: ulid("v-cf"),
        contexte: "contrefactuel_candidat",
        objet_note: { type: "reponse", id: ulid("r-cf") },
        categorie_retenue: "inexacte",
        drapeaux_retenus: ["fabrication"],
      }),
    ];

    const unites = assembler(entrees(reponses, verdicts));

    expect(unites).toHaveLength(1);
    expect(unites[0]?.reponse_id).toBe(ulid("r-run"));
    expect(exactitude(unites)).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
  });

  it("un verdict du run pointant une réponse hors run est une incohérence, pas un silence", () => {
    const reponses = [reponse({ id: ulid("r-cf"), contexte: "contrefactuel_candidat" })];
    const verdicts = [verdict({ objet_note: { type: "reponse", id: ulid("r-cf") } })];

    expect(() => assembler(entrees(reponses, verdicts))).toThrow(/contexte/);
  });

  it("une réponse manquante n'entre ni dans l'exactitude ni dans la non-réponse, mais compte dans la part de manquantes", () => {
    // Deux réponses obtenues (une exacte, une non-réponse) et une manquante, sans verdict.
    // Exactitude : 1/1. Taux de non-réponse : 1/2 (dénominateur = réponses obtenues).
    // Part de manquantes de l'outil : 1/3.
    const manquante = reponse({ id: ulid("r-manq"), statut_reponse: "manquante", normalise: undefined });
    const reponses = [
      reponse({ id: ulid("r-ok") }),
      reponse({ id: ulid("r-nr") }),
      manquante,
    ];
    const verdicts = [
      verdict({ id: ulid("v-ok"), objet_note: { type: "reponse", id: ulid("r-ok") } }),
      verdict({
        id: ulid("v-nr"),
        objet_note: { type: "reponse", id: ulid("r-nr") },
        categorie_retenue: "non_reponse",
      }),
    ];

    const unites = assembler(entrees(reponses, verdicts));

    expect(unites).toHaveLength(2);
    expect(exactitude(unites)).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    expect(tauxNonReponse(unites)).toEqual({ numerateur: 1, denominateur: 2, valeur: 0.5 });
    expect(partReponsesManquantes(reponses, "outil-alpha")).toEqual({
      numerateur: 1,
      denominateur: 3,
      valeur: 1 / 3,
    });

    // Une note portée sur une réponse manquante n'est pas une donnée : §6 la compte comme
    // manquante « et jamais comme une erreur ». La contradiction remonte.
    const verdictSurManquante = verdict({ objet_note: { type: "reponse", id: ulid("r-manq") } });
    expect(() => assembler(entrees(reponses, [verdictSurManquante]))).toThrow(/manquante/);
  });

  it("une réponse tronquée est toujours assemblée, marquée tronquée, sans aucun paramètre", () => {
    // §8 0.3 : une réponse tronquée « est notée sur ce qu'elle contient et entre dans les
    // métriques primaires ». Son exclusion n'existe que comme recalcul de robustesse (d), qui lit
    // `tronquee` sur l'unité : le drapeau doit donc y être, fidèle à `normalise.troncature`.
    const reponses = [
      reponse({ id: ulid("r-entiere") }),
      reponse({ id: ulid("r-tronquee"), normalise: { texte: "coupé", liens: [], troncature: true } }),
    ];
    const verdicts = [
      verdict({ id: ulid("v-entiere"), objet_note: { type: "reponse", id: ulid("r-entiere") } }),
      verdict({ id: ulid("v-tronquee"), objet_note: { type: "reponse", id: ulid("r-tronquee") } }),
    ];

    const unites = assembler(entrees(reponses, verdicts));

    expect(unites.map((u) => [u.reponse_id, u.tronquee])).toEqual([
      [ulid("r-entiere"), false],
      [ulid("r-tronquee"), true],
    ]);
    expect(exactitude(unites)).toEqual({ numerateur: 2, denominateur: 2, valeur: 1 });
  });

  it("une réponse, une question, un item ou une entrée de tirage introuvable lève", () => {
    const orphelin = verdict({ objet_note: { type: "reponse", id: ulid("inexistante") } });
    expect(() => assembler(entrees([], [orphelin]))).toThrow(/réponse/);

    const reponses = [reponse({ question_id: idQuestion("autre") })];
    const verdicts = [verdict({ objet_note: { type: "reponse", id: ulid("reponse") } })];
    expect(() => assembler(entrees(reponses, verdicts))).toThrow(/question/);
  });

  it("reporte le thème, le gabarit, le registre et le type d'item principal sur l'unité", () => {
    const reponses = [reponse({ id: ulid("r"), formulation_id: ulid("formulation-orientee") })];
    const verdicts = [verdict({ objet_note: { type: "reponse", id: ulid("r") } })];
    const jeu = {
      ...entrees(reponses, verdicts),
      items: [item({ type: "O" })],
      entrees_tirage: [entreeTirage({ theme: "immigration" })],
    };

    const [unite] = assembler(jeu);

    expect(unite?.theme).toBe("immigration");
    expect(unite?.gabarit).toBe("Q-DIR");
    expect(unite?.registre).toBe("oriente");
    expect(unite?.premisse_fausse).toBe(true);
    expect(unite?.type_item_principal).toBe("O");
    expect(unite?.candidat_id).toBe("candidat-a");
    expect(unite?.grappe_id).toBe(ulid("item"));
  });

  it("laisse absent ce qui est absent : thème non tiré, candidat d'une Q-ATT", () => {
    const reponses = [reponse({ id: ulid("r") })];
    const verdicts = [verdict({ objet_note: { type: "reponse", id: ulid("r") } })];
    const jeu = {
      ...entrees(reponses, verdicts),
      questions: [question({ gabarit: "Q-ATT", candidat_id: undefined })],
      entrees_tirage: [entreeTirage({ gabarit: "Q-ATT", candidat_id: undefined, theme: undefined })],
    };

    const [unite] = assembler(jeu);

    expect(unite?.theme).toBeNull();
    expect(unite?.candidat_id).toBeNull();
  });
});
