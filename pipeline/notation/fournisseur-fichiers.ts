/**
 * Le fournisseur d'existences adossé aux fichiers du test des liens d'un run (§7 ; décision D20).
 *
 * `pnpm liens <run>` (`pipeline/liens`, Python) écrit un fichier par URL citée,
 * `runs/<date>/volume/liens/<sha256 de l'URL>.json` (`schema/existence-lien.schema.json`). Ce module
 * les lit **tous, à la construction** : un fichier invalide au schéma ou incohérent arrête la
 * construction par une erreur nommée (`ErreurSchema`, `FichierExistenceRefuse`), il n'est jamais
 * ignoré. Contrôles en plus du schéma :
 * - le nom du fichier est le SHA-256 (UTF-8) de `url_citee` : un fichier par URL, sans doublon ;
 * - tentatives numérotées 1, 2, 3… sans trou ; `date_test` et `code_http` sont ceux de la dernière ;
 * - `archive_url` est exactement celle que l'issue Wayback a renvoyée ;
 * - la page d'un lien qui existe est présente sous `volume/liens/`, nommée par son empreinte, de la
 *   taille annoncée (l'empreinte elle-même n'est pas recalculée à chaque ouverture de l'écran).
 * Une entrée du répertoire qui n'est ni un résultat `.json` ni le dossier `pages/` est refusée.
 *
 * Contrat de `FournisseurExistences` inchangé : `existencesDe` rend un verdict par lien distinct
 * demandé qui en a un, ni plus ni moins. Un lien sans fichier n'a pas de verdict : la réponse reste
 * « en attente du test des liens ». Seuls les champs d'un lien de notation (`ExistenceEtablie`) sont
 * rendus : le journal des tentatives et l'issue Wayback restent dans le fichier.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import type { FournisseurExistences } from "./fournisseur-existences.ts";
import type { ExistenceEtablie } from "./vue-annotateur.ts";

export const REPERTOIRE_PAGES = "pages";

interface TentativeEcrite {
  readonly numero: number;
  readonly horodatage: string;
  readonly issue: string;
  readonly code_http: number | null;
}

interface PageConservee {
  readonly chemin: string;
  readonly taille_octets: number;
}

/** Un fichier de `volume/liens/`, tel que le décrit `schema/existence-lien.schema.json`. */
interface ResultatTestLien extends ExistenceEtablie {
  readonly code_http: number | null;
  readonly version_table: string;
  readonly tentatives: readonly TentativeEcrite[];
  readonly page?: PageConservee;
  readonly wayback: { readonly operation: string; readonly archive_url?: string };
}

export class FichierExistenceRefuse extends Error {
  readonly chemin: string;

  constructor(chemin: string, detail: string) {
    super(`${chemin} : résultat du test des liens refusé — ${detail}`);
    this.name = "FichierExistenceRefuse";
    this.chemin = chemin;
  }
}

/** `<repertoire_run>/volume/liens`, où `pipeline/liens` écrit ses résultats. */
export function repertoireLiens(repertoire_run: string): string {
  return join(repertoire_run, "volume", "liens");
}

export function nomResultat(url: string): string {
  return `${createHash("sha256").update(url, "utf8").digest("hex")}.json`;
}

function lireJson(chemin: string): unknown {
  try {
    return JSON.parse(readFileSync(chemin, "utf8")) as unknown;
  } catch (erreur) {
    if (erreur instanceof SyntaxError) throw new FichierExistenceRefuse(chemin, `JSON illisible (${erreur.message}).`);
    throw erreur;
  }
}

function incoherencesDesTentatives(r: ResultatTestLien): readonly string[] {
  const derniere = r.tentatives.at(-1);
  if (derniere === undefined) return ["aucune tentative."];
  const constats: string[] = [];
  if (!r.tentatives.every((t, rang) => t.numero === rang + 1)) constats.push("tentatives non numérotées 1, 2, 3… sans trou.");
  if (r.date_test !== derniere.horodatage) constats.push(`date_test ${r.date_test} n'est pas l'horodatage de la dernière tentative (${derniere.horodatage}).`);
  if (r.code_http !== derniere.code_http) constats.push(`code_http ${String(r.code_http)} n'est pas celui de la dernière tentative (${String(derniere.code_http)}).`);
  return constats;
}

function incoherencesDeLaPage(repertoire: string, r: ResultatTestLien): readonly string[] {
  if (r.page === undefined) return [];
  if (r.sha256_contenu === undefined || !r.page.chemin.startsWith(`${REPERTOIRE_PAGES}/${r.sha256_contenu}.`)) {
    return [`la page ${r.page.chemin} n'est pas nommée par l'empreinte ${String(r.sha256_contenu)}.`];
  }
  const chemin = join(repertoire, r.page.chemin);
  if (!existsSync(chemin)) return [`la page conservée ${r.page.chemin} est absente.`];
  const taille = statSync(chemin).size;
  return taille === r.page.taille_octets ? [] : [`la page ${r.page.chemin} fait ${taille} octets, ${r.page.taille_octets} annoncés.`];
}

function incoherences(repertoire: string, nom: string, r: ResultatTestLien): readonly string[] {
  const constats: string[] = [];
  if (nom !== nomResultat(r.url_citee)) constats.push(`le nom n'est pas le SHA-256 de l'URL citée (${nomResultat(r.url_citee)} attendu).`);
  if (r.archive_url !== r.wayback.archive_url) constats.push("archive_url diffère de celle que l'issue Wayback a renvoyée.");
  return [...constats, ...incoherencesDesTentatives(r), ...incoherencesDeLaPage(repertoire, r)];
}

/** Recopie champ par champ : seuls les champs d'un lien de notation sortent du fichier. */
function existenceDe(r: ResultatTestLien): ExistenceEtablie {
  return {
    url_citee: r.url_citee,
    verdict_existence: r.verdict_existence,
    date_test: r.date_test,
    code_http: r.code_http,
    ...(r.url_finale === undefined ? {} : { url_finale: r.url_finale }),
    ...(r.sha256_contenu === undefined ? {} : { sha256_contenu: r.sha256_contenu }),
    ...(r.archive_url === undefined ? {} : { archive_url: r.archive_url }),
  };
}

function lireResultat(repertoire: string, nom: string): ExistenceEtablie {
  const chemin = join(repertoire, nom);
  const resultat = valider<ResultatTestLien>("existence-lien", lireJson(chemin), chemin);
  const constats = incoherences(repertoire, nom, resultat);
  if (constats.length > 0) throw new FichierExistenceRefuse(chemin, constats.join(" "));
  return existenceDe(resultat);
}

function estEntreeAdmise(repertoire: string, nom: string): boolean {
  const statut = statSync(join(repertoire, nom));
  return nom === REPERTOIRE_PAGES ? statut.isDirectory() : nom.endsWith(".json") && statut.isFile();
}

/** Tous les verdicts du répertoire, indexés par URL citée. Lève au premier fichier refusé. */
export function lireExistences(repertoire: string): ReadonlyMap<string, ExistenceEtablie> {
  const noms = readdirSync(repertoire).sort();
  const etrangers = noms.filter((nom) => !estEntreeAdmise(repertoire, nom));
  if (etrangers.length > 0) throw new FichierExistenceRefuse(repertoire, `entrées qui ne sont pas des résultats, ni lues ni ignorées : ${etrangers.join(", ")}.`);
  const index = new Map<string, ExistenceEtablie>();
  for (const nom of noms.filter((n) => n !== REPERTOIRE_PAGES)) {
    const existence = lireResultat(repertoire, nom);
    index.set(existence.url_citee, existence);
  }
  return index;
}

/** Le fournisseur de `volume/liens/` du run. Le répertoire doit exister : l'appelant choisit. */
export function fournisseurFichiers(repertoire_run: string): FournisseurExistences {
  const index = lireExistences(repertoireLiens(repertoire_run));
  return {
    existencesDe: (_reponse_id, liens) =>
      [...new Set(liens)].flatMap((lien) => {
        const existence = index.get(lien);
        return existence === undefined ? [] : [existence];
      }),
  };
}
