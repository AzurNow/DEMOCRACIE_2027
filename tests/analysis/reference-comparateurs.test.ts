/**
 * Conformité n° 11 : les items P de référence des comparateurs, lus dans le run tels que le gel les a
 * figés (`perimetre.candidats[].items_p_au_gel`). Décision de l'auteur du 2026-10-02, texte à écrire
 * au §8 en 0.15 : ce sont les items P comptés au gel pour les candidats interrogés, la base du tirage
 * et du seuil de couverture. Le JSON Schema ne sait pas lier `items_p_verifies` à la longueur de la
 * liste ni exiger qu'elle soit triée : ce contrôle-ci le fait, à la frontière de l'analyse.
 */

import { describe, expect, it } from "vitest";
import { ItemsPDeReferenceIncoherents, itemsPDeReference } from "../../analysis/reference-comparateurs.ts";
import type { Run } from "../../analysis/types.ts";
import { candidat, itemsPAuGel, run, ulid } from "./fabriques.ts";

function fautes(appel: () => unknown): readonly string[] {
  try {
    appel();
  } catch (erreur) {
    if (erreur instanceof ItemsPDeReferenceIncoherents) return erreur.fautes;
    throw erreur;
  }
  throw new Error("aucune erreur levée");
}

function runDe(...candidats: Parameters<typeof candidat>[0][]): Run {
  const base = run();
  return { ...base, perimetre: { ...base.perimetre, candidats: candidats.map((c) => candidat(c)) } };
}

describe("itemsPDeReference : la réunion des listes figées des candidats interrogés", () => {
  it("rend la réunion des items P au gel des seuls candidats interrogés", () => {
    const a = itemsPAuGel("a", 12);
    const b = itemsPAuGel("b", 3);
    const retire = itemsPAuGel("retire", 2);
    const reference = itemsPDeReference(
      runDe(
        { candidat_id: "candidat-a", items_p_verifies: 12, items_p_au_gel: a },
        { candidat_id: "candidat-b", items_p_verifies: 3, items_p_au_gel: b, sous_seuil: true },
        {
          candidat_id: "candidat-retire",
          statut_au_gel: "retire",
          interroge: false,
          items_p_verifies: 2,
          items_p_au_gel: retire,
          sous_seuil: true,
        },
      ),
    );
    expect([...reference].sort()).toEqual([...a, ...b].sort());
  });

  it("garde un candidat sous le seuil de couverture : il est interrogé, ses items P sont lus", () => {
    const sous = itemsPAuGel("sous", 9);
    const reference = itemsPDeReference(runDe({ items_p_verifies: 9, items_p_au_gel: sous, sous_seuil: true }));
    expect(reference.size).toBe(9);
  });

  it("rend une liste vide quand aucun candidat interrogé n'a d'item P au gel", () => {
    expect(itemsPDeReference(runDe({ items_p_verifies: 0, items_p_au_gel: [], sous_seuil: true })).size).toBe(0);
  });

  it("lève quand items_p_verifies ne vaut pas la longueur de la liste figée", () => {
    const liste = itemsPAuGel("ecart", 11);
    const constats = fautes(() => itemsPDeReference(runDe({ items_p_verifies: 12, items_p_au_gel: liste })));
    expect(constats).toHaveLength(1);
    expect(constats[0]).toMatch(/candidat-a.*12.*11/);
  });

  it("lève aussi sur un candidat non interrogé dont le compte est incohérent : le run entier est faux", () => {
    const constats = fautes(() =>
      itemsPDeReference(
        runDe(
          { items_p_verifies: 1, items_p_au_gel: [ulid("seul")], sous_seuil: true },
          {
            candidat_id: "candidat-retire",
            statut_au_gel: "retire",
            interroge: false,
            items_p_verifies: 4,
            items_p_au_gel: [],
            sous_seuil: true,
          },
        ),
      ),
    );
    expect(constats).toHaveLength(1);
    expect(constats[0]).toMatch(/candidat-retire/);
  });

  it("lève sur une liste non triée ou portant un doublon", () => {
    const [premier, second] = itemsPAuGel("ordre", 2);
    const desordre = [second, premier] as string[];
    const doublon = [premier, premier] as string[];
    expect(fautes(() => itemsPDeReference(runDe({ items_p_verifies: 2, items_p_au_gel: desordre, sous_seuil: true }))))
      .toHaveLength(1);
    expect(fautes(() => itemsPDeReference(runDe({ items_p_verifies: 2, items_p_au_gel: doublon, sous_seuil: true }))))
      .toHaveLength(1);
  });

  it("lève sur un même item listé pour deux candidats interrogés", () => {
    const partage = [ulid("partage")];
    const constats = fautes(() =>
      itemsPDeReference(
        runDe(
          { candidat_id: "candidat-a", items_p_verifies: 1, items_p_au_gel: partage, sous_seuil: true },
          { candidat_id: "candidat-b", items_p_verifies: 1, items_p_au_gel: partage, sous_seuil: true },
        ),
      ),
    );
    expect(constats).toEqual([expect.stringContaining(ulid("partage"))]);
  });

  it("liste toutes les fautes du run, pas seulement la première", () => {
    const constats = fautes(() =>
      itemsPDeReference(
        runDe(
          { candidat_id: "candidat-a", items_p_verifies: 3, items_p_au_gel: [], sous_seuil: true },
          { candidat_id: "candidat-b", items_p_verifies: 5, items_p_au_gel: [], sous_seuil: true },
        ),
      ),
    );
    expect(constats).toHaveLength(2);
  });
});
