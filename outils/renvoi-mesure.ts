/**
 * `pnpm mesures --renvoyer=<mesure> [--ecrire]` — le renvoi en attente qui suit une correction de
 * thème acceptée (protocole 0.13, §4 « Correction de thème », conformité n° 69).
 *
 * La commande lit `staging/`, les lots, les journaux, le registre des corrections et `data/items`
 * (en lecture), confie le tri à `validation/domaine/renvoi-mesure.ts`, et rapporte :
 *
 * - les items **renvoyés en attente**, réécrits en `staging/` avec `--ecrire`, épinglés sur la
 *   nouvelle version de la mesure : le lot qui les a jugés ne les juge plus, ils rentrent dans la
 *   réserve d'un prochain lot ;
 * - les **demandeurs**, que leur lot juge et que la promotion épinglera sur la nouvelle version ;
 * - les items dont le lot n'a pas fini (**décisions incomplètes**) et ceux **déjà publiés** : ils
 *   sont nommés, non écrits, et la commande sort en erreur. Les premiers se renvoient par une
 *   relance une fois leur lot terminé ; les seconds relèvent d'une décision de l'auteur.
 *
 * Mêmes garde-fous que `pnpm promote` : simulation par défaut, `--ecrire` sur un arbre Git propre,
 * HEAD inscrit dans l'historique de chaque item renvoyé, aucun commit. Rien n'est écrit dans
 * `data/`, rien n'est effacé du journal. Relancer ne fait rien de plus : un item déjà épinglé sur la
 * version courante n'est plus planifié.
 */

import { commandeGit, commitCourant, ecriturePermise } from "./garde-fous-git.ts";
import { lotsApresSupersession, type LotEffectif } from "../validation/domaine/lot.ts";
import {
  correctionAppliquee,
  lotJugeEncore,
  planifierRenvois,
  repinglerSurMesure,
  RenvoiSansCorrectionAppliquee,
  type JugementEnCours,
  type Renvoi,
  type SortRenvoi,
  type TraceRenvoi,
} from "../validation/domaine/renvoi-mesure.ts";
import type { DecisionCorrectionMesure } from "../validation/domaine/corrections-mesure.ts";
import type { EntreeDecision, Item, Mesure } from "../validation/domaine/types.ts";
import { lireItemsData } from "../validation/io/data-items.ts";
import { etatsDuLot } from "../validation/io/lecture-croisee.ts";
import { lireLots } from "../validation/io/lots-fichier.ts";
import { lireRegistre } from "../validation/io/mesures-fichier.ts";
import { chargerStaging, type Staging } from "../validation/io/staging.ts";
import { reecrireItemStaging } from "../validation/io/staging-renvoi.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";

export interface OptionsRenvoi {
  readonly mesure_id: string;
  readonly ecrire: boolean;
  readonly racine: string;
  readonly staging: string;
  readonly lots: string;
  readonly decisions: string;
  readonly mesures: string;
  readonly data: string;
}

function mesureCourante(staging: Staging, mesure_id: string): Mesure {
  const mesure = staging.mesures.get(mesure_id);
  if (mesure === undefined) throw new Error(`Mesure ${mesure_id} introuvable dans ${staging.racine}.`);
  return mesure;
}

/* ------------------------------------------------------------------ lecture */

/** Items de la mesure qu'un lot juge encore, avec ses décisions actives. */
function jugementsDeLaMesure(staging: Staging, mesure: Mesure, options: OptionsRenvoi): ReadonlyMap<string, JugementEnCours> {
  const jugements = new Map<string, JugementEnCours>();
  for (const effectif of lotsApresSupersession(lireLots(options.lots))) {
    const concernes = itemsJugesDeLaMesure(effectif, staging, mesure);
    if (concernes.length === 0) continue;
    const etats = etatsDuLot(options.decisions, effectif.lot);
    for (const item of concernes) ajouterJugement(jugements, item, effectif, [...etats.values()].flatMap((etat) => decisionDe(etat.decisions, item)));
  }
  return jugements;
}

function itemsJugesDeLaMesure(effectif: LotEffectif, staging: Staging, mesure: Mesure): readonly Item[] {
  const items: Item[] = [];
  for (const reference of effectif.items) {
    const item = staging.items.get(reference.item_id);
    if (item === undefined || item.mesure_id !== mesure.id) continue;
    if (lotJugeEncore(item, reference)) items.push(item);
  }
  return items;
}

function decisionDe(decisions: ReadonlyMap<string, EntreeDecision>, item: Item): readonly EntreeDecision[] {
  const decision = decisions.get(item.id);
  return decision === undefined ? [] : [decision];
}

function ajouterJugement(
  jugements: Map<string, JugementEnCours>,
  item: Item,
  effectif: LotEffectif,
  decisions: readonly EntreeDecision[],
): void {
  const deja = jugements.get(item.id);
  if (deja !== undefined) {
    throw new Error(`Item ${item.id} jugé à la fois par ${deja.lot_id} et ${effectif.lot.lot_id} : lots incohérents, rien n'est renvoyé.`);
  }
  jugements.set(item.id, { lot_id: effectif.lot.lot_id, annotateurs: effectif.lot.annotateurs, decisions });
}

/* ------------------------------------------------------------------- rapport */

const RUBRIQUES: readonly (readonly [SortRenvoi, string])[] = [
  ["renvoyer", "Renvoyés en attente"],
  ["demandeur", "Demandeurs, validés par leur lot et épinglés sur la nouvelle version à la promotion"],
  ["decisions_incompletes", "Encore en cours de jugement, décisions incomplètes (relancer à la fin du lot)"],
  ["publie", "Déjà publiés dans data/, non renvoyés par ce chemin (décision de l'auteur)"],
];

function imprimerRapport(mesure: Mesure, decision: DecisionCorrectionMesure, renvois: readonly Renvoi[]): void {
  process.stdout.write(
    `Mesure ${mesure.id} en version ${mesure.version}, thème « ${mesure.theme} » : correction acceptée ` +
      `au registre le ${decision.date}.\n`,
  );
  for (const [sort, titre] of RUBRIQUES) {
    const liste = renvois.filter((renvoi) => renvoi.sort === sort);
    process.stdout.write(`\n${titre} : ${liste.length}\n`);
    for (const renvoi of liste) process.stdout.write(`  ${renvoi.item.id}  [${lotAffiche(renvoi)}]\n`);
  }
}

/** `null` a un sens : l'item n'est dans aucun lot. Il est dit, pas remplacé. */
function lotAffiche(renvoi: Renvoi): string {
  return renvoi.lot_id === null ? "hors lot" : renvoi.lot_id;
}

/* ------------------------------------------------------------------ écriture */

function ecrire(mesure: Mesure, decision: DecisionCorrectionMesure, renvois: readonly Renvoi[], options: OptionsRenvoi): void {
  const trace: TraceRenvoi = { commit: commitCourant(options.racine), horodatage: instantLocal(new Date()), decision };
  const ecrits: string[] = [];
  for (const renvoi of renvois.filter((candidat) => candidat.sort === "renvoyer")) {
    reecrireItemStaging(options.staging, renvoi.item, repinglerSurMesure(renvoi.item, mesure, trace));
    ecrits.push(renvoi.item.id);
  }
  process.stdout.write(
    `\n${ecrits.length} item(s) renvoyé(s) en attente dans ${options.staging}.\n\n` +
      commandeGit(["staging/items"], `staging: renvoi en attente de ${ecrits.length} item(s), mesure ${mesure.id} v${mesure.version}`, ecrits),
  );
}

function bloques(renvois: readonly Renvoi[]): readonly Renvoi[] {
  return renvois.filter((renvoi) => renvoi.sort === "decisions_incompletes" || renvoi.sort === "publie");
}

export function renvoyer(options: OptionsRenvoi): void {
  if (options.ecrire && !ecriturePermise(options.racine)) return;
  const staging = chargerStaging(options.staging);
  const mesure = mesureCourante(staging, options.mesure_id);
  const registre = lireRegistre(options.mesures);
  // Premier contrôle : sans correction acceptée et appliquée, rien n'est lu plus loin.
  const decision = correctionAppliquee(registre, mesure);
  const renvois = planifierRenvois({
    mesure,
    items: [...staging.items.values()],
    publies: new Set(lireItemsData(options.data).keys()),
    jugements: jugementsDeLaMesure(staging, mesure, options),
    registre,
  });
  imprimerRapport(mesure, decision, renvois);

  if (!options.ecrire) process.stdout.write("\nSimulation : rien n'a été écrit. Ajouter --ecrire pour renvoyer en attente.\n");
  else ecrire(mesure, decision, renvois, options);

  if (bloques(renvois).length > 0) {
    process.stderr.write(
      "\nDes items de la mesure jugés contre l'ancien thème ne sont pas renvoyés : lot en cours ou item\n" +
        "déjà publié. Ils sont nommés ci-dessus ; les autres l'ont été (ou le seraient avec --ecrire).\n",
    );
    process.exitCode = 1;
  }
}

/** Les refus attendus : nommés, sans pile d'appels. */
export function estRefusAttendu(erreur: unknown): boolean {
  return erreur instanceof RenvoiSansCorrectionAppliquee;
}
