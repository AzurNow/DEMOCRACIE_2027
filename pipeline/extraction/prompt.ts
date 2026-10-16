/**
 * Rendu du prompt d'extraction, lu depuis `prompts/extraction-1.0.0.md` (règle 6 : aucun prompt en
 * dur ; le texte n'est jamais recopié dans le code).
 *
 * Le texte envoyé aux deux modèles est exactement le bloc ```text qui suit « ## Texte du prompt »,
 * extrait par `pipeline/reformulation/prompt.ts:extraireTexteDuPrompt` (même règle de lecture), et
 * quatre variables remplacées. Seuls ces quatre noms entre accolades sont des variables : toute
 * autre accolade (les exemples JSON du prompt) est du texte et reste intacte. Une variable absente
 * ou vide refuse le rendu, sans valeur par défaut. Le remplacement se fait en un seul passage : le
 * texte canonique est inséré entier et non modifié, même s'il contient lui-même `{candidat_id}`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extraireTexteDuPrompt } from "../reformulation/prompt.ts";

/** Version du prompt envoyé, portée par `ConfigurationExtraction.version_prompt`. */
export const VERSION_PROMPT_EXTRACTION = "prompts/extraction-1.0.0";
const FICHIER_PROMPT = new URL(`../../${VERSION_PROMPT_EXTRACTION}.md`, import.meta.url);

/** Section « Variables d'entrée » du prompt, dans son ordre. */
export const NOMS_VARIABLES_EXTRACTION = ["candidat_id", "type_document", "format", "texte_canonique"] as const;
export type NomVariableExtraction = (typeof NOMS_VARIABLES_EXTRACTION)[number];
export type VariablesExtraction = Readonly<Record<NomVariableExtraction, string>>;

const MOTIF_VARIABLE = new RegExp(`\\{(${NOMS_VARIABLES_EXTRACTION.join("|")})\\}`, "gu");

export class VariablePromptExtractionVide extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`Variable {${variable}} absente ou vide : le prompt d'extraction n'est pas rendu, aucune valeur par défaut.`);
    this.name = "VariablePromptExtractionVide";
    this.variable = variable;
  }
}

export class VariableAbsenteDuPromptExtraction extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`Le texte du prompt d'extraction ne contient pas {${variable}} : il ne correspond pas au contrat de quatre variables.`);
    this.name = "VariableAbsenteDuPromptExtraction";
    this.variable = variable;
  }
}

export function chargerPromptExtraction(): string {
  const chemin = fileURLToPath(FICHIER_PROMPT);
  return extraireTexteDuPrompt(readFileSync(chemin, "utf8"), chemin);
}

function exigerValeurs(variables: VariablesExtraction): void {
  for (const nom of NOMS_VARIABLES_EXTRACTION) {
    const valeur: unknown = variables[nom];
    if (typeof valeur !== "string" || valeur.length === 0) throw new VariablePromptExtractionVide(nom);
  }
}

function exigerEmplacements(texte: string): void {
  for (const nom of NOMS_VARIABLES_EXTRACTION) {
    if (!texte.includes(`{${nom}}`)) throw new VariableAbsenteDuPromptExtraction(nom);
  }
}

/** Le texte du prompt, ses quatre variables remplacées partout où elles figurent, en un seul passage. */
export function rendrePromptExtraction(texte: string, variables: VariablesExtraction): string {
  exigerValeurs(variables);
  exigerEmplacements(texte);
  return texte.replace(MOTIF_VARIABLE, (_motif, nom: NomVariableExtraction) => variables[nom]);
}
