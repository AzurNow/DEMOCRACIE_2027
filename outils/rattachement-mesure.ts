/**
 * `pnpm mesures --rattacher=<item> --a=<mesure> [--date=AAAA-MM-JJ] [--ecrire]` — le rattachement
 * d'un item de staging à une autre mesure, existante (décision D53 (1) du 2026-10-16).
 *
 * La commande lit `staging/`, les lots, les journaux, le registre des rattachements et `data/items`
 * (en lecture), confie les refus et la réécriture à `validation/domaine/rattachements-item.ts`, et
 * rapporte l'item avant et après. Avec `--ecrire`, elle réécrit l'item en `staging/` sur la mesure
 * cible, puis ajoute la décision au registre publié en ajout seul
 * `validation/mesures/rattachements.json`.
 *
 * Mêmes garde-fous que `--renvoyer` (`renvoi-mesure.ts`) : simulation par défaut, `--ecrire` sur
 * un arbre Git propre, HEAD inscrit dans l'historique de l'item, aucun commit. Mêmes refus : item
 * publié, item dont le lot n'a pas fini, item non en attente ; s'y ajoute le refus d'un type
 * incompatible avec la cible (item F vers une mesure non fictive, item P, A ou O vers une mesure
 * fictive ; §4, protocole 0.17). Rien n'est écrit dans `data/`, rien
 * n'est effacé du journal, et la mesure d'avant reste en `staging/mesures/` (plus citée, elle n'est
 * pas promue). La cible doit exister en `staging/mesures/` : une mesure absente de staging n'est
 * jamais copiée depuis `data/mesures/`.
 *
 * **Ordre des écritures : staging d'abord, registre ensuite.** Tous les contrôles (refus, registre
 * lisible, entrée et item conformes à leur schéma) passent avant la première écriture. Si la
 * réécriture de l'item échoue, le registre n'a pas d'entrée orpheline : il ne trace que des
 * rattachements écrits. Reste la fenêtre où l'item est écrit et l'ajout au registre échoue (disque
 * plein, registre modifié entre-temps) : `RattachementInacheve` le dit et donne la remise en état,
 * puisque l'arbre était propre.
 */

import { commandeGit, commitCourant, ecriturePermise } from "./garde-fous-git.ts";
import { jugementsDeLaMesure } from "./renvoi-mesure.ts";
import {
  entreeRattachement,
  rattacherItem,
  validerEntreeRattachement,
  verifierRattachable,
  type RattachementItem,
} from "../validation/domaine/rattachements-item.ts";
import type { Item, Mesure } from "../validation/domaine/types.ts";
import { lireItemsData } from "../validation/io/data-items.ts";
import { ajouterRattachement, cheminRattachements, controlerAjoutRattachement } from "../validation/io/rattachements-fichier.ts";
import { chargerStaging, type Staging } from "../validation/io/staging.ts";
import { reecrireItemStaging } from "../validation/io/staging-renvoi.ts";
import { valider } from "./schemas/valider.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";

export interface OptionsRattachement {
  readonly item_id: string;
  /** La mesure cible. */
  readonly mesure_id: string;
  readonly date: string;
  readonly ecrire: boolean;
  readonly racine: string;
  readonly staging: string;
  readonly lots: string;
  readonly decisions: string;
  readonly mesures: string;
  readonly data: string;
}

/** Un item ou une mesure absents de `staging/` : nommés, jamais remplacés. */
export class IntrouvableEnStaging extends Error {
  constructor(nature: "Item" | "Mesure", id: string, racine: string) {
    super(`${nature} ${id} introuvable dans ${racine}. Rien n'est écrit.`);
    this.name = "IntrouvableEnStaging";
  }
}

/** L'item est écrit en staging, mais la décision n'a pas pu être ajoutée au registre. */
export class RattachementInacheve extends Error {
  constructor(item: Item, registre: string, cause: unknown) {
    super(
      `L'item ${item.id} a été réécrit en staging, mais le rattachement n'a pas pu être ajouté à ${registre} :\n` +
        `${cause instanceof Error ? cause.message : String(cause)}\n` +
        `L'arbre était propre : remettre l'item par « git checkout -- staging/items/${item.id}.json », ` +
        "corriger la cause, puis relancer.",
    );
    this.name = "RattachementInacheve";
  }
}

export function trouverEnStaging<T>(table: ReadonlyMap<string, T>, nature: "Item" | "Mesure", id: string, staging: Staging): T {
  const valeur = table.get(id);
  if (valeur === undefined) throw new IntrouvableEnStaging(nature, id, staging.racine);
  return valeur;
}

/* ------------------------------------------------------------------ plan */

interface PlanRattachement {
  readonly avant: Item;
  readonly mesure_avant: Mesure | undefined;
  readonly cible: Mesure;
  /** Lot qui juge encore l'item, `null` s'il n'est dans aucun lot. */
  readonly lot_id: string | null;
  readonly entree: RattachementItem;
}

function planifier(options: OptionsRattachement): PlanRattachement {
  const staging = chargerStaging(options.staging);
  const avant = trouverEnStaging(staging.items, "Item", options.item_id, staging);
  const cible = trouverEnStaging(staging.mesures, "Mesure", options.mesure_id, staging);
  const jugement = jugementsDeLaMesure(staging, { id: avant.mesure_id }, options).get(avant.id);
  verifierRattachable({ item: avant, cible, publie: lireItemsData(options.data).has(avant.id), jugement });
  const entree = validerEntreeRattachement(entreeRattachement(avant, cible, options.date), "arguments de la commande");
  // Avant toute écriture, y compris en simulation : registre lisible, entrée conforme.
  controlerAjoutRattachement(options.mesures, entree);
  return { avant, mesure_avant: staging.mesures.get(avant.mesure_id), cible, lot_id: jugement === undefined ? null : jugement.lot_id, entree };
}

/* ---------------------------------------------------------------- rapport */

function imprimerPlan(plan: PlanRattachement): void {
  process.stdout.write(
    `Item ${plan.avant.id} (candidat ${plan.avant.candidat_id}, statut ${plan.avant.statut_validation})\n` +
      `  mesure avant : ${plan.avant.mesure_id} version ${plan.avant.mesure_version}${libelle(plan.mesure_avant)}\n` +
      `  mesure après : ${plan.cible.id} version ${plan.cible.version}${libelle(plan.cible)}\n` +
      `  version de l'item : ${plan.avant.version} → ${plan.avant.version + 1}\n` +
      `  ${lotAffiche(plan.lot_id)}\n`,
  );
}

/** La mesure d'avant peut manquer en staging : c'est dit, pas comblé. */
function libelle(mesure: Mesure | undefined): string {
  return mesure === undefined ? " (absente de staging/mesures)" : ` « ${mesure.libelle} »`;
}

function lotAffiche(lot_id: string | null): string {
  if (lot_id === null) return "hors lot : l'item reste dans la réserve d'un prochain lot";
  return `jugé jusqu'au bout par ${lot_id} : ce lot ne le jugera plus, ses décisions restent au journal ; l'item retourne en attente`;
}

/* ---------------------------------------------------------------- écriture */

/**
 * Les deux écritures, dans l'ordre : l'item en staging (gardé contre une modification depuis sa
 * lecture), puis l'entrée au registre. Exportée pour le test de l'ordre (cas 16).
 */
export function appliquerRattachement(
  repertoires: { readonly staging: string; readonly mesures: string },
  avant: Item,
  apres: Item,
  entree: RattachementItem,
): void {
  controlerAjoutRattachement(repertoires.mesures, entree);
  valider("item", apres, `item rattaché ${apres.id}`);
  reecrireItemStaging(repertoires.staging, avant, apres);
  try {
    ajouterRattachement(repertoires.mesures, entree);
  } catch (erreur) {
    throw new RattachementInacheve(avant, cheminRattachements(repertoires.mesures), erreur);
  }
}

function ecrire(plan: PlanRattachement, options: OptionsRattachement): void {
  const trace = { commit: commitCourant(options.racine), horodatage: instantLocal(new Date()), date: options.date };
  const apres = rattacherItem(plan.avant, plan.cible, trace);
  appliquerRattachement(options, plan.avant, apres, plan.entree);
  process.stdout.write(
    `\nItem ${apres.id} rattaché à la mesure ${plan.cible.id} (version ${plan.cible.version}), en attente en version ${apres.version}.\n` +
      `Rattachement ajouté à ${cheminRattachements(options.mesures)}.\n\n` +
      commandeGit(
        ["staging/items", "validation/mesures/rattachements.json"],
        `staging: rattachement de l'item ${apres.id} à la mesure ${plan.cible.id} v${plan.cible.version}`,
        [`${apres.id} : ${plan.avant.mesure_id} → ${plan.cible.id}`],
      ),
  );
}

export function rattacher(options: OptionsRattachement): void {
  if (options.ecrire && !ecriturePermise(options.racine)) return;
  const plan = planifier(options);
  imprimerPlan(plan);
  if (!options.ecrire) {
    process.stdout.write("\nSimulation : rien n'a été écrit. Ajouter --ecrire pour rattacher l'item.\n");
    return;
  }
  ecrire(plan, options);
}
