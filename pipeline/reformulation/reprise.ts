/**
 * Reprise de `pnpm reformuler` : quelles questions appeler, lesquelles sauter.
 *
 * La clé est (question_id, empreinte du texte neutre courant) (D39). Une question est sautée :
 * - « déjà validée » si `data/formulations/<question_id>.json` existe et porte cette empreinte
 *   (formulations relues et promues par l'interface de validation, PR C) ;
 * - « déjà acceptée » si `staging/formulations/<question_id>/` porte une proposition `acceptee` sur
 *   cette empreinte que le relecteur n'a pas refusée (`validation/formulations/refus.jsonl`).
 * Toute autre question est appelée : propositions seulement rejetées ou en échec, acceptée sur un
 * autre texte neutre, acceptée puis refusée à la relecture. Les fichiers existants ne sont jamais
 * modifiés : un nouvel appel écrit un nouveau fichier.
 *
 * Les deux fichiers de la PR C sont lus ici en lecture seule, par des fonctions isolées, sans
 * dépendre de son code : un fichier absent est vide ; un fichier présent mais illisible ou non
 * conforme à la forme minimale attendue est une erreur nommée, levée avant tout appel.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PropositionFormulation } from "./staging.ts";

const SHA256 = /^[0-9a-f]{64}$/u;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

export class FormulationValideeIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(`${chemin} : formulations validées illisibles, ${detail} Aucune question n'est appelée.`);
    this.name = "FormulationValideeIllisible";
  }
}

export class JournalRefusIllisible extends Error {
  readonly ligne: number;

  constructor(chemin: string, ligne: number, detail: string) {
    super(`${chemin}, ligne ${ligne} : journal des refus illisible, ${detail} Aucune question n'est appelée.`);
    this.name = "JournalRefusIllisible";
    this.ligne = ligne;
  }
}

function estObjet(valeur: unknown): valeur is Readonly<Record<string, unknown>> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function lireJsonObjet(texte: string): Readonly<Record<string, unknown>> | string {
  let valeur: unknown;
  try {
    valeur = JSON.parse(texte);
  } catch (erreur) {
    return `JSON illisible (${erreur instanceof Error ? erreur.message : String(erreur)}).`;
  }
  return estObjet(valeur) ? valeur : "un objet JSON est attendu.";
}

/* ------------------------------------------------ data/formulations/<id>.json */

export function cheminFormulationValidee(repertoire: string, question_id: string): string {
  return join(repertoire, `${question_id}.json`);
}

function motifFormulationValidee(objet: Readonly<Record<string, unknown>>, question_id: string): string | null {
  if (objet["question_id"] !== question_id) return `question_id ne vaut pas « ${question_id} », le nom du fichier.`;
  const empreinte = objet["empreinte_texte_neutre"];
  if (typeof empreinte !== "string" || !SHA256.test(empreinte)) return "empreinte_texte_neutre n'est pas un sha256.";
  return null;
}

/**
 * L'empreinte du texte neutre sur laquelle la question a été validée, ou `null` si
 * `data/formulations/<question_id>.json` n'existe pas.
 */
export function empreinteValidee(repertoire: string, question_id: string): string | null {
  const chemin = cheminFormulationValidee(repertoire, question_id);
  if (!existsSync(chemin)) return null;
  const objet = lireJsonObjet(readFileSync(chemin, "utf8"));
  if (typeof objet === "string") throw new FormulationValideeIllisible(chemin, objet);
  const motif = motifFormulationValidee(objet, question_id);
  if (motif !== null) throw new FormulationValideeIllisible(chemin, motif);
  return objet["empreinte_texte_neutre"] as string;
}

/* ------------------------------------------- validation/formulations/refus.jsonl */

function propositionRefusee(ligne: string, rang: number, chemin: string): string {
  const objet = lireJsonObjet(ligne);
  if (typeof objet === "string") throw new JournalRefusIllisible(chemin, rang, objet);
  const id = objet["proposition_id"];
  if (typeof id !== "string" || !ULID.test(id)) throw new JournalRefusIllisible(chemin, rang, "proposition_id n'est pas un ULID.");
  return id;
}

/**
 * Les identifiants des propositions refusées à la relecture. Un objet JSON par ligne ; seule la
 * dernière ligne peut être vide (fin de fichier). Fichier absent : aucun refus.
 */
export function lireRefus(chemin: string): ReadonlySet<string> {
  if (!existsSync(chemin)) return new Set();
  const lignes = readFileSync(chemin, "utf8").split("\n");
  if (lignes.at(-1) === "") lignes.pop();
  return new Set(lignes.map((ligne, rang) => propositionRefusee(ligne, rang + 1, chemin)));
}

/* --------------------------------------------------------------- décision */

export type DecisionReprise = "a_appeler" | "deja_validee" | "deja_acceptee";

export interface EtatQuestion {
  readonly empreinte_courante: string;
  readonly empreinte_validee: string | null;
  readonly propositions: readonly PropositionFormulation[];
  readonly refus: ReadonlySet<string>;
}

function accepteeEnVigueur(proposition: PropositionFormulation, etat: EtatQuestion): boolean {
  return (
    proposition.issue.statut === "acceptee" &&
    proposition.empreinte_texte_neutre === etat.empreinte_courante &&
    !etat.refus.has(proposition.id)
  );
}

export function deciderReprise(etat: EtatQuestion): DecisionReprise {
  if (etat.empreinte_validee === etat.empreinte_courante) return "deja_validee";
  if (etat.propositions.some((proposition) => accepteeEnVigueur(proposition, etat))) return "deja_acceptee";
  return "a_appeler";
}
