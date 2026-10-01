/**
 * Table de normalisation du test verbatim (§4.11, §4.82 ; constat n° 4 de la passe de conformité
 * du 2026-09-29). Le protocole écrit que la table exacte est publiée avec le code : ces tests la
 * figent. Changer un seul caractère de la table, c'est changer quelles citations passent le test
 * verbatim, donc quels items existent : la version doit alors changer, et ce fichier avec elle.
 */

import { describe, expect, it } from "vitest";
import {
  VERSION_NORMALISATION,
  normaliser,
  projeter,
} from "../validation/domaine/normalisation.ts";
import { testerVerbatim } from "../validation/domaine/verbatim.ts";

/** La table normalisation-v1, écrite en points de code pour qu'aucun éditeur ne la change. */
const TABLE_V1: ReadonlyMap<number, string> = new Map([
  [0x00ab, '"'], // « guillemet français ouvrant
  [0x00bb, '"'], // » guillemet français fermant
  [0x201c, '"'], // “ guillemet anglais ouvrant
  [0x201d, '"'], // ” guillemet anglais fermant
  [0x201e, '"'], // „ guillemet bas
  [0x2033, '"'], // ″ double prime
  [0x2018, "'"], // ‘ apostrophe ouvrante
  [0x2019, "'"], // ’ apostrophe typographique
  [0x201a, "'"], // ‚ apostrophe basse
  [0x2032, "'"], // ′ prime
  [0x00b4, "'"], // ´ accent aigu isolé
  [0x2010, "-"], // ‐ trait d'union
  [0x2011, "-"], // ‑ trait d'union insécable
  [0x2012, "-"], // ‒ tiret numérique
  [0x2013, "-"], // – tiret demi-cadratin
  [0x2014, "-"], // — tiret cadratin
  [0x2212, "-"], // − signe moins
]);

/** Les espaces que normalisation-v1 réduit : la classe \s de JavaScript, énumérée. */
const ESPACES_V1: ReadonlySet<number> = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
]);

const car = (pointDeCode: number): string => String.fromCodePoint(pointDeCode);

/** Ce que normalisation-v1 doit rendre d'un caractère isolé. */
function attendu(pointDeCode: number): string {
  const remplacement = TABLE_V1.get(pointDeCode);
  if (remplacement !== undefined) return remplacement;
  // Une espace isolée devient une espace, puis le rognage la retire.
  if (ESPACES_V1.has(pointDeCode)) return "";
  return car(pointDeCode);
}

/** Tous les points de code du plan de base, sans les demi-codets de substitution. */
function* planDeBase(): Generator<number> {
  for (let pointDeCode = 0; pointDeCode <= 0xffff; pointDeCode += 1) {
    if (pointDeCode < 0xd800 || pointDeCode > 0xdfff) yield pointDeCode;
  }
}

describe("table normalisation-v1", () => {
  it("la table de normalisation-v1 est exactement celle-ci", () => {
    // Lier la table à sa version : si ce test doit changer, VERSION_NORMALISATION aussi.
    expect(VERSION_NORMALISATION).toBe("normalisation-v1");
    const ecarts: string[] = [];
    for (const pointDeCode of planDeBase()) {
      const obtenu = normaliser(car(pointDeCode));
      if (obtenu !== attendu(pointDeCode)) {
        ecarts.push(`U+${pointDeCode.toString(16).toUpperCase().padStart(4, "0")} → ${JSON.stringify(obtenu)}`);
      }
    }
    expect(ecarts).toEqual([]);
  });

  it("ramène les six tirets typographiques à « - »", () => {
    expect(normaliser("a‐b‑c‒d–e—f−g")).toBe("a-b-c-d-e-f-g");
  });

  it("ramène primes et accent aigu isolé à leur forme ASCII", () => {
    expect(normaliser("5′ et 12″, l´impôt")).toBe("5' et 12\", l'impôt");
  });

  it("laisse le trait d'union ASCII et l'accent porté par une lettre inchangés", () => {
    expect(normaliser("vingt-et-un, été")).toBe("vingt-et-un, été");
  });

  it("retire les espaces de début et de fin de la citation comme de la source", () => {
    expect(normaliser("  \n la TVA à 5,5 %\t \n")).toBe("la TVA à 5,5 %");
    const projection = projeter("\n  la TVA ");
    expect(projection.texte).toBe("la TVA");
    // Le rognage garde la position d'origine du premier caractère conservé.
    expect(projection.indices[0]).toBe(3);
    expect(projection.indices).toHaveLength(projection.texte.length);
  });

  it("une citation entourée d'espaces passe le test verbatim sur une source tirée d'un PDF", () => {
    const source = "Programme – page 3\nLe smic sera porté à 1 600 € net.";
    // Sans rognage, l'espace de tête de la citation la rendrait introuvable.
    const resultat = testerVerbatim("  Programme - page 3 ", source);
    expect(resultat.passe).toBe(true);
    expect(resultat.offset_debut).toBe(0);
    expect(resultat.offset_fin).toBe(18);
  });

  it("une citation dont le tiret diffère de celui de la source passe, une lettre en plus non", () => {
    const source = "La retraite à 62‑64 ans.";
    expect(testerVerbatim("62-64 ans", source).passe).toBe(true);
    expect(testerVerbatim("62-654 ans", source).passe).toBe(false);
  });
});
