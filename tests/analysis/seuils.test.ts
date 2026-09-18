/**
 * Seuils de non-publication du §8 — les deux règles qui retirent un chiffre du rapport.
 *
 * « Aucune statistique par candidat sous 10 items P vérifiés. Aucune statistique par outil si
 * plus de 20 % des réponses d'un run sont manquantes pour cet outil. »
 */

import { describe, expect, it } from "vitest";
import {
  candidatsComparables,
  outilsComparables,
  partReponsesManquantes,
  runIncomplet,
} from "../../analysis/seuils.ts";
import { candidat, reponse, run, ulid } from "./fabriques.ts";

function reponses(obtenues: number, manquantes: number, outil_id = "outil-alpha") {
  const liste = [];
  for (let i = 0; i < obtenues; i += 1) {
    liste.push(reponse({ id: ulid(`${outil_id}-ok-${i}`), outil_id }));
  }
  for (let i = 0; i < manquantes; i += 1) {
    liste.push(
      reponse({ id: ulid(`${outil_id}-manq-${i}`), outil_id, statut_reponse: "manquante", normalise: undefined }),
    );
  }
  return liste;
}

describe("seuil de couverture par candidat", () => {
  it("écarte des comparaisons inter-candidats un candidat sous le seuil, et le rapporte à part", () => {
    // §4 et §8 : le seuil est lu dans run.perimetre.candidats[].sous_seuil, jamais recalculé ici.
    const perimetre = run({
      perimetre: {
        candidats: [
          candidat({ candidat_id: "candidat-a", items_p_verifies: 20, sous_seuil: false }),
          candidat({ candidat_id: "candidat-b", items_p_verifies: 8, sous_seuil: true }),
          candidat({ candidat_id: "candidat-c", items_p_verifies: 10, sous_seuil: false }),
        ],
        outils: [],
      },
    });

    const partage = candidatsComparables(perimetre);

    expect(partage.compares).toEqual(["candidat-a", "candidat-c"]);
    expect(partage.rapportes_a_part).toEqual(["candidat-b"]);
  });
});

describe("seuil de réponses manquantes par outil", () => {
  it("laisse un outil à 20 % exactement dans les comparaisons, et exclut celui qui dépasse", () => {
    // §8 dit « plus de 20 % ». Comparaison entière (5·manquantes > total) : 2/10 ne déclenche
    // pas, 3/10 déclenche. Le flottant 0,2 ne décide rien.
    const pile = partReponsesManquantes(reponses(8, 2), "outil-alpha");
    expect(pile).toEqual({ numerateur: 2, denominateur: 10, valeur: 0.2 });
    expect(runIncomplet(pile)).toBe(false);

    const dessus = partReponsesManquantes(reponses(7, 3), "outil-alpha");
    expect(dessus).toEqual({ numerateur: 3, denominateur: 10, valeur: 0.3 });
    expect(runIncomplet(dessus)).toBe(true);

    // Un cinquième exact, sur un effectif où le flottant tombe juste.
    expect(runIncomplet(partReponsesManquantes(reponses(4, 1), "outil-alpha"))).toBe(false);
  });

  it("ne qualifie pas un outil sans aucune réponse plutôt que de le déclarer complet", () => {
    const aucune = partReponsesManquantes([], "outil-absent");

    expect(aucune.denominateur).toBe(0);
    expect(() => runIncomplet(aucune)).toThrow(/aucune réponse/);
  });

  it("sépare les outils comparables des outils marqués run incomplet", () => {
    const jeu = [...reponses(8, 2, "outil-alpha"), ...reponses(7, 3, "outil-beta")];

    const partage = outilsComparables(jeu);

    expect(partage.compares).toEqual(["outil-alpha"]);
    expect(partage.incomplets).toEqual(["outil-beta"]);
  });

  it("ne compte que les réponses du run dans la part de manquantes", () => {
    const jeu = [
      ...reponses(1, 1),
      reponse({ id: ulid("cf"), statut_reponse: "manquante", normalise: undefined, contexte: "contrefactuel_candidat" }),
    ];

    expect(partReponsesManquantes(jeu, "outil-alpha")).toEqual({
      numerateur: 1,
      denominateur: 2,
      valeur: 0.5,
    });
  });
});
