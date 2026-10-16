/**
 * Le run précédent d'un gel (décision D45 (3), §5 : « 80 % des questions sont reprises du run
 * précédent »). C'est le run de `runs/` dont la `date_gel` est la plus récente strictement avant
 * la nôtre, hors `statut` `invalide` et hors `type_run` `pilote`. Il est inscrit dans
 * `run.json#/run_precedent` ; son absence y est déclarée par `null`, jamais omise.
 *
 * Partie pure : `choisirPrecedent` (le choix, sur des `run.json` déjà lus) et `tiragePrecedentVerifie`
 * (des octets de son `tirage.json` et du contenu de son `questions.json` au `TiragePrecedent` que
 * `tirage.ts:tirer` reçoit). Partie lue, mince : `lirePrecedent`.
 *
 * Chaque répertoire de `runs/` doit porter un `run.json` lisible : un seul illisible, et le gel ne
 * peut plus dire quel run est le précédent. Tout défaut est un refus nommé (`PrecedentRefuse`),
 * jamais « pas de précédent » :
 *   - `run_illisible` : un `run.json` absent, qui n'est pas du JSON, ou dont un champ lu n'est pas
 *     conforme à `run.schema.json` ;
 *   - `precedent_ambigu` : deux runs retenables à la même `date_gel` ;
 *   - `chemin_incoherent` : le tirage déclaré n'est pas `runs/<son répertoire>/tirage.json` ;
 *   - `tirage_illisible` : le tirage absent, illisible ou non conforme à `tirage.schema.json` ;
 *   - `empreinte_differente` : le SHA-256 des octets du tirage n'est pas celui que son `run.json`
 *     déclare ;
 *   - `tirage_d_un_autre_run` : `tirage.run_id` n'est pas l'`id` de son `run.json` ;
 *   - `questions_illisibles` : `questions.json` absent, illisible, ou une question non conforme ;
 *   - `question_introuvable` : une question tirée absente de `questions.json`.
 *
 * Seuls les champs que le choix lit sont validés dans chaque `run.json` (fragments de
 * `run.schema.json`) : un run gelé sous un schéma plus ancien reste lisible pour ce qu'on en lit.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ErreurSchema, validerFragment, valider } from "../../outils/schemas/valider.ts";
import type { PointeurDeSchema } from "../../outils/schemas/valider.ts";
import { lireInstant } from "../interrogation/heure-paris.ts";
import { tiragePrecedentDepuis } from "../questions/tirage.ts";
import type { TiragePrecedent } from "../questions/tirage.ts";
import type { Question, Tirage } from "../questions/types.ts";

export type MotifPrecedent =
  | "run_illisible"
  | "precedent_ambigu"
  | "chemin_incoherent"
  | "tirage_illisible"
  | "empreinte_differente"
  | "tirage_d_un_autre_run"
  | "questions_illisibles"
  | "question_introuvable";

export class PrecedentRefuse extends Error {
  readonly motif: MotifPrecedent;
  /** Le répertoire de `runs/` en cause. */
  readonly run: string;

  constructor(motif: MotifPrecedent, run: string, detail: string) {
    super(`Run précédent refusé (${motif}, runs/${run}, décision D45 (3)) : ${detail} Rien n'est écrit.`);
    this.name = "PrecedentRefuse";
    this.motif = motif;
    this.run = run;
  }
}

/** Ce que le choix lit d'un `run.json` de `runs/`, chaque champ validé contre son fragment. */
export interface RunDeRuns {
  /** Le nom du répertoire sous `runs/`, `AAAA-MM-JJ`. */
  readonly repertoire: string;
  readonly id: string;
  readonly date_gel_ms: number;
  readonly type_run: string;
  readonly statut: string;
  readonly tirage: { readonly chemin: string; readonly sha256: string };
}

/** `run.json#/run_precedent` quand un précédent existe. */
export interface RunPrecedent {
  readonly id: string;
  readonly tirage: { readonly chemin: string; readonly sha256: string };
}

/** Ce que le gel retient : l'inscription de `run.json` et l'entrée du tirage, ensemble. */
export interface PrecedentDuGel {
  readonly run_precedent: RunPrecedent | null;
  readonly tirage_precedent: TiragePrecedent | undefined;
}

/** Aucun précédent : déclaré dans `run.json`, tirage sans reprise. */
export const SANS_PRECEDENT: PrecedentDuGel = { run_precedent: null, tirage_precedent: undefined };

/** D45 (3) : ni un run invalidé, ni un pilote ne servent de précédent. */
const STATUTS_EXCLUS: ReadonlySet<string> = new Set(["invalide"]);
const TYPES_EXCLUS: ReadonlySet<string> = new Set(["pilote"]);

function retenable(run: RunDeRuns, date_gel_ms: number): boolean {
  return run.date_gel_ms < date_gel_ms && !STATUTS_EXCLUS.has(run.statut) && !TYPES_EXCLUS.has(run.type_run);
}

/**
 * Le run retenable de `date_gel` la plus récente strictement avant `date_gel_ms`, ou `null`. Deux
 * runs retenables à cette même `date_gel` : refus, aucun n'est choisi au hasard.
 */
export function choisirPrecedent(runs: readonly RunDeRuns[], date_gel_ms: number): RunDeRuns | null {
  const candidats = runs.filter((run) => retenable(run, date_gel_ms));
  if (candidats.length === 0) return null;
  const plus_recent = Math.max(...candidats.map((run) => run.date_gel_ms));
  const retenus = candidats.filter((run) => run.date_gel_ms === plus_recent).sort((a, b) => a.repertoire.localeCompare(b.repertoire));
  const [premier, second] = retenus;
  if (premier === undefined) return null;
  if (second !== undefined) {
    throw new PrecedentRefuse("precedent_ambigu", premier.repertoire, `runs/${second.repertoire} a la même date_gel.`);
  }
  return premier;
}

/* -------------------------------------------------------- lecture d'un run */

/** Le message d'une erreur de lecture attendue (JSON, schéma, fichier) ; toute autre est relevée. */
function messageAttendu(erreur: unknown): string {
  if (erreur instanceof SyntaxError || erreur instanceof ErreurSchema) return erreur.message;
  if (erreur instanceof Error && "code" in erreur && erreur.code === "ENOENT") return erreur.message;
  throw erreur;
}

function ou<T>(motif: MotifPrecedent, repertoire: string, lire: () => T): T {
  try {
    return lire();
  } catch (erreur) {
    throw new PrecedentRefuse(motif, repertoire, messageAttendu(erreur));
  }
}

function fragment<T>(objet: Record<string, unknown>, cle: string, provenance: string): T {
  const pointeur: PointeurDeSchema = `#/properties/${cle}`;
  return validerFragment<T>("run", pointeur, objet[cle], `${provenance}, ${cle}`);
}

function objetJson(texte: string): Record<string, unknown> {
  const valeur: unknown = JSON.parse(texte);
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
    throw new SyntaxError("run.json n'est pas un objet JSON.");
  }
  return valeur as Record<string, unknown>;
}

/** Le `run.json` d'un répertoire de `runs/`, lu dans ses seuls champs utiles. */
export function runDeRuns(repertoire: string, texte: string, provenance: string): RunDeRuns {
  return ou("run_illisible", repertoire, () => {
    const objet = objetJson(texte);
    const date_gel = fragment<string>(objet, "date_gel", provenance);
    return {
      repertoire,
      id: fragment<string>(objet, "id", provenance),
      date_gel_ms: lireInstant(date_gel, `${provenance}, date_gel`),
      type_run: fragment<string>(objet, "type_run", provenance),
      statut: fragment<string>(objet, "statut", provenance),
      tirage: fragment<{ chemin: string; sha256: string }>(objet, "tirage", provenance),
    };
  });
}

/* ------------------------------------------------- du précédent au tirage */

function sha256(octets: Uint8Array): string {
  return createHash("sha256").update(octets).digest("hex");
}

export function cheminDuTirage(repertoire: string): string {
  return `runs/${repertoire}/tirage.json`;
}

function exigerCheminCoherent(run: RunDeRuns): void {
  const attendu = cheminDuTirage(run.repertoire);
  if (run.tirage.chemin === attendu) return;
  throw new PrecedentRefuse("chemin_incoherent", run.repertoire, `tirage.chemin vaut « ${run.tirage.chemin} », attendu « ${attendu} ».`);
}

function exigerEmpreinte(run: RunDeRuns, octets: Uint8Array): void {
  const lue = sha256(octets);
  if (lue === run.tirage.sha256) return;
  throw new PrecedentRefuse(
    "empreinte_differente",
    run.repertoire,
    `SHA-256 de ${run.tirage.chemin} : ${lue} ; son run.json déclare ${run.tirage.sha256}.`,
  );
}

function tirageLu(run: RunDeRuns, octets: Uint8Array): Tirage {
  const tirage = ou("tirage_illisible", run.repertoire, () =>
    valider<Tirage>("tirage", JSON.parse(new TextDecoder().decode(octets)), run.tirage.chemin),
  );
  if (tirage.run_id === run.id) return tirage;
  throw new PrecedentRefuse("tirage_d_un_autre_run", run.repertoire, `tirage.run_id vaut ${tirage.run_id}, run.json#/id vaut ${run.id}.`);
}

function questionsLues(run: RunDeRuns, questions_brutes: unknown): readonly Question[] {
  const provenance = `runs/${run.repertoire}/questions.json`;
  return ou("questions_illisibles", run.repertoire, () => {
    if (!Array.isArray(questions_brutes)) throw new SyntaxError(`${provenance} n'est pas un tableau.`);
    return questions_brutes.map((question: unknown, rang) => valider<Question>("question", question, `${provenance}[${rang}]`));
  });
}

function exigerQuestionsTirees(run: RunDeRuns, tirage: Tirage, questions: readonly Question[]): void {
  const connues = new Set(questions.map((question) => question.id));
  const absentes = tirage.entrees.map((entree) => entree.question_id).filter((id) => !connues.has(id));
  if (absentes.length === 0) return;
  throw new PrecedentRefuse("question_introuvable", run.repertoire, `question(s) tirée(s) absente(s) de questions.json : ${absentes.join(", ")}.`);
}

/**
 * Des octets du tirage précédent et du contenu de son `questions.json` au `TiragePrecedent` :
 * chemin cohérent, empreinte égale à celle que son `run.json` déclare, tirage conforme et de ce
 * run, chaque question tirée présente. La signature de chaque question (`signature.ts`) est
 * calculée sur la question telle que le run précédent l'a posée.
 */
export function tiragePrecedentVerifie(run: RunDeRuns, octets_tirage: Uint8Array, questions_brutes: unknown): TiragePrecedent {
  exigerCheminCoherent(run);
  exigerEmpreinte(run, octets_tirage);
  const tirage = tirageLu(run, octets_tirage);
  const questions = questionsLues(run, questions_brutes);
  exigerQuestionsTirees(run, tirage, questions);
  return tiragePrecedentDepuis(tirage, questions);
}

/* ---------------------------------------------------------------- lecture */

function lireRunsDuDepot(runs: string): readonly RunDeRuns[] {
  if (!existsSync(runs)) return [];
  return readdirSync(runs, { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .map((entree) => {
      const chemin = join(runs, entree.name, "run.json");
      const texte = ou("run_illisible", entree.name, () => readFileSync(chemin, "utf8"));
      return runDeRuns(entree.name, texte, chemin);
    });
}

/**
 * Lit `runs/` sous `racine`, choisit le précédent, vérifie et lit son tirage et ses questions. Le
 * gel lit toujours `runs/` du dépôt, `--sortie` ou non : le précédent d'un essai est celui qu'aurait
 * le vrai run.
 */
export function lirePrecedent(racine: string, date_gel_ms: number): PrecedentDuGel {
  const run = choisirPrecedent(lireRunsDuDepot(join(racine, "runs")), date_gel_ms);
  if (run === null) return SANS_PRECEDENT;
  exigerCheminCoherent(run);
  const repertoire = join(racine, "runs", run.repertoire);
  const octets = ou("tirage_illisible", run.repertoire, () => new Uint8Array(readFileSync(join(repertoire, "tirage.json"))));
  const questions: unknown = ou("questions_illisibles", run.repertoire, () => JSON.parse(readFileSync(join(repertoire, "questions.json"), "utf8")));
  return {
    run_precedent: { id: run.id, tirage: { chemin: run.tirage.chemin, sha256: run.tirage.sha256 } },
    tirage_precedent: tiragePrecedentVerifie(run, octets, questions),
  };
}
