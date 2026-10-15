/**
 * L'éditeur de reformulation simulé : un adaptateur et un transport sans réseau, pour
 * `pnpm reformuler --simule` et les tests.
 *
 * Il imite l'enveloppe de l'API de chat (`choices[0].message.content`, lue par le même
 * `texteDuChat` que l'adaptateur Mistral) et ne produit aucun contenu réel : ses formulations sont
 * le texte neutre de la question, préfixé d'une marque « [simulé] », donc conformes au contrôle par
 * construction. Ses propositions portent `production.modele` = `MODELE_SIMULE` : elles ne passent
 * jamais pour celles d'un modèle réel.
 *
 * L'issue de chaque question est déterministe : choisie par `choisir`, par défaut d'après
 * l'empreinte de la demande (`choixParEmpreinte`), parmi une sortie acceptée, une sortie rejetée
 * (entourée d'un bloc de code, motif `bloc_de_code`), un 500 à corps JSON et un 200 à corps non
 * JSON (`corps_illisible`).
 */

import { canoniser, sha256 } from "../../validation/domaine/empreinte.ts";
import type { ReponseHttp, RequeteHttp, Transport } from "../interrogation/editeur.ts";
import type { DemandeReformulation } from "./demande.ts";
import { variablesDuPrompt } from "./demande.ts";
import type { AdaptateurReformulation, EditeurReformulation } from "./editeur.ts";
import { texteDuChat } from "./editeur-mistral.ts";
import { AUCUNE } from "./position-affirmee.ts";
import { rendrePrompt } from "./prompt.ts";

export const MODELE_SIMULE = "simule/reformulation-sans-reseau";
export const ENDPOINT_SIMULE = "simule://reformulation.invalid/v1/chat/completions";

export const ISSUES_SIMULEES = ["acceptee", "rejetee", "http_500", "non_json"] as const;
export type IssueSimulee = (typeof ISSUES_SIMULEES)[number];
export type Choix = (demande: DemandeReformulation) => IssueSimulee;

/** L'issue d'une demande, lue dans l'empreinte de ses variables : la même demande, la même issue. */
export const choixParEmpreinte: Choix = (demande) => {
  const empreinte = sha256(canoniser(variablesDuPrompt(demande)));
  const issue = ISSUES_SIMULEES[Number.parseInt(empreinte.slice(0, 8), 16) % ISSUES_SIMULEES.length];
  if (issue === undefined) throw new Error("Indice d'issue simulée hors bornes.");
  return issue;
};

function sortieConforme(demande: DemandeReformulation): string {
  const position = demande.position_affirmee === AUCUNE ? {} : { position_affirmee: demande.position_affirmee };
  return JSON.stringify({
    familier: { texte: `[simulé] ${demande.texte_neutre}` },
    oriente: { texte: `[simulé, orienté] ${demande.texte_neutre}`, ...position },
  });
}

function enveloppe(contenu: string, prompt: string): string {
  return JSON.stringify({
    id: `sim-${sha256(prompt).slice(0, 12)}`,
    object: "chat.completion",
    created: 0,
    model: MODELE_SIMULE,
    choices: [{ index: 0, message: { role: "assistant", content: contenu }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

const CORPS_500 = JSON.stringify({ object: "error", message: "Erreur interne simulée.", type: "internal_error", code: "simule_500" });
const CORPS_NON_JSON = "<html><body>Réponse simulée qui n'est pas du JSON.</body></html>";

function corpsDe(issue: IssueSimulee, demande: DemandeReformulation, prompt: string): { statut: number; texte: string } {
  switch (issue) {
    case "acceptee":
      return { statut: 200, texte: enveloppe(sortieConforme(demande), prompt) };
    case "rejetee":
      return { statut: 200, texte: enveloppe(`\`\`\`json\n${sortieConforme(demande)}\n\`\`\``, prompt) };
    case "http_500":
      return { statut: 500, texte: CORPS_500 };
    case "non_json":
      return { statut: 200, texte: CORPS_NON_JSON };
  }
}

function promptDeLaRequete(requete: RequeteHttp): string {
  const messages = requete.corps["messages"];
  const premier: unknown = Array.isArray(messages) ? (messages as readonly unknown[])[0] : undefined;
  const contenu: unknown = typeof premier === "object" && premier !== null ? (premier as Record<string, unknown>)["content"] : undefined;
  if (typeof contenu !== "string") throw new Error("Éditeur simulé : requête sans messages[0].content textuel.");
  return contenu;
}

export class TransportSimule implements Transport {
  /** Chaque requête reçue, dans l'ordre : ce que le serveur simulé a vu. */
  readonly recues: RequeteHttp[] = [];
  private readonly demandes: ReadonlyMap<string, DemandeReformulation>;
  private readonly choisir: Choix;

  constructor(demandes: ReadonlyMap<string, DemandeReformulation>, choisir: Choix) {
    this.demandes = demandes;
    this.choisir = choisir;
  }

  envoyer(requete: RequeteHttp): Promise<ReponseHttp> {
    this.recues.push(requete);
    const prompt = promptDeLaRequete(requete);
    const demande = this.demandes.get(prompt);
    if (demande === undefined) throw new Error("Éditeur simulé : prompt reçu pour aucune demande connue.");
    const { statut, texte } = corpsDe(this.choisir(demande), demande, prompt);
    return Promise.resolve({ statut, corps: new TextEncoder().encode(texte) });
  }
}

const adaptateurSimule: AdaptateurReformulation = {
  modele: MODELE_SIMULE,
  construireRequete: (prompt) => ({
    endpoint: ENDPOINT_SIMULE,
    entetes: { "content-type": "application/json" },
    corps: { model: MODELE_SIMULE, messages: [{ role: "user", content: prompt }] },
  }),
  texteDuModele: texteDuChat,
};

/** L'éditeur simulé pour ces demandes, rendues avec ce texte de prompt. */
export function editeurSimule(
  texte_prompt: string,
  demandes: readonly DemandeReformulation[],
  choisir: Choix,
): EditeurReformulation & { readonly transport: TransportSimule } {
  const parPrompt = new Map(demandes.map((demande) => [rendrePrompt(texte_prompt, variablesDuPrompt(demande)), demande]));
  return { adaptateur: adaptateurSimule, transport: new TransportSimule(parPrompt, choisir) };
}
