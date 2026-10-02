/**
 * Le run simulé de `pnpm run:dry` : un run d'interrogation complet contre l'éditeur simulé, sans
 * réseau ni SDK, dans une fenêtre de 48 heures parcourue en temps virtuel.
 *
 * Entrées, toutes validées à la frontière :
 *   - `perimetre.yaml`, chargé par `pipeline/questions/charger-perimetre.ts` (même chargeur que
 *     `config/perimetre.yaml`) ;
 *   - `questions.json`, chaque question validée contre `schema/question.schema.json` ;
 *   - `run-simule.json` : identifiant du run, début de fenêtre, clé d'API fictive, alias aveugles,
 *     profil d'éditeur simulé de chaque outil interrogé.
 *
 * Sortie : la disposition de `runs/README.md` sous la racine donnée — jamais `runs/` par défaut —
 * et chaque réponse validée contre `schema/reponse.schema.json` au moment de son écriture.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import { chargerPerimetre } from "../questions/charger-perimetre.ts";
import type { Question } from "../questions/types.ts";
import { bilanParCouple, type LigneBilan } from "./bilan.ts";
import type { Editeur } from "./editeur.ts";
import { adaptateurSimule, scenarioParEmpreinte, TransportSimule } from "./editeur-simule.ts";
import { estObjetJson } from "./editeur.ts";
import { executerRun, type BilanExecution } from "./executer.ts";
import { ouvrirFenetre } from "./fenetre.ts";
import { HorlogeVirtuelle } from "./horloge.ts";
import { planifier } from "./plan.ts";
import { DepotReponses, dispositionRun, type DispositionRun } from "./stockage.ts";

interface ParametresSimulation {
  readonly run_id: string;
  readonly fenetre_debut: string;
  readonly cle_api: string;
  readonly alias_aveugles: ReadonlyMap<string, string>;
  readonly profils: ReadonlyMap<string, readonly string[]>;
}

export interface ResultatRunSimule {
  readonly disposition: DispositionRun;
  readonly execution: BilanExecution;
  readonly bilan: readonly LigneBilan[];
}

function exigerTexte(objet: Readonly<Record<string, unknown>>, cle: string, provenance: string): string {
  const valeur = objet[cle];
  if (typeof valeur !== "string" || valeur.length === 0) throw new Error(`${provenance} : « ${cle} » absent ou vide.`);
  return valeur;
}

function exigerTable<T>(objet: Readonly<Record<string, unknown>>, cle: string, provenance: string, lire: (v: unknown) => T | null): ReadonlyMap<string, T> {
  const table = objet[cle];
  if (!estObjetJson(table)) throw new Error(`${provenance} : « ${cle} » n'est pas un objet.`);
  return new Map(
    Object.entries(table).map(([outil, valeur]) => {
      const lue = lire(valeur);
      if (lue === null) throw new Error(`${provenance} : « ${cle}.${outil} » mal formé.`);
      return [outil, lue] as const;
    }),
  );
}

function texteOuNull(valeur: unknown): string | null {
  return typeof valeur === "string" ? valeur : null;
}

function listeDeTextesOuNull(valeur: unknown): readonly string[] | null {
  return Array.isArray(valeur) && valeur.every((v) => typeof v === "string") ? valeur : null;
}

function lireParametres(chemin: string): ParametresSimulation {
  const brut: unknown = JSON.parse(readFileSync(chemin, "utf8"));
  if (!estObjetJson(brut)) throw new Error(`${chemin} : pas un objet JSON.`);
  return {
    run_id: exigerTexte(brut, "run_id", chemin),
    fenetre_debut: exigerTexte(brut, "fenetre_debut", chemin),
    cle_api: exigerTexte(brut, "cle_api", chemin),
    alias_aveugles: exigerTable(brut, "alias_aveugles", chemin, texteOuNull),
    profils: exigerTable(brut, "profils", chemin, listeDeTextesOuNull),
  };
}

function lireQuestions(chemin: string): readonly Question[] {
  const brut: unknown = JSON.parse(readFileSync(chemin, "utf8"));
  if (!Array.isArray(brut)) throw new Error(`${chemin} : une liste de questions est attendue.`);
  return brut.map((question, rang) => valider<Question>("question", question, `${chemin}[${rang}]`));
}

function editeursSimules(
  outils: readonly string[],
  parametres: ParametresSimulation,
  horloge: HorlogeVirtuelle,
): ReadonlyMap<string, Editeur> {
  return new Map(
    outils.map((outil_id) => {
      const profil = parametres.profils.get(outil_id);
      if (profil === undefined) throw new Error(`Aucun profil d'éditeur simulé pour ${outil_id}.`);
      const editeur: Editeur = {
        adaptateur: adaptateurSimule(parametres.cle_api),
        transport: new TransportSimule(horloge, scenarioParEmpreinte(profil)),
      };
      return [outil_id, editeur] as const;
    }),
  );
}

export interface OptionsRunSimule {
  /** Racine sous laquelle le run est disposé (`<racine>/<date>/volume/…`). */
  readonly sortie: string;
  /** Répertoire des fixtures : `perimetre.yaml`, `questions.json`, `run-simule.json`. */
  readonly fixtures: string;
}

export async function lancerRunSimule(options: OptionsRunSimule): Promise<ResultatRunSimule> {
  const { fixtures } = options;
  const parametres = lireParametres(join(fixtures, "run-simule.json"));
  const perimetre = chargerPerimetre(join(fixtures, "perimetre.yaml"), {
    items: [],
    mesures: [],
    alias_aveugles: parametres.alias_aveugles,
  });
  const plan = planifier(perimetre.perimetre.outils, lireQuestions(join(fixtures, "questions.json")));
  const fenetre = ouvrirFenetre(parametres.fenetre_debut);
  const horloge = new HorlogeVirtuelle(fenetre.debut_ms);
  const disposition = dispositionRun(options.sortie, perimetre.date_gel);
  const depot = DepotReponses.ouvrir(disposition.reponses);
  const execution = await executerRun(plan, {
    run_id: parametres.run_id,
    fenetre,
    horloge,
    depot,
    repertoire_tentatives: disposition.tentatives,
    editeurs: editeursSimules([...plan.keys()], parametres, horloge),
  });
  return { disposition, execution, bilan: bilanParCouple(depot.toutes()) };
}
