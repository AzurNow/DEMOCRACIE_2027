/**
 * Les entrées de `pnpm reformuler` : les questions engendrées depuis `data/` et la demande de
 * reformulation de chacune.
 *
 * - Items et mesures : `data/items/` et `data/mesures/`, un fichier JSON par objet, lus et validés
 *   par les lecteurs de l'interface de validation (`validation/io/data-items.ts`,
 *   `data-mesures.ts`), en lecture seule.
 * - Candidats : la seule liste `candidats` de `config/perimetre.yaml`, validée contre
 *   `schema/perimetre.schema.json`. `charger-perimetre.ts` refuse un périmètre incomplet pour un run
 *   (date de gel, régime, quotas, outils) et ne lit pas les candidats seuls ; la reformulation n'a
 *   besoin que de leurs libellés et noms, les mêmes que ceux du run. Tous les candidats listés sont
 *   lus, retirés compris : ce sont ceux de `run.perimetre.candidats`, et ceux que la barrière de
 *   symétrie cherche dans une Q-ATT.
 * - Questions : `engendrement.ts:engendrer`, sans autre règle. La demande de chaque question
 *   reprend ses substitutions (libellé du candidat, forme canonique de la mesure) et son item
 *   principal ; le texte neutre recalculé doit être celui de la question, sinon les deux chemins
 *   divergent et la commande s'arrête.
 *
 * Aucune entrée vide n'est comblée : sans item ou sans candidat, la commande le dit et s'arrête.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { valider } from "../../outils/schemas/valider.ts";
import { lireItemsData } from "../../validation/io/data-items.ts";
import { lireMesuresData } from "../../validation/io/data-mesures.ts";
import { engendrer } from "../questions/engendrement.ts";
import { gabaritParCode, remplirTexteNeutre } from "../questions/gabarits.ts";
import type { Substitutions } from "../questions/gabarits.ts";
import type { CandidatNomme, Item, Mesure, QuestionEngendree } from "../questions/types.ts";
import { demandeDe } from "./demande.ts";
import type { DemandeReformulation } from "./demande.ts";

/** Une entrée manquante : la commande s'arrête sans rien appeler, avec ce message. */
export class EntreeAbsente extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntreeAbsente";
  }
}

export class QuestionIncoherente extends Error {
  constructor(question_id: string, detail: string) {
    super(`Question ${question_id} : ${detail}`);
    this.name = "QuestionIncoherente";
  }
}

export interface Tache {
  readonly question: QuestionEngendree;
  readonly demande: DemandeReformulation;
}

export interface DispositionEntrees {
  readonly items: string;
  readonly mesures: string;
  readonly perimetre: string;
}

export function dispositionEntrees(racine: string): DispositionEntrees {
  return {
    items: join(racine, "data", "items"),
    mesures: join(racine, "data", "mesures"),
    perimetre: join(racine, "config", "perimetre.yaml"),
  };
}

/* ------------------------------------------------------------------ lectures */

interface PerimetreLu {
  readonly candidats: readonly CandidatNomme[];
}

/** Les candidats de `config/perimetre.yaml`, réduits à ce que nomme une question. */
export function lireCandidats(chemin: string): readonly CandidatNomme[] {
  const perimetre = valider<PerimetreLu>("perimetre", parse(readFileSync(chemin, "utf8")) as unknown, chemin);
  return perimetre.candidats.map(({ candidat_id, libelle, nom }) => ({ candidat_id, libelle, nom }));
}

export interface Donnees {
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  readonly candidats: readonly CandidatNomme[];
}

export function lireDonnees(disposition: DispositionEntrees): Donnees {
  const items = [...lireItemsData(disposition.items).values()];
  if (items.length === 0) {
    throw new EntreeAbsente(`${disposition.items} : aucun item validé. Rien à reformuler : aucun appel n'est fait.`);
  }
  const candidats = lireCandidats(disposition.perimetre);
  if (candidats.length === 0) {
    throw new EntreeAbsente(
      `${disposition.perimetre} : aucun candidat dans le périmètre. Les questions ne peuvent pas nommer leur candidat : aucun appel n'est fait.`,
    );
  }
  const mesures = [...lireMesuresData(disposition.mesures).values()].map((lue) => lue.mesure);
  return { items, mesures, candidats };
}

/* ------------------------------------------------------------------- tâches */

function itemPrincipal(question: QuestionEngendree, items: ReadonlyMap<string, Item>): Item | undefined {
  const principaux = question.items.filter((entree) => entree.role === "principal");
  if (principaux.length > 1) throw new QuestionIncoherente(question.id, `${principaux.length} items principaux.`);
  const [principal] = principaux;
  if (principal === undefined) return undefined;
  const item = items.get(principal.reference.item_id);
  if (item === undefined) throw new QuestionIncoherente(question.id, `item principal ${principal.reference.item_id} absent de data/items/.`);
  return item;
}

/** La mesure de l'item principal ; sans item principal, la grappe d'une Q-ATT est sa mesure (§5). */
function mesureDe(question: QuestionEngendree, principal: Item | undefined, mesures: ReadonlyMap<string, Mesure>): Mesure {
  const mesure_id = principal === undefined ? question.grappe_id : principal.mesure_id;
  const mesure = mesures.get(mesure_id);
  if (mesure === undefined) throw new QuestionIncoherente(question.id, `mesure ${mesure_id} absente de data/mesures/.`);
  return mesure;
}

function substitutionsDe(question: QuestionEngendree, mesure: Mesure, libelles: ReadonlyMap<string, string>): Substitutions {
  const base = { formulation_mesure: mesure.formulation_canonique };
  if (question.candidat_id === undefined) return base;
  const libelle = libelles.get(question.candidat_id);
  if (libelle === undefined) throw new QuestionIncoherente(question.id, `candidat ${question.candidat_id} absent du périmètre.`);
  return { ...base, libelle_candidat: libelle };
}

function tacheDe(question: QuestionEngendree, contexte: ContexteTaches): Tache {
  const principal = itemPrincipal(question, contexte.items);
  const substitutions = substitutionsDe(question, mesureDe(question, principal, contexte.mesures), contexte.libelles);
  const recalcule = remplirTexteNeutre(gabaritParCode(question.gabarit), substitutions);
  if (recalcule !== question.texte_neutre) {
    throw new QuestionIncoherente(question.id, `texte neutre « ${question.texte_neutre} » ≠ texte recalculé « ${recalcule} ».`);
  }
  const demande = demandeDe({ gabarit: question.gabarit, item_principal: principal, texte_neutre: question.texte_neutre, substitutions });
  return { question, demande };
}

interface ContexteTaches {
  readonly items: ReadonlyMap<string, Item>;
  readonly mesures: ReadonlyMap<string, Mesure>;
  readonly libelles: ReadonlyMap<string, string>;
}

/** Les questions engendrées et leur demande, en ordre d'identifiant de question. */
export function tachesDe(donnees: Donnees): readonly Tache[] {
  const contexte: ContexteTaches = {
    items: new Map(donnees.items.map((item) => [item.id, item])),
    mesures: new Map(donnees.mesures.map((mesure) => [mesure.id, mesure])),
    libelles: new Map(donnees.candidats.map((candidat) => [candidat.candidat_id, candidat.libelle])),
  };
  const questions = [...engendrer(donnees.items, donnees.mesures, donnees.candidats)];
  questions.sort((a, b) => (a.id < b.id ? -1 : 1));
  return questions.map((question) => tacheDe(question, contexte));
}
