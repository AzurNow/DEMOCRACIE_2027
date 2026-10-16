/**
 * Ce que `pnpm extraire` écrit sous sa sortie (`staging/` du dépôt en mode réel, un répertoire hors
 * du dépôt en mode simulé), et ce qu'il y relit pour reprendre. Règle 3 : le pipeline n'écrit que
 * dans `staging/` ; la promotion appartient à l'interface de validation.
 *
 * | Fichier | Schéma | Quand |
 * | --- | --- | --- |
 * | `reponses-extraction/<cle_source>/<sha256>/<modèle encodé>.<prompt_sha256>.json` | `reponse-extraction` | dès la réception, avant toute lecture du corps (règle 7) |
 * | `items/<id>.json`, `mesures/<id>.json` | `item`, `mesure` | après l'extraction, lus par `validation/io/staging.ts:chargerStaging` |
 * | `journal-extraction/<cle_source>/<sha256>.json` | `journal-extraction` | en dernier : il marque la source traitée |
 *
 * Chaque fichier est validé contre son schéma avant l'écriture (une donnée non conforme est une
 * erreur de code, rien n'est écrit), puis écrit une fois, de façon atomique : un temporaire du même
 * répertoire, puis un lien vers le nom final, qui échoue si ce nom existe déjà
 * (`DejaEcrit`, calqué sur `pipeline/reformulation/staging.ts`). Rien n'est jamais réécrit.
 *
 * La clé d'une réponse gardée est (source, modèle, empreinte du prompt rendu) : le nom du fichier la
 * porte, et `lireReponseGardee` vérifie que le contenu dit la même chose.
 */

import { randomBytes } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { NomSchema } from "../../outils/schemas/noms.ts";
import { valider } from "../../outils/schemas/valider.ts";
import type { Item } from "../../validation/domaine/types.ts";
import type { ObjetJson } from "../interrogation/types.ts";
import type { MesureStaging } from "./assemblage.ts";
import type { Rejet } from "./rejets.ts";

export const REPERTOIRE_REPONSES = "reponses-extraction";
export const REPERTOIRE_JOURNAUX = "journal-extraction";

export type CorpsGarde = { readonly brut: ObjetJson } | { readonly brut_texte: string };

/** `schema/reponse-extraction.schema.json`, champ pour champ. */
export type ReponseGardee = {
  readonly cle_source: string;
  readonly sha256_source: string;
  readonly modele: string;
  readonly version_prompt: string;
  readonly prompt_sha256: string;
  readonly date: string;
  readonly statut_http: number;
  readonly brut_octets_sha256: string;
} & CorpsGarde;

export type Lecture = { readonly lisible: true } | { readonly lisible: false; readonly raison: string };

export interface ReponseJournal {
  readonly modele: string;
  readonly statut_http: number;
  readonly brut_octets_sha256: string;
  readonly lecture: Lecture;
}

export type IssueJournal =
  | { readonly statut: "extraite"; readonly items: readonly string[]; readonly mesures: readonly string[]; readonly rejets: readonly Rejet[] }
  | { readonly statut: "refusee"; readonly rejets: readonly Rejet[] };

/** `schema/journal-extraction.schema.json`, champ pour champ. */
export interface JournalExtraction {
  readonly cle_source: string;
  readonly sha256_source: string;
  readonly texte_sha256: string;
  readonly date: string;
  readonly commit: string;
  readonly version_prompt: string;
  readonly prompt_sha256: string;
  readonly reponses: readonly ReponseJournal[];
  readonly issue: IssueJournal;
}

export interface CleReponse {
  readonly cle_source: string;
  readonly sha256_source: string;
  readonly modele: string;
  readonly prompt_sha256: string;
}

export class DejaEcrit extends Error {
  constructor(chemin: string) {
    super(`Fichier déjà écrit, jamais réécrit (règle 7) : ${chemin}.`);
    this.name = "DejaEcrit";
  }
}

export class StagingExtractionIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(`${chemin} : ${detail} Rien n'est ignoré : corriger ou retirer ce fichier à la main.`);
    this.name = "StagingExtractionIllisible";
  }
}

/* ------------------------------------------------------------------- chemins */

export function cheminReponse(sortie: string, cle: CleReponse): string {
  return join(sortie, REPERTOIRE_REPONSES, cle.cle_source, cle.sha256_source, `${encodeURIComponent(cle.modele)}.${cle.prompt_sha256}.json`);
}

export function cheminJournal(sortie: string, cle_source: string, sha256_source: string): string {
  return join(sortie, REPERTOIRE_JOURNAUX, cle_source, `${sha256_source}.json`);
}

function cheminObjet(sortie: string, repertoire: "items" | "mesures", id: string): string {
  return join(sortie, repertoire, `${id}.json`);
}

/* ------------------------------------------------------------------ écriture */

/** Valide, puis écrit une fois ; lève `ErreurSchema` ou `DejaEcrit` sans rien laisser alors. */
function ecrireUneFois(schema: NomSchema, chemin: string, valeur: unknown): string {
  const texte = `${JSON.stringify(valider(schema, valeur, `${schema} à écrire dans ${chemin}`), null, 2)}\n`;
  const repertoire = dirname(chemin);
  mkdirSync(repertoire, { recursive: true });
  const tmp = join(repertoire, `.ecriture.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  writeFileSync(tmp, texte, { encoding: "utf8", flag: "wx" });
  try {
    linkSync(tmp, chemin);
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "EEXIST") throw new DejaEcrit(chemin);
    throw erreur;
  } finally {
    rmSync(tmp, { force: true });
  }
  return chemin;
}

export function ecrireReponse(sortie: string, reponse: ReponseGardee): string {
  return ecrireUneFois("reponse-extraction", cheminReponse(sortie, reponse), reponse);
}

export function ecrireItem(sortie: string, item: Item): string {
  return ecrireUneFois("item", cheminObjet(sortie, "items", item.id), item);
}

export function ecrireMesure(sortie: string, mesure: MesureStaging): string {
  return ecrireUneFois("mesure", cheminObjet(sortie, "mesures", mesure.id), mesure);
}

export function ecrireJournal(sortie: string, journal: JournalExtraction): string {
  return ecrireUneFois("journal-extraction", cheminJournal(sortie, journal.cle_source, journal.sha256_source), journal);
}

/* ------------------------------------------------------------------- reprise */

export function journalPresent(sortie: string, cle_source: string, sha256_source: string): boolean {
  return existsSync(cheminJournal(sortie, cle_source, sha256_source));
}

function lireJson(chemin: string): unknown {
  try {
    return JSON.parse(readFileSync(chemin, "utf8")) as unknown;
  } catch (erreur) {
    throw new StagingExtractionIllisible(chemin, `JSON illisible (${erreur instanceof Error ? erreur.message : String(erreur)}).`);
  }
}

const CHAMPS_DE_LA_CLE: readonly (keyof CleReponse)[] = ["cle_source", "sha256_source", "modele", "prompt_sha256"];

/** La réponse gardée sous cette clé, ou `null` ; un fichier qui ne dit pas sa propre clé arrête tout. */
export function lireReponseGardee(sortie: string, cle: CleReponse): ReponseGardee | null {
  const chemin = cheminReponse(sortie, cle);
  if (!existsSync(chemin)) return null;
  const reponse = valider<ReponseGardee>("reponse-extraction", lireJson(chemin), chemin);
  const ecart = CHAMPS_DE_LA_CLE.find((champ) => reponse[champ] !== cle[champ]);
  if (ecart !== undefined) throw new StagingExtractionIllisible(chemin, `porte ${ecart} « ${reponse[ecart]} », son nom dit « ${cle[ecart]} ».`);
  return reponse;
}
