/**
 * `JSON.parse` garde silencieusement la dernière valeur d'une clé dupliquée : une sortie
 * `{"familier": A, "familier": B}` serait lue comme B sans que rien ne le dise. La détection est
 * écrite à la main (aucune dépendance) et compare les clés décodées, pas leur écriture.
 */

import { describe, expect, it } from "vitest";
import { premiereCleDupliquee } from "../../pipeline/reformulation/cles-dupliquees.ts";

describe("détection des clés dupliquées dans un texte JSON valide", () => {
  it("aucun doublon ⇒ null", () => {
    expect(premiereCleDupliquee('{"familier": {"texte": "a"}, "oriente": {"texte": "b"}}')).toBeNull();
  });

  it("doublon à la racine ⇒ la clé", () => {
    expect(premiereCleDupliquee('{"familier": {"texte": "a"}, "familier": {"texte": "b"}}')).toBe("familier");
  });

  it("doublon dans un objet imbriqué ⇒ la clé", () => {
    expect(premiereCleDupliquee('{"oriente": {"texte": "a", "texte": "b"}}')).toBe("texte");
  });

  it("même clé dans deux objets frères : pas un doublon", () => {
    expect(premiereCleDupliquee('{"familier": {"texte": "a"}, "oriente": {"texte": "b"}}')).toBeNull();
  });

  it("même clé dans deux objets d'un tableau : pas un doublon", () => {
    expect(premiereCleDupliquee('[{"a": 1}, {"a": 2}]')).toBeNull();
  });

  it("doublon dans un objet d'un tableau ⇒ la clé", () => {
    expect(premiereCleDupliquee('{"l": [1, {"a": 1, "a": 2}]}')).toBe("a");
  });

  it("clé écrite avec un échappement unicode : comparée décodée", () => {
    expect(premiereCleDupliquee('{"a": 1, "\\u0061": 2}')).toBe("a");
  });

  it("une valeur égale à une clé n'est pas une clé", () => {
    expect(premiereCleDupliquee('{"a": "a", "b": ["a", "a"]}')).toBeNull();
  });

  it("guillemets et accolades échappés dans une chaîne ne trompent pas la lecture", () => {
    expect(premiereCleDupliquee('{"a": "x\\"}, \\"a\\": {", "b": 1}')).toBeNull();
  });

  it("doublon après un objet imbriqué refermé, au niveau parent ⇒ la clé", () => {
    expect(premiereCleDupliquee('{"a": {"b": 1}, "c": 2, "a": 3}')).toBe("a");
  });

  it("scalaires et objets vides", () => {
    expect(premiereCleDupliquee("{}")).toBeNull();
    expect(premiereCleDupliquee('"texte"')).toBeNull();
    expect(premiereCleDupliquee("12")).toBeNull();
  });
});
