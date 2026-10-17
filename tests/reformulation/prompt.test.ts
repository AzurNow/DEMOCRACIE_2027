/**
 * Rendu du prompt de reformulation (règle 6 : lu depuis `prompts/`, jamais recopié dans le code).
 * Le texte envoyé est exactement le bloc ```text qui suit « ## Texte du prompt », ses six variables
 * remplacées ; toute autre accolade du bloc est du texte.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chargerPromptReformulation,
  extraireTexteDuPrompt,
  NOMS_VARIABLES,
  PromptIllisible,
  rendrePrompt,
  VariableAbsenteDuPrompt,
  VariablePromptVide,
  VERSION_PROMPT_REFORMULATION,
} from "../../pipeline/reformulation/prompt.ts";
import type { VariablesPrompt } from "../../pipeline/reformulation/prompt.ts";

const FICHIER = resolve(import.meta.dirname, "../../prompts/reformulation-1.0.1.md");
const CONTENU = readFileSync(FICHIER, "utf8");

/** Le bloc tel qu'il est dans le fichier, lu ici indépendamment du module testé. */
function blocAttendu(): string {
  const apresTitre = CONTENU.slice(CONTENU.indexOf("## Texte du prompt"));
  const ouverture = apresTitre.indexOf("```text\n") + "```text\n".length;
  const fermeture = apresTitre.indexOf("\n```", ouverture);
  return apresTitre.slice(ouverture, fermeture);
}

const VARIABLES: VariablesPrompt = {
  gabarit: "Q-NEG",
  type_item: "P",
  texte_neutre: "Hélène Durand-Aubry s'oppose-t-il ou elle au budget ?",
  libelle_candidat: "Hélène Durand-Aubry",
  formulation_mesure: "le budget",
  position_affirmee: "contre",
};

describe("lecture du bloc de prompt", () => {
  it("la version portée est celle du tableau d'en-tête du prompt (ligne « Trace »)", () => {
    expect(VERSION_PROMPT_REFORMULATION).toBe("prompts/reformulation-1.0.1");
    expect(CONTENU).toContain(`\`${VERSION_PROMPT_REFORMULATION}\``);
  });

  it("le gabarit chargé est exactement le bloc ```text du fichier", () => {
    expect(chargerPromptReformulation()).toBe(blocAttendu());
  });

  it("cas limite 5 : fichier sans titre « ## Texte du prompt » ⇒ PromptIllisible", () => {
    const sansTitre = CONTENU.replace("## Texte du prompt", "## Autre titre");
    expect(() => extraireTexteDuPrompt(sansTitre, "essai")).toThrow(PromptIllisible);
    expect(() => extraireTexteDuPrompt(sansTitre, "essai")).toThrow(/Texte du prompt/u);
  });

  it("cas limite 5 : titre présent mais aucun bloc ```text ⇒ PromptIllisible", () => {
    const sansBloc = CONTENU.replace("```text\n", "```\n");
    expect(() => extraireTexteDuPrompt(sansBloc, "essai")).toThrow(PromptIllisible);
    expect(() => extraireTexteDuPrompt(sansBloc, "essai")).toThrow(/```text/u);
  });

  it("cas limite 5 : bloc ```text jamais refermé ⇒ PromptIllisible", () => {
    const fin = CONTENU.lastIndexOf("\n```");
    const nonFerme = CONTENU.slice(0, fin) + "\n";
    expect(() => extraireTexteDuPrompt(nonFerme, "essai")).toThrow(PromptIllisible);
  });

  it("cas limite 5 : un bloc ```text placé sous une autre section ne compte pas", () => {
    const ailleurs = "## Texte du prompt\n\nRien ici.\n\n## Suite\n\n```text\nBloc égaré\n```\n";
    expect(() => extraireTexteDuPrompt(ailleurs, "essai")).toThrow(PromptIllisible);
  });

  it("deux titres « ## Texte du prompt » ⇒ PromptIllisible, aucun choix silencieux", () => {
    const double = `${CONTENU}\n## Texte du prompt\n\n\`\`\`text\nautre\n\`\`\`\n`;
    expect(() => extraireTexteDuPrompt(double, "essai")).toThrow(PromptIllisible);
  });
});

describe("rendu des six variables", () => {
  const gabarit = chargerPromptReformulation();

  it("cas limite 4 : chaque variable est remplacée partout où elle figure, et nulle part ne subsiste", () => {
    const rendu = rendrePrompt(gabarit, VARIABLES);
    for (const nom of NOMS_VARIABLES) expect(rendu).not.toContain(`{${nom}}`);
    const occurrences = (texte: string, motif: string): number => texte.split(motif).length - 1;
    expect(occurrences(gabarit, "{libelle_candidat}")).toBe(1);
    expect(rendu).toContain("- Nom du candidat, à recopier exactement : Hélène Durand-Aubry\n");
    expect(rendu).toContain("- Position que la prémisse orientée doit affirmer : contre\n");
  });

  it("cas limite 4 : le texte rendu est le bloc, variables remplacées, rien d'autre", () => {
    let attendu = blocAttendu();
    for (const nom of NOMS_VARIABLES) attendu = attendu.replaceAll(`{${nom}}`, VARIABLES[nom]);
    expect(rendrePrompt(gabarit, VARIABLES)).toBe(attendu);
  });

  it("cas limite 4 : le texte rendu commence et finit exactement comme le bloc", () => {
    const rendu = rendrePrompt(gabarit, VARIABLES);
    expect(rendu.startsWith("Tu réécris une question dans deux autres registres")).toBe(true);
    expect(rendu.endsWith(', "position_affirmee": "pour"}}')).toBe(true);
    expect(rendu.startsWith(blocAttendu().slice(0, 80))).toBe(true);
    expect(rendu.endsWith(blocAttendu().slice(-80))).toBe(true);
  });

  it("cas limite 4 : les accolades des exemples JSON du bloc restent intactes", () => {
    const rendu = rendrePrompt(gabarit, VARIABLES);
    expect(rendu).toContain('{"familier": {"texte": "…"}, "oriente": {"texte": "…", "position_affirmee": "…"}}');
    expect(rendu).toContain('{"familier": {"texte": "Tu sais si Camille Exemple propose');
  });

  it("cas limite 4 : une valeur qui contient le nom d'une variable n'est pas substituée une seconde fois", () => {
    const rendu = rendrePrompt(gabarit, { ...VARIABLES, texte_neutre: "Texte avec {gabarit} littéral ?" });
    expect(rendu).toContain("- Texte neutre : Texte avec {gabarit} littéral ?\n");
  });

  it.each(NOMS_VARIABLES)("cas limite 4 : variable « %s » vide ⇒ VariablePromptVide", (nom) => {
    expect(() => rendrePrompt(gabarit, { ...VARIABLES, [nom]: "" })).toThrow(VariablePromptVide);
  });

  it.each(NOMS_VARIABLES)("cas limite 4 : variable « %s » absente ⇒ VariablePromptVide", (nom) => {
    const { [nom]: _retiree, ...incompletes } = VARIABLES;
    expect(() => rendrePrompt(gabarit, incompletes as VariablesPrompt)).toThrow(VariablePromptVide);
  });

  it("un gabarit de prompt où une variable manque ⇒ VariableAbsenteDuPrompt", () => {
    const amputé = gabarit.replace("{position_affirmee}", "pour");
    expect(() => rendrePrompt(amputé, VARIABLES)).toThrow(VariableAbsenteDuPrompt);
  });
});
