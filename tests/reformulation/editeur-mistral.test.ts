/**
 * Adaptateur Mistral : la requête envoyée (adresse, authentification, corps réduit aux réglages de
 * la configuration) et la lecture de `choices[0].message.content`, seule source du texte du modèle.
 */

import { describe, expect, it } from "vitest";
import { adaptateurMistral, ENDPOINT_MISTRAL, texteDuChat } from "../../pipeline/reformulation/editeur-mistral.ts";
import { CONFIGURATION } from "./aides.ts";

describe("requête Mistral", () => {
  const requete = adaptateurMistral(CONFIGURATION, "cle-factice").construireRequete("Le prompt rendu.");

  it("POST sur l'API de chat, clé dans Authorization", () => {
    expect(requete.endpoint).toBe(ENDPOINT_MISTRAL);
    expect(requete.entetes["authorization"]).toBe("Bearer cle-factice");
  });

  it("corps : le prompt seul en message utilisateur, et exactement les réglages de la configuration", () => {
    expect(requete.corps).toEqual({
      model: CONFIGURATION.modele,
      messages: [{ role: "user", content: "Le prompt rendu." }],
      temperature: CONFIGURATION.temperature,
      max_tokens: CONFIGURATION.max_tokens,
      random_seed: CONFIGURATION.random_seed,
    });
  });

  it("la clé n'est jamais dans le corps", () => {
    expect(JSON.stringify(requete.corps)).not.toContain("cle-factice");
  });

  it("clé vide ⇒ refus de construire l'adaptateur", () => {
    expect(() => adaptateurMistral(CONFIGURATION, "")).toThrow(/vide/u);
  });

  it("production.modele : l'identifiant de la configuration, tel quel", () => {
    expect(adaptateurMistral(CONFIGURATION, "x").modele).toBe(CONFIGURATION.modele);
  });
});

describe("cas limite 3 : lecture de l'enveloppe", () => {
  const objet = (brut: Record<string, unknown>) => texteDuChat({ forme: "objet", brut });

  it("choices[0].message.content textuel ⇒ lu tel quel, espaces compris", () => {
    expect(objet({ choices: [{ message: { content: "  {\"a\": 1}\n" } }] })).toEqual({ lisible: true, texte: "  {\"a\": 1}\n" });
  });

  it("sans choices ⇒ illisible, la raison le dit", () => {
    expect(objet({ object: "chat.completion" })).toEqual({ lisible: false, raison: "corps.choices absent." });
  });

  it("choices vide ⇒ illisible", () => {
    expect(objet({ choices: [] })).toEqual({ lisible: false, raison: "corps.choices[0] absent." });
  });

  it("content null ⇒ illisible", () => {
    expect(objet({ choices: [{ message: { content: null } }] })).toEqual({
      lisible: false,
      raison: "corps.choices[0].message.content n'est pas un texte (null).",
    });
  });

  it("content en liste de morceaux ⇒ illisible, jamais recomposé", () => {
    const lecture = objet({ choices: [{ message: { content: [{ type: "text", text: "x" }] } }] });
    expect(lecture.lisible).toBe(false);
  });

  it("corps texte (non JSON) ⇒ illisible", () => {
    expect(texteDuChat({ forme: "texte", brut_texte: "<html>" }).lisible).toBe(false);
  });
});
