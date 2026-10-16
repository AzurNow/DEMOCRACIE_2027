/**
 * Rendu du prompt d'extraction, lu dans `prompts/extraction-1.0.0.md` (règle 6). Cas limite 8 du
 * brief de la PR 2 : quatre variables remplacées en un seul passage, le texte canonique inséré
 * entier et non modifié, toute autre accolade laissée telle quelle.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chargerPromptExtraction,
  NOMS_VARIABLES_EXTRACTION,
  rendrePromptExtraction,
  VariableAbsenteDuPromptExtraction,
  VariablePromptExtractionVide,
  VERSION_PROMPT_EXTRACTION,
  type VariablesExtraction,
} from "../../pipeline/extraction/prompt.ts";

const TEXTE_PROMPT = chargerPromptExtraction();
const FICHIER = readFileSync(new URL("../../prompts/extraction-1.0.0.md", import.meta.url), "utf8");

const VARIABLES: VariablesExtraction = {
  candidat_id: "candidat-a",
  type_document: "programme_pdf",
  format: "pdf",
  texte_canonique: "Première page.\fNous ouvrirons les centres le dimanche.",
};

describe("lecture du prompt", () => {
  it("la version exportée est celle du fichier", () => {
    expect(VERSION_PROMPT_EXTRACTION).toBe("prompts/extraction-1.0.0");
    expect(FICHIER).toContain("`prompts/extraction-1.0.0`");
  });

  it("le texte envoyé est exactement le bloc ```text du fichier", () => {
    const debut = FICHIER.indexOf("```text\n") + "```text\n".length;
    const fin = FICHIER.indexOf("\n```", debut);
    expect(TEXTE_PROMPT).toBe(FICHIER.slice(debut, fin));
    expect(TEXTE_PROMPT.startsWith("Tu extrais des positions politiques")).toBe(true);
  });

  it("le bloc contient chacune des quatre variables", () => {
    for (const nom of NOMS_VARIABLES_EXTRACTION) expect(TEXTE_PROMPT).toContain(`{${nom}}`);
  });
});

describe("cas limite 8 : rendu", () => {
  it("les quatre variables sont remplacées partout, aucune ne reste", () => {
    const rendu = rendrePromptExtraction(TEXTE_PROMPT, VARIABLES);
    for (const nom of NOMS_VARIABLES_EXTRACTION) expect(rendu).not.toContain(`{${nom}}`);
    expect(rendu).toContain("Identifiant du candidat auquel la source est rattachée : candidat-a\n");
    expect(rendu).toContain("Type de document : programme_pdf\n");
    expect(rendu).toContain("Format : pdf\n");
    expect(rendu).toContain(`<<<DEBUT_TEXTE\n${VARIABLES.texte_canonique}\nFIN_TEXTE>>>`);
    expect(rendu).toContain('"candidat_id": "candidat-a"');
  });

  for (const nom of NOMS_VARIABLES_EXTRACTION) {
    it(`{${nom}} vide ⇒ refus nommé`, () => {
      const rendre = () => rendrePromptExtraction(TEXTE_PROMPT, { ...VARIABLES, [nom]: "" });
      expect(rendre).toThrow(VariablePromptExtractionVide);
      expect(rendre).toThrow(`{${nom}}`);
    });
  }

  it("une variable absente ⇒ refus nommé", () => {
    const { format: _format, ...sansFormat } = VARIABLES;
    expect(() => rendrePromptExtraction(TEXTE_PROMPT, sansFormat as VariablesExtraction)).toThrow(VariablePromptExtractionVide);
  });

  it("un texte de prompt sans l'une des variables ⇒ refus nommé", () => {
    const rendre = () => rendrePromptExtraction(TEXTE_PROMPT.replaceAll("{format}", "format"), VARIABLES);
    expect(rendre).toThrow(VariableAbsenteDuPromptExtraction);
    expect(rendre).toThrow("{format}");
  });

  it("texte canonique avec {candidat_id}, accolades, U+000C, emoji et $& ⇒ inséré tel quel, sans seconde substitution", () => {
    const texte_canonique = "Il dit {candidat_id} et {format} {\"a\": {}} }{ \f page 2 🗳️ $& $1 $$ fin";
    const rendu = rendrePromptExtraction(TEXTE_PROMPT, { ...VARIABLES, texte_canonique });
    expect(rendu).toContain(`<<<DEBUT_TEXTE\n${texte_canonique}\nFIN_TEXTE>>>`);
    const debut = rendu.indexOf("<<<DEBUT_TEXTE\n") + "<<<DEBUT_TEXTE\n".length;
    expect(rendu.slice(debut, debut + texte_canonique.length)).toBe(texte_canonique);
  });

  it("le rendu n'ajoute ni ne retire rien d'autre que les variables", () => {
    const rendu = rendrePromptExtraction(TEXTE_PROMPT, VARIABLES);
    const attendu = TEXTE_PROMPT.replaceAll("{candidat_id}", "candidat-a")
      .replaceAll("{type_document}", "programme_pdf")
      .replaceAll("{format}", "pdf")
      .replace("{texte_canonique}", () => VARIABLES.texte_canonique);
    expect(rendu).toBe(attendu);
  });

  it("les accolades des exemples JSON du prompt restent intactes", () => {
    const rendu = rendrePromptExtraction(TEXTE_PROMPT, VARIABLES);
    expect(rendu).toContain('{"dimensions": [{"type": …, "valeur": …, "unite": …, "operateur": …, "valeur_haute": …}]}');
    expect(rendu).toContain('"quantification": {…} facultatif } ]}');
    expect(rendu).toContain('Un document qui ne contient aucune position dans le périmètre donne {"items": []}.');
  });
});
