/**
 * Cas limite 8 : `config/reformulation.json` est rempli par l'auteur ; une valeur nulle, une clé
 * absente, inconnue ou répétée refuse la commande avant tout appel, en nommant la clé.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigurationRefusee, lireConfiguration, validerConfiguration } from "../../pipeline/reformulation/configuration.ts";

const COMPLETE = { modele: "modele-de-test-2026-01", temperature: 0.3, max_tokens: 800, random_seed: 7 };

function motifs(texte: string): readonly string[] {
  try {
    validerConfiguration(texte, "essai");
  } catch (erreur) {
    if (erreur instanceof ConfigurationRefusee) return erreur.motifs;
    throw erreur;
  }
  throw new Error("La configuration a été acceptée alors qu'un refus était attendu.");
}

describe("cas limite 8 : configuration de la reformulation", () => {
  it("complète, avec un commentaire ⇒ acceptée telle quelle", () => {
    expect(validerConfiguration(JSON.stringify({ $commentaire: "x", ...COMPLETE }), "essai")).toEqual(COMPLETE);
  });

  it("le fichier livré, à remplir par l'auteur, est refusé et nomme ses quatre clés nulles", () => {
    const chemin = resolve(import.meta.dirname, "../../config/reformulation.json");
    expect(() => lireConfiguration(chemin)).toThrow(ConfigurationRefusee);
    const refus = motifs(readFileSync(chemin, "utf8"));
    expect(refus.map((motif) => motif.split(" : ")[0])).toEqual(["modele", "temperature", "max_tokens", "random_seed"]);
    expect(refus.every((motif) => motif.includes(": null"))).toBe(true);
  });

  it("une valeur null ⇒ refus qui nomme la clé", () => {
    const refus = motifs(JSON.stringify({ ...COMPLETE, temperature: null }));
    expect(refus).toHaveLength(1);
    expect(refus[0]).toMatch(/^temperature : null/u);
  });

  it("une clé absente ⇒ refus qui nomme la clé", () => {
    const { random_seed: _retiree, ...reste } = COMPLETE;
    expect(motifs(JSON.stringify(reste))).toEqual([expect.stringMatching(/^random_seed : absente/u)]);
  });

  it("une clé inconnue ⇒ refus qui nomme la clé, jamais ignorée", () => {
    expect(motifs(JSON.stringify({ ...COMPLETE, temperatur: 0.3 }))).toEqual([expect.stringMatching(/^temperatur : clé inconnue/u)]);
  });

  it("une clé répétée ⇒ refus qui la nomme", () => {
    const texte = '{"modele": "a", "modele": "b", "temperature": 0, "max_tokens": 1, "random_seed": 0}';
    expect(motifs(texte)).toEqual(["modele : clé répétée"]);
  });

  it("des valeurs de mauvaise forme ⇒ un refus par clé", () => {
    const refus = motifs(JSON.stringify({ modele: " ", temperature: -1, max_tokens: 1.5, random_seed: "7" }));
    expect(refus.map((motif) => motif.split(" : ")[0])).toEqual(["modele", "temperature", "max_tokens", "random_seed"]);
  });

  it("un commentaire qui n'est pas un texte ⇒ refus", () => {
    expect(motifs(JSON.stringify({ $commentaire: 3, ...COMPLETE }))).toEqual(["$commentaire : un texte est attendu"]);
  });

  it("JSON illisible ou tableau ⇒ refus nommé", () => {
    expect(motifs("{")).toEqual([expect.stringMatching(/^JSON illisible/u)]);
    expect(motifs("[]")).toEqual(["un objet JSON est attendu"]);
  });
});
