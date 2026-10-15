/**
 * `data/mesures/` sur disque : les mesures validées, un fichier par mesure dans sa version courante
 * (décision D38 du 2026-10-15, option (a)). Elles y entrent avec les items qui les citent, par
 * `pnpm promote --ecrire`, et par aucun autre chemin (règle 3 de `CLAUDE.md`). Quand la version
 * d'une mesure augmente, la promotion réécrit son fichier : l'historique Git garde les versions
 * antérieures, il n'y a pas de fichier par version.
 *
 * Calqué sur `data-items.ts` :
 *
 * - `lireMesuresData` confronte chaque fichier à `mesure.schema.json`, exige que son nom soit l'id
 *   de la mesure qu'il porte, et rend l'empreinte des octets lus ;
 * - `creerMesure` écrit une mesure nouvelle, et refuse si elle existe déjà ;
 * - `reecrireMesure` refuse si le fichier a changé depuis sa lecture, si la version n'augmente pas,
 *   ou si la mesure à écrire n'est pas conforme au schéma ;
 * - `planifierMesures` dit, avant toute écriture, ce que la promotion ferait de chaque mesure citée
 *   et ce qui l'en empêche. Il n'écrit rien.
 *
 * Toute écriture est atomique : un temporaire du même répertoire, puis un lien (création) ou un
 * renommage (réécriture).
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { erreurDeSchema, valider } from "../../outils/schemas/valider.ts";
import { canoniser } from "../domaine/empreinte.ts";
import type { Item, Mesure } from "../domaine/types.ts";
import { FichierModifieDepuisLecture } from "./data-items.ts";

export interface MesureLue {
  readonly mesure: Mesure;
  /** sha256 des octets du fichier au moment de la lecture : la réécriture le compare. */
  readonly empreinte_fichier: string;
}

export class MesureDejaDansData extends Error {
  constructor(chemin: string) {
    super(`Mesure déjà présente dans data/ : ${chemin}. Une mesure publiée n'est jamais recréée.`);
    this.name = "MesureDejaDansData";
  }
}

export class FichierMesureMalNomme extends Error {
  constructor(chemin: string, mesure_id: string) {
    super(`${chemin} porte la mesure ${mesure_id} : le fichier d'une mesure se nomme <id>.json.`);
    this.name = "FichierMesureMalNomme";
  }
}

export class ReecritureMesureSansVersionSuperieure extends Error {
  constructor(chemin: string, avant: number, apres: number) {
    super(
      `${chemin} : réécriture de la version ${avant} par la version ${apres}. Une mesure publiée ne se ` +
        `réécrit que vers une version supérieure.`,
    );
    this.name = "ReecritureMesureSansVersionSuperieure";
  }
}

export function cheminMesure(repertoire: string, mesure_id: string): string {
  return join(repertoire, `${mesure_id}.json`);
}

function empreinteOctets(octets: Buffer): string {
  return createHash("sha256").update(octets).digest("hex");
}

function lireFichier(chemin: string): MesureLue {
  const octets = readFileSync(chemin);
  const mesure = valider<Mesure>("mesure", JSON.parse(octets.toString("utf8")) as unknown, chemin);
  return { mesure, empreinte_fichier: empreinteOctets(octets) };
}

/** Toutes les mesures publiées, chacune validée. Un répertoire absent est un `data/` sans mesure. */
export function lireMesuresData(repertoire: string): ReadonlyMap<string, MesureLue> {
  const table = new Map<string, MesureLue>();
  if (!existsSync(repertoire)) return table;
  for (const nom of readdirSync(repertoire).sort()) {
    if (!nom.endsWith(".json")) continue;
    const chemin = join(repertoire, nom);
    const lu = lireFichier(chemin);
    if (nom !== `${lu.mesure.id}.json`) throw new FichierMesureMalNomme(chemin, lu.mesure.id);
    table.set(lu.mesure.id, lu);
  }
  return table;
}

function ecrireAtomique(repertoire: string, mesure: Mesure, poser: (source: string, cible: string) => void): void {
  const chemin = cheminMesure(repertoire, mesure.id);
  const texte = `${JSON.stringify(valider<Mesure>("mesure", mesure, `mesure à écrire dans ${chemin}`), null, 2)}\n`;
  mkdirSync(repertoire, { recursive: true });
  const tmp = join(repertoire, `.${mesure.id}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  writeFileSync(tmp, texte, { encoding: "utf8", flag: "wx" });
  try {
    poser(tmp, chemin);
  } finally {
    rmSync(tmp, { force: true });
  }
}

export function creerMesure(repertoire: string, mesure: Mesure): void {
  const chemin = cheminMesure(repertoire, mesure.id);
  if (existsSync(chemin)) throw new MesureDejaDansData(chemin);
  ecrireAtomique(repertoire, mesure, (source, cible) => {
    try {
      linkSync(source, cible);
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code === "EEXIST") throw new MesureDejaDansData(cible);
      throw erreur;
    }
  });
}

function exigerInchange(chemin: string, lu: MesureLue): void {
  if (empreinteOctets(readFileSync(chemin)) !== lu.empreinte_fichier) throw new FichierModifieDepuisLecture(chemin);
}

/** Réécrit une mesure publiée, lue par `lireMesuresData`, vers sa version courante `apres`. */
export function reecrireMesure(repertoire: string, lu: MesureLue, apres: Mesure): void {
  const chemin = cheminMesure(repertoire, lu.mesure.id);
  exigerInchange(chemin, lu);
  if (apres.id !== lu.mesure.id || apres.version <= lu.mesure.version) {
    throw new ReecritureMesureSansVersionSuperieure(chemin, lu.mesure.version, apres.version);
  }
  ecrireAtomique(repertoire, apres, (source, cible) => {
    // Revérifié au dernier moment : la fenêtre entre la lecture et le renommage reste minimale.
    exigerInchange(cible, lu);
    renameSync(source, cible);
  });
}

/* --------------------------------------------------------------- planification */

export type MotifRefusMesure =
  | "absente_du_staging"
  | "non_conforme"
  | "meme_version_contenu_different"
  | "regression_de_version";

export interface RefusMesure {
  readonly mesure_id: string;
  readonly motif: MotifRefusMesure;
  readonly detail: string;
}

export interface PlanMesures {
  readonly creer: readonly Mesure[];
  readonly reecrire: readonly { readonly lu: MesureLue; readonly apres: Mesure }[];
  readonly identiques: readonly Mesure[];
  readonly refus: readonly RefusMesure[];
}

type Sort =
  | { readonly sort: "creer"; readonly mesure: Mesure }
  | { readonly sort: "reecrire"; readonly lu: MesureLue; readonly apres: Mesure }
  | { readonly sort: "identique"; readonly mesure: Mesure }
  | { readonly sort: "refus"; readonly refus: RefusMesure };

function refus(mesure_id: string, motif: MotifRefusMesure, detail: string): Sort {
  return { sort: "refus", refus: { mesure_id, motif, detail } };
}

/** Une mesure du staging face à sa version publiée : les cinq issues du lot mesures-validees. */
function comparer(courante: Mesure, publiee: MesureLue, chemin: string): Sort {
  const avant = publiee.mesure.version;
  if (courante.version > avant) return { sort: "reecrire", lu: publiee, apres: courante };
  if (courante.version < avant) {
    return refus(courante.id, "regression_de_version", `${chemin} est en version ${avant}, staging/ en version ${courante.version}.`);
  }
  if (canoniser(courante) === canoniser(publiee.mesure)) return { sort: "identique", mesure: courante };
  return refus(
    courante.id,
    "meme_version_contenu_different",
    `${chemin} et staging/ portent tous deux la version ${avant}, avec des contenus différents.`,
  );
}

function trier(mesure_id: string, staging: ReadonlyMap<string, Mesure>, data: ReadonlyMap<string, MesureLue>, repertoire: string): Sort {
  const chemin = cheminMesure(repertoire, mesure_id);
  const courante = staging.get(mesure_id);
  if (courante === undefined) return refus(mesure_id, "absente_du_staging", `citée par un item à promouvoir, absente de staging/mesures/.`);
  const erreur = erreurDeSchema("mesure", courante, `mesure à écrire dans ${chemin}`);
  if (erreur !== null) return refus(mesure_id, "non_conforme", erreur.message);
  const publiee = data.get(mesure_id);
  if (publiee === undefined) return { sort: "creer", mesure: courante };
  return comparer(courante, publiee, chemin);
}

/**
 * Ce que deviendrait chaque mesure citée par `items` (les items que la promotion écrirait). Une
 * mesure citée par plusieurs items n'est examinée qu'une fois. Rien n'est écrit ici.
 */
export function planifierMesures(
  items: readonly Item[],
  staging: ReadonlyMap<string, Mesure>,
  data: ReadonlyMap<string, MesureLue>,
  repertoire: string,
): PlanMesures {
  const ids = [...new Set(items.map((item) => item.mesure_id))].sort();
  const sorts = ids.map((mesure_id) => trier(mesure_id, staging, data, repertoire));
  return {
    creer: sorts.flatMap((sort) => (sort.sort === "creer" ? [sort.mesure] : [])),
    reecrire: sorts.flatMap((sort) => (sort.sort === "reecrire" ? [{ lu: sort.lu, apres: sort.apres }] : [])),
    identiques: sorts.flatMap((sort) => (sort.sort === "identique" ? [sort.mesure] : [])),
    refus: sorts.flatMap((sort) => (sort.sort === "refus" ? [sort.refus] : [])),
  };
}
