/**
 * La demande de reformulation d'une question : ce qui remplit les six variables du prompt
 * (`prompt.ts`) et ce contre quoi la sortie du modèle est contrôlée (`controle.ts`). Une seule
 * construction pour les deux usages : le contrôle vérifie exactement ce qui a été demandé.
 *
 * Contrat du prompt `prompts/reformulation-1.0.0` : `{type_item}` vaut `AUCUN` pour une question
 * sans item principal (attribution d'une mesure réelle), `{libelle_candidat}` vaut `AUCUN` pour un
 * gabarit qui ne nomme personne (Q-ATT), `{position_affirmee}` vaut `AUCUNE` quand la règle de
 * D42 (3) n'affirme rien. Ces valeurs ne servent jamais de repli : une question qui nomme un
 * candidat sans item principal, ou sans libellé, est refusée.
 */

import { gabaritParCode, LibelleCandidatAbsent } from "../questions/gabarits.ts";
import type { Gabarit, Substitutions } from "../questions/gabarits.ts";
import type { CodeGabarit, TypeItem } from "../questions/types.ts";
import { positionAffirmeeDemandee } from "./position-affirmee.ts";
import type { ItemLu, PositionDemandee } from "./position-affirmee.ts";
import type { VariablesPrompt } from "./prompt.ts";

/** Rendu de « aucun item principal » et de « aucun candidat nommé » dans le prompt. */
export const AUCUN = "AUCUN";

export interface EntreeDemande {
  readonly gabarit: CodeGabarit;
  /** Absent seulement pour une question qui ne nomme personne (Q-ATT sur une mesure réelle). */
  readonly item_principal: ItemLu | undefined;
  /** Le texte de la formulation neutre, rempli par `gabarits.ts:remplirTexteNeutre`. */
  readonly texte_neutre: string;
  /** Les chaînes substituées à `[candidat]` et `[mesure]` dans le texte neutre. */
  readonly substitutions: Substitutions;
}

export interface DemandeReformulation {
  readonly gabarit: Gabarit;
  readonly type_item: TypeItem | typeof AUCUN;
  readonly texte_neutre: string;
  /** `null` : le gabarit ne nomme aucun candidat (Q-ATT). */
  readonly libelle_candidat: string | null;
  readonly formulation_mesure: string;
  readonly position_affirmee: PositionDemandee;
}

export class QuestionSansItemPrincipal extends Error {
  constructor(gabarit: CodeGabarit) {
    super(`Le gabarit ${gabarit} nomme un candidat et la question n'a pas d'item principal : rien à reformuler.`);
    this.name = "QuestionSansItemPrincipal";
  }
}

export class LibelleSurQuestionAnonyme extends Error {
  constructor(gabarit: CodeGabarit) {
    super(`Le gabarit ${gabarit} ne nomme aucun candidat (§5) et la demande porte un libellé de candidat.`);
    this.name = "LibelleSurQuestionAnonyme";
  }
}

function libelleDe(gabarit: Gabarit, substitutions: Substitutions): string | null {
  const libelle = substitutions.libelle_candidat;
  if (!gabarit.nomme_candidat) {
    if (libelle !== undefined) throw new LibelleSurQuestionAnonyme(gabarit.code);
    return null;
  }
  if (libelle === undefined) throw new LibelleCandidatAbsent(gabarit.code);
  return libelle;
}

export function demandeDe(entree: EntreeDemande): DemandeReformulation {
  const gabarit = gabaritParCode(entree.gabarit);
  const libelle_candidat = libelleDe(gabarit, entree.substitutions);
  const item = entree.item_principal;
  if (item === undefined && gabarit.nomme_candidat) throw new QuestionSansItemPrincipal(gabarit.code);
  return {
    gabarit,
    type_item: item === undefined ? AUCUN : item.type,
    texte_neutre: entree.texte_neutre,
    libelle_candidat,
    formulation_mesure: entree.substitutions.formulation_mesure,
    position_affirmee: positionAffirmeeDemandee(item),
  };
}

/** Les six variables du prompt. Une chaîne vide y reste vide : `rendrePrompt` la refuse. */
export function variablesDuPrompt(demande: DemandeReformulation): VariablesPrompt {
  return {
    gabarit: demande.gabarit.code,
    type_item: demande.type_item,
    texte_neutre: demande.texte_neutre,
    libelle_candidat: demande.libelle_candidat === null ? AUCUN : demande.libelle_candidat,
    formulation_mesure: demande.formulation_mesure,
    position_affirmee: demande.position_affirmee,
  };
}
