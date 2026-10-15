/**
 * Lecture des formulations relues au gel (décision D39, option 1) : des questions engendrées et du
 * contenu de `data/formulations/`, les objets `question` complets que le run publie, ou un refus.
 *
 * Fonction pure : la commande de gel (lot `gel`, à venir) lit les fichiers avec
 * `validation/io/data-formulations.ts:lireFormulationsData` et passe leur contenu ici. Le gel lit
 * seulement : il n'écrit ni ne relit aucune formulation.
 *
 * Une question engendrée sans fichier, ou dont le fichier a été relu sur un autre texte neutre
 * (empreinte différente), ou dont l'orientée affirme une autre position que celle que la règle de
 * D42 (3) donne sur l'item courant (décision de l'auteur, Q1 option (a) : `position_perimee`), ou
 * dont le fichier viole un invariant hors schéma (neutre d'une autre table de gabarits, empreinte
 * qui ne suit pas son texte), fait échouer le gel. L'erreur liste TOUTES les questions en défaut,
 * pas seulement la première : l'auteur relance une relecture groupée, pas une par essai.
 *
 * Ce que la question engendrée ne porte pas et que le schéma `question` exige : `engendree_le`.
 * `QuestionEngendree` n'a pas d'horodatage ; il est demandé à l'appelant (l'instant où le gel a
 * engendré le jeu), jamais fabriqué ici. `theme`, porté par la question engendrée pour le tirage,
 * n'existe pas sur l'objet `question` (il vit sur la mesure) et n'est pas recopié.
 */

import { valider } from "../../outils/schemas/valider.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import { empreintesSuiventTextes, neutreSuitVersionGabarits } from "../questions/invariants.ts";
import type { Question, QuestionEngendree } from "../questions/types.ts";
import { positionPromue, type FormulationsValidees, type QuestionCourante } from "./relecture.ts";

export type MotifDefaut = "absente" | "autre_empreinte" | "position_perimee" | "invariant";

export interface DefautAuGel {
  readonly question_id: string;
  readonly motif: MotifDefaut;
  readonly detail: string;
}

export class FormulationsEnDefautAuGel extends Error {
  readonly defauts: readonly DefautAuGel[];

  constructor(defauts: readonly DefautAuGel[]) {
    super(
      `Gel refusé : ${defauts.length} question(s) sans formulations relues sur leur texte neutre et leur ` +
        `position courants (décision D39) :\n${defauts.map((defaut) => `  ${defaut.question_id} [${defaut.motif}] ${defaut.detail}`).join("\n")}`,
    );
    this.name = "FormulationsEnDefautAuGel";
    this.defauts = defauts;
  }
}

/** Q1, option (a) : la position de l'orientée promue (ou son absence) est celle de la règle sur l'item courant. */
function defautDePosition(courante: QuestionCourante, lue: FormulationsValidees): string | null {
  const promue = positionPromue(lue);
  const demandee = courante.demande.position_affirmee;
  if (promue === demandee) return null;
  return `l'orientée promue affirme « ${promue} », la règle de D42 (3) donne « ${demandee} » sur l'item courant.`;
}

function defautsDe(courante: QuestionCourante, lue: FormulationsValidees | undefined): readonly DefautAuGel[] {
  const engendree = courante.question;
  const defaut = (motif: MotifDefaut, detail: string): DefautAuGel => ({ question_id: engendree.id, motif, detail });
  if (lue === undefined) return [defaut("absente", "aucun fichier data/formulations/<question_id>.json.")];
  const empreinte = sha256(engendree.texte_neutre);
  if (lue.empreinte_texte_neutre !== empreinte) {
    return [defaut("autre_empreinte", `relue sur le texte neutre ${lue.empreinte_texte_neutre}, texte courant ${empreinte}.`)];
  }
  const position = defautDePosition(courante, lue);
  if (position !== null) return [defaut("position_perimee", position)];
  const violations = [
    ...neutreSuitVersionGabarits([lue], new Map([[engendree.id, engendree.version_gabarits]])),
    ...empreintesSuiventTextes([lue]),
  ];
  return violations.map((violation) => defaut("invariant", `${violation.invariant} : ${violation.detail}`));
}

function questionDe(engendree: QuestionEngendree, lue: FormulationsValidees, engendree_le: string): Question {
  const socle = {
    id: engendree.id,
    gabarit: engendree.gabarit,
    items: engendree.items,
    grappe_id: engendree.grappe_id,
    formulations: lue.formulations,
    engendree_le,
    version_gabarits: engendree.version_gabarits,
  };
  const question = engendree.candidat_id === undefined ? socle : { ...socle, candidat_id: engendree.candidat_id };
  return valider<Question>("question", question, `question ${engendree.id} assemblée au gel`);
}

/**
 * `courantes` : les questions engendrées au gel, chacune avec la position demandée sur son item
 * courant (`entrees.ts:tachesDe` les rend). `formulations` : le contenu de `data/formulations/`, par
 * `question_id`. Un fichier sans question engendrée correspondante n'est pas lu (il reste dans
 * `data/`, l'historique le garde). Chaque `question` rendue est validée contre son schéma.
 */
export function questionsAuGel(
  courantes: readonly QuestionCourante[],
  formulations: ReadonlyMap<string, FormulationsValidees>,
  engendree_le: string,
): readonly Question[] {
  const defauts = courantes.flatMap((courante) => defautsDe(courante, formulations.get(courante.question.id)));
  if (defauts.length > 0) throw new FormulationsEnDefautAuGel(defauts);
  return courantes.map((courante) => {
    const lue = formulations.get(courante.question.id);
    if (lue === undefined) throw new FormulationsEnDefautAuGel(defautsDe(courante, lue));
    return questionDe(courante.question, lue, engendree_le);
  });
}
