/**
 * Lecture stricte de la sortie brute d'un modèle extracteur (prompts/extraction-1.0.0.md, « Une
 * sortie qui n'est pas un JSON conforme est rejetée en entier, jamais réparée » ; règle 7).
 * Cas limite 1 du brief : chaque défaut de forme rejette la sortie entière avec un motif nommé.
 */

import { describe, expect, it } from "vitest";
import { lireSortie } from "../../pipeline/extraction/lecture-sortie.ts";
import { propose, sortie } from "./aides.ts";

const CITATION = "Nous ouvrirons les centres de santé le dimanche.";
const VALIDE = sortie(propose(CITATION));

function motif(brut: string): string {
  const lecture = lireSortie(brut);
  if (lecture.ok) throw new Error("sortie acceptée à tort");
  return lecture.motif;
}

describe("lireSortie : sortie conforme", () => {
  it("rend les items tels que reçus, sans rien y ajouter", () => {
    const lecture = lireSortie(VALIDE);
    expect(lecture).toEqual({ ok: true, sortie: { items: [propose(CITATION)] } });
  });

  it('accepte {"items": []}', () => {
    expect(lireSortie('{"items": []}')).toEqual({ ok: true, sortie: { items: [] } });
  });

  it("accepte une quantification de la forme commun#/$defs/quantification", () => {
    const quantification = { dimensions: [{ type: "montant", valeur: 150, unite: "EUR", operateur: "exact" }] };
    const lecture = lireSortie(sortie(propose(CITATION, { quantification })));
    expect(lecture.ok).toBe(true);
  });
});

describe("lireSortie : cas limite 1, rejet de la sortie entière", () => {
  it("texte qui n'est pas du JSON ⇒ json_invalide", () => {
    expect(motif("Voici les positions extraites.")).toBe("json_invalide");
  });

  it("JSON précédé de texte ⇒ json_invalide, jamais extrait du texte", () => {
    expect(motif(`Voici la sortie : ${VALIDE}`)).toBe("json_invalide");
  });

  it("JSON suivi de texte ⇒ json_invalide", () => {
    expect(motif(`${VALIDE}\nJ'espère que cela convient.`)).toBe("json_invalide");
  });

  it("JSON dans un bloc ```json ⇒ bloc_de_code, jamais déballé", () => {
    expect(motif("```json\n" + VALIDE + "\n```")).toBe("bloc_de_code");
  });

  it("clé dupliquée dans un item ⇒ cle_dupliquee (JSON.parse garderait la dernière en silence)", () => {
    const brut = VALIDE.replace('"position":"pour"', '"position":"pour","position":"contre"');
    expect(brut).not.toBe(VALIDE);
    expect(motif(brut)).toBe("cle_dupliquee");
  });

  it("clé items dupliquée à la racine ⇒ cle_dupliquee", () => {
    expect(motif('{"items": [], "items": []}')).toBe("cle_dupliquee");
  });

  it("champ en trop dans un item ⇒ non_conforme", () => {
    expect(motif(sortie(propose(CITATION, { confiance: 0.9 })))).toBe("non_conforme");
  });

  it("champ page donné par le modèle ⇒ non_conforme (D35 : le code calcule la page)", () => {
    expect(motif(sortie(propose(CITATION, { page: 2 })))).toBe("non_conforme");
  });

  it("champ en trop à la racine ⇒ non_conforme", () => {
    expect(motif(JSON.stringify({ items: [], commentaire: "rien" }))).toBe("non_conforme");
  });

  it("type A ⇒ non_conforme", () => {
    expect(motif(sortie(propose(CITATION, { type: "A" })))).toBe("non_conforme");
  });

  it("type F ⇒ non_conforme", () => {
    expect(motif(sortie(propose(CITATION, { type: "F" })))).toBe("non_conforme");
  });

  it("position sans_objet ⇒ non_conforme", () => {
    expect(motif(sortie(propose(CITATION, { position: "sans_objet" })))).toBe("non_conforme");
  });

  it("thème hors des dix codes ⇒ non_conforme", () => {
    const mesure_proposee = { libelle: "Rénover les musées de province", theme: "culture" };
    expect(motif(sortie(propose(CITATION, { mesure_proposee })))).toBe("non_conforme");
  });

  it("citation vide ⇒ non_conforme (item#/$defs/etat_positionnel exige au moins un caractère)", () => {
    expect(motif(sortie(propose("")))).toBe("non_conforme");
  });

  it("racine qui est un tableau ⇒ non_conforme", () => {
    expect(motif(JSON.stringify([propose(CITATION)]))).toBe("non_conforme");
  });

  it("un seul item fautif parmi plusieurs rejette la sortie entière", () => {
    const lecture = lireSortie(sortie(propose(CITATION), propose(CITATION, { position: "neutre" })));
    expect(lecture.ok).toBe(false);
  });

  it("le détail nomme ce qui a échoué", () => {
    const lecture = lireSortie(sortie(propose(CITATION, { type: "A" })));
    if (lecture.ok) throw new Error("sortie acceptée à tort");
    expect(lecture.detail).toContain("/items/0/type");
  });
});
