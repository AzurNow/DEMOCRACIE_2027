/**
 * L'inscription du test contrefactuel dans `run.json` (§7 ; `publication-contrefactuel.ts` rend les
 * champs, « l'appelant les écrit dans le run »).
 *
 * Ce qui est écrit : le bloc `contrefactuel_candidats`, le taux de l'échantillon humain, et, pour
 * chaque juge, les champs que le test fixe (`retire`, `motif_retrait`, `taux_changement_contrefactuel`,
 * `changements_contrefactuel`) ; tout autre champ du run et de ses juges est recopié tel quel. Le
 * run fusionné est validé contre `schema/run.schema.json` avant d'être écrit, par un fichier
 * temporaire synchronisé puis renommé : `run.json` n'est jamais à moitié écrit.
 *
 * **Une seule fois.** Un `run.json` qui porte déjà `contrefactuel_candidats` n'est jamais réécrit :
 * si la fusion recalculée lui est identique (forme canonique), c'est une reprise, et rien n'est
 * écrit ; sinon, `ContrefactuelDejaInscrit` lève, et rien n'est écrit non plus. Un résultat de test
 * ne se corrige pas en silence.
 *
 * **Run invalide** (D16 (3), les deux juges retirés) : non inscrit ici. Le schéma exige d'un run
 * invalide sa publication et son dépôt (§12), que la notation ne connaît pas : `InscriptionImpossible`.
 */

import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dispositionRunNote } from "../../analysis/lecture-run.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import type { JugePublie, PublicationContrefactuel } from "./publication-contrefactuel.ts";

export type IssueInscription = "inscrit" | "deja_inscrit";

export class ContrefactuelDejaInscrit extends Error {
  constructor(chemin: string) {
    super(`${chemin} porte déjà un test contrefactuel différent de celui que la notation recalcule : rien n'est réécrit (règle 7).`);
    this.name = "ContrefactuelDejaInscrit";
  }
}

export class InscriptionImpossible extends Error {
  constructor(detail: string) {
    super(`Test contrefactuel non inscrit dans run.json : ${detail}`);
    this.name = "InscriptionImpossible";
  }
}

type Objet = Readonly<Record<string, unknown>>;

/** Les champs d'un juge que le test fixe : retirés de l'ancien juge avant la fusion. */
export const CHAMPS_DU_TEST = ["retire", "motif_retrait", "taux_changement_contrefactuel", "changements_contrefactuel", "paires_ecartees_contrefactuel", "motif_indefini_contrefactuel"] as const;

export function inscrireContrefactuel(repertoire_run: string, publication: PublicationContrefactuel): IssueInscription {
  if (publication.statut !== undefined) {
    throw new InscriptionImpossible("les deux juges sont retirés (D16 (3)) ; un run invalide exige sa publication et son dépôt (§12), que la notation ne connaît pas.");
  }
  const chemin = dispositionRunNote(repertoire_run).run_json;
  const actuel = JSON.parse(readFileSync(chemin, "utf8")) as Objet;
  const fusionne = fusionner(actuel, publication);
  if (actuel["contrefactuel_candidats"] !== undefined) {
    if (canoniser(fusionne) !== canoniser(actuel)) throw new ContrefactuelDejaInscrit(chemin);
    return "deja_inscrit";
  }
  valider("run", fusionne, `${chemin} après inscription du test contrefactuel`);
  ecrireParRenommage(chemin, fusionne);
  return "inscrit";
}

function fusionner(run: Objet, publication: PublicationContrefactuel): Objet {
  const juges = run["juges"];
  if (!Array.isArray(juges)) throw new InscriptionImpossible("run.json sans tableau juges.");
  return {
    ...run,
    juges: juges.map((juge: Objet) => jugeFusionne(juge, publication.juges)),
    taux_echantillon_humain: publication.taux_echantillon_humain,
    contrefactuel_candidats: publication.contrefactuel_candidats,
  };
}

function jugeFusionne(juge: Objet, publies: readonly JugePublie[]): Objet {
  const publie = publies.find((p) => p.juge_id === juge["juge_id"]);
  if (publie === undefined) throw new InscriptionImpossible(`le juge ${String(juge["juge_id"])} du run n'a pas de résultat publié.`);
  const conserve = Object.fromEntries(Object.entries(juge).filter(([cle]) => !(CHAMPS_DU_TEST as readonly string[]).includes(cle)));
  return { ...conserve, ...publie };
}

function ecrireParRenommage(chemin: string, valeur: unknown): void {
  const temporaire = `${chemin}.inscription`;
  const descripteur = openSync(temporaire, "wx");
  try {
    writeSync(descripteur, `${JSON.stringify(valeur, null, 2)}\n`);
    fsyncSync(descripteur);
  } finally {
    closeSync(descripteur);
  }
  renameSync(temporaire, chemin);
}
