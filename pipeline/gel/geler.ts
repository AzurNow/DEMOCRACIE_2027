/**
 * `pnpm geler` sans la ligne de commande : lit, assemble, passe la barrière, écrit — dans cet
 * ordre, et rien n'est écrit tant qu'un contrôle peut encore échouer.
 *
 * 1. Dépôt propre, ou refus avant toute lecture coûteuse (`depot.ts`) ; HEAD est le commit inscrit.
 * 2. Lectures : `config/gel.json`, `data/items/` et `data/mesures/` (les lecteurs de la barrière,
 *    chaque fichier validé contre son schéma), `data/formulations/` (son seul lecteur,
 *    `validation/io/data-formulations.ts`), `config/perimetre.yaml`.
 * 3. Périmètre, fenêtre, questions (`assemblage.ts:preparer`) ; destination libre, ou refus
 *    (`destination.ts`).
 * 4. Graines (le port), identifiant, tirage.
 * 5. La barrière de `pnpm symmetry`, les mêmes fonctions (`barriere.ts:jugerBarriere`), items et
 *    mesures recoupés avec le commit inscrit. Bloquée — refus nommé, symétrie rouge, invariant
 *    violé — : `GelBloque`, rien n'est écrit (règle 4). `ecart_tolere` : le gel continue, l'écart
 *    est inscrit dans `run.json#/symetrie`.
 * 6. Les trois fichiers, écrits tout ou rien (`ecriture.ts`).
 *
 * Le gel lit `data/` et n'y écrit jamais (règle 3) : il écrit sous `runs/` ou sous la sortie demandée.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { lireFormulationsData } from "../../validation/io/data-formulations.ts";
import type { Violation } from "../questions/invariants.ts";
import type { Item, Mesure, Question, Symetrie, Tirage } from "../questions/types.ts";
import type { FormulationsValidees } from "../reformulation/relecture.ts";
import { fichiersDuGel, preparer, runAuGel, tirerAuGel } from "./assemblage.ts";
import type { EntreesGel } from "./assemblage.ts";
import { estUnRefus, jugerBarriere, lireRepertoire } from "./barriere.ts";
import type { Refus, VerdictBarriere } from "./barriere.ts";
import { lireConfigurationGel } from "./configuration.ts";
import { exigerDepotPropre } from "./depot.ts";
import { destinationDuRun } from "./destination.ts";
import { ecrireToutOuRien } from "./ecriture.ts";
import type { EcrireFichier } from "./ecriture.ts";
import type { SourceDeGraines } from "./graines.ts";

export interface OptionsGel {
  /** La racine du dépôt lu : `data/`, `config/`, et `runs/` quand `sortie` est absente. */
  readonly racine: string;
  /** Absente : `runs/` du dépôt (gel réel, l'auteur seul). Présente : hors de `runs/`. */
  readonly sortie: string | undefined;
  readonly type_run: string;
  readonly source_graines: SourceDeGraines;
  /** L'identifiant (ULID) du run. */
  readonly identifiant: () => string;
  readonly ecrire: EcrireFichier;
}

export interface ResultatGel {
  readonly repertoire: string;
  readonly run_id: string;
  readonly commit: string;
  readonly symetrie: Symetrie;
  readonly questions: readonly Question[];
  readonly tirage: Tirage;
}

/** La barrière refuse le run : rien n'est écrit. */
export class GelBloque extends Error {
  readonly verdict: VerdictBarriere;

  constructor(verdict: VerdictBarriere) {
    super(`Gel refusé par la barrière de symétrie (§5, règle 4) ; rien n'est écrit.\n${motifsDuBlocage(verdict).join("\n")}`);
    this.name = "GelBloque";
    this.verdict = verdict;
  }
}

function motifsDeSymetrie(symetrie: Symetrie | Refus): readonly string[] {
  if (estUnRefus(symetrie)) return [`  symétrie non évaluée — ${symetrie.name} : ${symetrie.message}`];
  return symetrie.conditions
    .filter((condition) => condition.statut === "rouge")
    .map((condition) => `  rouge ${condition.code}${condition.commentaire === undefined ? "" : ` : ${condition.commentaire}`}`);
}

function motifDeViolation(violation: Violation): string {
  return `  invariant ${violation.invariant} — ${violation.objet} : ${violation.detail}`;
}

function motifsDuBlocage(verdict: VerdictBarriere): readonly string[] {
  return [...motifsDeSymetrie(verdict.symetrie), ...verdict.violations.map(motifDeViolation)];
}

interface Disposition {
  readonly items: string;
  readonly mesures: string;
  readonly formulations: string;
  readonly perimetre: string;
  readonly configuration: string;
}

function disposition(racine: string): Disposition {
  return {
    items: join(racine, "data", "items"),
    mesures: join(racine, "data", "mesures"),
    formulations: join(racine, "data", "formulations"),
    perimetre: join(racine, "config", "perimetre.yaml"),
    configuration: join(racine, "config", "gel.json"),
  };
}

function lireFormulations(repertoire: string): ReadonlyMap<string, FormulationsValidees> {
  return new Map([...lireFormulationsData(repertoire)].map(([question_id, lues]) => [question_id, lues.formulations]));
}

function lireEntrees(chemins: Disposition): EntreesGel {
  const configuration = lireConfigurationGel(chemins.configuration);
  const items = lireRepertoire<Item>("item", chemins.items, "d'item");
  const mesures = lireRepertoire<Mesure>("mesure", chemins.mesures, "de mesure");
  const formulations = lireFormulations(chemins.formulations);
  const perimetre_brut: unknown = parse(readFileSync(chemins.perimetre, "utf8"));
  return { perimetre_brut, provenance_perimetre: chemins.perimetre, configuration, items, mesures, formulations };
}

export async function geler(options: OptionsGel): Promise<ResultatGel> {
  const commit = exigerDepotPropre(options.racine);
  const chemins = disposition(options.racine);
  const entrees = lireEntrees(chemins);
  const prepare = preparer(entrees);
  const destination = destinationDuRun(options.racine, options.sortie, prepare.date_repertoire);

  const valeurs = await options.source_graines.graines();
  const tire = tirerAuGel(prepare, entrees, options.identifiant(), valeurs);
  const verdict = jugerBarriere({
    repertoire_items: chemins.items,
    repertoire_mesures: chemins.mesures,
    tirage: tire.resultat.tirage,
    questions: prepare.questions,
    items: entrees.items,
    mesures: entrees.mesures,
    run: { ...runAuGel(prepare, tire.run_id), versions: { donnees_commit: commit } },
  });
  if (verdict.bloque || estUnRefus(verdict.symetrie)) throw new GelBloque(verdict);

  const symetrie = verdict.symetrie;
  const fichiers = fichiersDuGel(prepare, entrees, tire, { type_run: options.type_run, commit, symetrie });
  const repertoire = ecrireToutOuRien(destination, fichiers, options.ecrire);
  return { repertoire, run_id: tire.run_id, commit, symetrie, questions: prepare.questions, tirage: tire.resultat.tirage };
}
