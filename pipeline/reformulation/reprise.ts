/**
 * Reprise de `pnpm reformuler` : quelles questions appeler, lesquelles sauter.
 *
 * La clé est (question_id, empreinte du texte neutre courant) (D39), et la position que la prémisse
 * doit affirmer, recalculée sur l'item courant (décision de l'auteur, Q1 option (a)). Une question
 * est sautée :
 * - « déjà validée » si `data/formulations/<question_id>.json` existe, porte cette empreinte, et
 *   son orientée affirme la position demandée courante (ou aucune pour AUCUNE) ;
 * - « déjà acceptée » si `staging/formulations/<question_id>/` porte une proposition `acceptee` sur
 *   cette empreinte et cette position demandée, que le relecteur n'a pas refusée
 *   (`validation/formulations/refus.jsonl`).
 * Toute autre question est appelée : propositions seulement rejetées ou en échec, acceptée sur un
 * autre texte neutre ou une position périmée (item corrigé, texte neutre inchangé), acceptée puis
 * refusée à la relecture, validée sur une position périmée. Les fichiers existants ne sont jamais
 * modifiés : un nouvel appel écrit un nouveau fichier.
 *
 * Les deux fichiers de la relecture sont lus par leurs seuls lecteurs, ceux de l'interface de
 * validation (`validation/io/data-formulations.ts`, `validation/io/refus-formulations.ts`), validés
 * contre leurs schémas : un fichier absent est vide ; un fichier présent mais illisible ou non
 * conforme est une erreur nommée, levée avant tout appel.
 */

import {
  FormulationValideeIllisible,
  lireFormulationsQuestion,
} from "../../validation/io/data-formulations.ts";
import { JournalRefusIllisible, lireRefusFormulations } from "../../validation/io/refus-formulations.ts";
import type { PositionDemandee } from "./position-affirmee.ts";
import { clePromotion, type ClePromotion } from "./relecture.ts";
import type { PropositionFormulation } from "./staging.ts";

export { FormulationValideeIllisible, JournalRefusIllisible };

/* ------------------------------------------------ data/formulations/<id>.json */

/**
 * La clé sur laquelle la question a été validée (empreinte du texte neutre, position affirmée par
 * l'orientée), ou `null` si `data/formulations/<question_id>.json` n'existe pas.
 */
export function validee(repertoire: string, question_id: string): ClePromotion | null {
  const lue = lireFormulationsQuestion(repertoire, question_id);
  return lue === null ? null : clePromotion(lue.formulations);
}

/* ------------------------------------------- validation/formulations/refus.jsonl */

/** Les identifiants des propositions refusées à la relecture. Fichier absent : aucun refus. */
export function lireRefus(chemin: string): ReadonlySet<string> {
  return new Set(lireRefusFormulations(chemin).map((refus) => refus.proposition_id));
}

/* --------------------------------------------------------------- décision */

export type DecisionReprise = "a_appeler" | "deja_validee" | "deja_acceptee";

export interface EtatQuestion {
  readonly empreinte_courante: string;
  /** D42 (3), recalculée sur l'item courant. */
  readonly position_courante: PositionDemandee;
  readonly validee: ClePromotion | null;
  readonly propositions: readonly PropositionFormulation[];
  readonly refus: ReadonlySet<string>;
}

function accepteeEnVigueur(proposition: PropositionFormulation, etat: EtatQuestion): boolean {
  return (
    proposition.issue.statut === "acceptee" &&
    proposition.empreinte_texte_neutre === etat.empreinte_courante &&
    proposition.demande.position_affirmee === etat.position_courante &&
    !etat.refus.has(proposition.id)
  );
}

function valideeEnVigueur(etat: EtatQuestion): boolean {
  if (etat.validee === null) return false;
  return etat.validee.empreinte_texte_neutre === etat.empreinte_courante && etat.validee.position === etat.position_courante;
}

export function deciderReprise(etat: EtatQuestion): DecisionReprise {
  if (valideeEnVigueur(etat)) return "deja_validee";
  if (etat.propositions.some((proposition) => accepteeEnVigueur(proposition, etat))) return "deja_acceptee";
  return "a_appeler";
}
