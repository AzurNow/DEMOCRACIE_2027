/**
 * Rendu du prompt de reformulation, lu depuis `prompts/reformulation-1.0.1.md` (règle 6 : aucun
 * prompt en dur ; le texte n'est jamais recopié dans le code).
 *
 * Le texte envoyé au modèle est exactement le contenu du bloc ```text qui suit le titre
 * « ## Texte du prompt », six variables remplacées. Seuls ces six noms entre accolades sont des
 * variables : toute autre accolade du bloc (les exemples JSON) est du texte, et reste intacte. Une
 * variable absente ou vide refuse le rendu, sans valeur par défaut. Le remplacement se fait en un
 * seul passage : une valeur qui contient elle-même `{gabarit}` n'est pas substituée une seconde fois.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Version portée par les formulations produites (`production.version_prompt`, ligne « Trace » du prompt). */
export const VERSION_PROMPT_REFORMULATION = "prompts/reformulation-1.0.1";
const FICHIER_PROMPT = new URL(`../../${VERSION_PROMPT_REFORMULATION}.md`, import.meta.url);

const TITRE = "## Texte du prompt";
const OUVERTURE = "```text";
const FERMETURE = "```";
const TITRE_DE_SECTION = /^## /u;

/** Section « Variables d'entrée » du prompt, dans son ordre. */
export const NOMS_VARIABLES = [
  "gabarit",
  "type_item",
  "texte_neutre",
  "libelle_candidat",
  "formulation_mesure",
  "position_affirmee",
] as const;
export type NomVariable = (typeof NOMS_VARIABLES)[number];
export type VariablesPrompt = Readonly<Record<NomVariable, string>>;

const MOTIF_VARIABLE = new RegExp(`\\{(${NOMS_VARIABLES.join("|")})\\}`, "gu");

export class PromptIllisible extends Error {
  constructor(provenance: string, detail: string) {
    super(`Prompt de reformulation illisible (${provenance}) : ${detail}`);
    this.name = "PromptIllisible";
  }
}

export class VariablePromptVide extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`Variable {${variable}} absente ou vide : le prompt n'est pas rendu, aucune valeur par défaut.`);
    this.name = "VariablePromptVide";
    this.variable = variable;
  }
}

export class VariableAbsenteDuPrompt extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`Le texte du prompt ne contient pas {${variable}} : il ne correspond pas au contrat de six variables.`);
    this.name = "VariableAbsenteDuPrompt";
    this.variable = variable;
  }
}

/** L'unique ligne exactement égale au titre ; deux titres seraient un choix silencieux. */
function ligneDuTitre(lignes: readonly string[], provenance: string): number {
  const rangs = lignes.flatMap((ligne, rang) => (ligne === TITRE ? [rang] : []));
  const [rang] = rangs;
  if (rang === undefined) throw new PromptIllisible(provenance, `titre « ${TITRE} » absent.`);
  if (rangs.length > 1) throw new PromptIllisible(provenance, `titre « ${TITRE} » présent ${rangs.length} fois.`);
  return rang;
}

/** La ligne d'ouverture ```text de la section, avant tout titre de section suivant. */
function ligneDOuverture(lignes: readonly string[], titre: number, provenance: string): number {
  for (let rang = titre + 1; rang < lignes.length; rang += 1) {
    const ligne = lignes[rang];
    if (ligne === OUVERTURE) return rang;
    if (ligne !== undefined && TITRE_DE_SECTION.test(ligne)) break;
  }
  throw new PromptIllisible(provenance, `aucun bloc « ${OUVERTURE} » sous « ${TITRE} ».`);
}

/** Le texte du bloc ```text qui suit « ## Texte du prompt », sans ses lignes de clôture. */
export function extraireTexteDuPrompt(contenu: string, provenance: string): string {
  const lignes = contenu.split("\n");
  const ouverture = ligneDOuverture(lignes, ligneDuTitre(lignes, provenance), provenance);
  const fermeture = lignes.indexOf(FERMETURE, ouverture + 1);
  if (fermeture === -1) throw new PromptIllisible(provenance, `bloc « ${OUVERTURE} » jamais refermé.`);
  return lignes.slice(ouverture + 1, fermeture).join("\n");
}

export function chargerPromptReformulation(): string {
  const chemin = fileURLToPath(FICHIER_PROMPT);
  return extraireTexteDuPrompt(readFileSync(chemin, "utf8"), chemin);
}

function exigerValeurs(variables: VariablesPrompt): void {
  for (const nom of NOMS_VARIABLES) {
    const valeur: unknown = variables[nom];
    if (typeof valeur !== "string" || valeur.length === 0) throw new VariablePromptVide(nom);
  }
}

function exigerEmplacements(texte: string): void {
  for (const nom of NOMS_VARIABLES) {
    if (!texte.includes(`{${nom}}`)) throw new VariableAbsenteDuPrompt(nom);
  }
}

/** Le texte du prompt, ses six variables remplacées partout où elles figurent, en un seul passage. */
export function rendrePrompt(texte: string, variables: VariablesPrompt): string {
  exigerValeurs(variables);
  exigerEmplacements(texte);
  return texte.replace(MOTIF_VARIABLE, (_motif, nom: NomVariable) => variables[nom]);
}
