/**
 * Le contreseing de la checklist de l'annexe F par l'auteur (D24 (4)) : `pnpm go-no-go:contresigner`.
 *
 * L'auteur déclare l'état de chaque case `declaree` — faite, ou non faite avec son motif — et signe
 * de son nom ; la date est l'instant courant, fourni par l'appelant (injectable dans les tests). Le
 * contreseing n'invente rien : une case calculée garde l'état que le pipeline lui a donné, une case
 * non faite reste non faite, et une case déclarée sans état fait refuser la signature.
 *
 * Refus, sans rien écrire : checklist déjà contresignée, case déclarée sans état ou déclarée deux
 * fois, déclaration sur une case calculée ou sur un rang inconnu, case non faite sans motif, case
 * faite avec un motif, nom vide. Seul `checklist.json` est écrit, validé contre son schéma :
 * `run.json` n'est JAMAIS touché.
 */

import { valider } from "../../outils/schemas/valider.ts";
import { type CaseChecklist, type Checklist, type EtatCase } from "./checklist.ts";
import { cheminChecklist, ecrireParRenommage, lireJson } from "./fichiers.ts";

export interface Declaration {
  readonly rang: number;
  readonly etat: EtatCase;
  /** Exigé pour une case non faite, interdit pour une case faite. */
  readonly motif?: string;
}

export interface DemandeContreseing {
  readonly nom: string;
  readonly declarations: readonly Declaration[];
  /** L'instant de la signature, au format `commun#/$defs/instant`. */
  readonly date: string;
}

export class ContreseingRefuse extends Error {
  constructor(detail: string) {
    super(`Contreseing refusé : ${detail} Rien n'est écrit.`);
    this.name = "ContreseingRefuse";
  }
}

function verifierDeclaration(declaration: Declaration, cases: readonly CaseChecklist[]): void {
  const visee = cases.find((c) => c.rang === declaration.rang);
  if (visee === undefined) throw new ContreseingRefuse(`la case ${declaration.rang} n'existe pas (annexe F : dix cases).`);
  if (visee.nature !== "declaree") throw new ContreseingRefuse(`la case ${declaration.rang} est calculée par le pipeline : son état ne se déclare pas.`);
  const motif = declaration.motif === undefined ? "" : declaration.motif.trim();
  if (declaration.etat === "non_faite" && motif.length === 0) throw new ContreseingRefuse(`la case ${declaration.rang} est déclarée non faite sans motif.`);
  if (declaration.etat === "faite" && declaration.motif !== undefined) throw new ContreseingRefuse(`la case ${declaration.rang} est déclarée faite avec un motif.`);
}

function verifierCouverture(declarations: readonly Declaration[], cases: readonly CaseChecklist[]): void {
  for (const visee of cases.filter((c) => c.nature === "declaree")) {
    const nombre = declarations.filter((d) => d.rang === visee.rang).length;
    if (nombre === 0) throw new ContreseingRefuse(`la case déclarée ${visee.rang} (« ${visee.texte} ») n'a reçu aucun état.`);
    if (nombre > 1) throw new ContreseingRefuse(`la case ${visee.rang} est déclarée ${nombre} fois.`);
  }
}

function caseDeclaree(visee: CaseChecklist, declarations: readonly Declaration[]): CaseChecklist {
  const declaration = declarations.find((d) => d.rang === visee.rang);
  if (visee.nature !== "declaree" || declaration === undefined) return visee;
  const socle = { rang: visee.rang, texte: visee.texte, nature: visee.nature, etat: declaration.etat };
  return declaration.motif === undefined ? socle : { ...socle, motif: declaration.motif };
}

/** La checklist contresignée ; fonction pure, toutes les règles de refus y vivent. */
export function contresigner(checklist: Checklist, demande: DemandeContreseing): Checklist {
  if (checklist.contreseing !== undefined) {
    throw new ContreseingRefuse(`la checklist est déjà contresignée par ${checklist.contreseing.nom} le ${checklist.contreseing.date} ; on ne re-signe pas.`);
  }
  if (demande.nom.trim().length === 0) throw new ContreseingRefuse("le nom du signataire est vide.");
  for (const declaration of demande.declarations) verifierDeclaration(declaration, checklist.cases);
  verifierCouverture(demande.declarations, checklist.cases);
  return {
    ...checklist,
    cases: checklist.cases.map((c) => caseDeclaree(c, demande.declarations)),
    contreseing: { nom: demande.nom, date: demande.date },
  };
}

/** Lit `checklist.json`, le contresigne, le valide et l'écrit. `run.json` n'est pas ouvert. */
export function contresignerFichier(repertoire_run: string, demande: DemandeContreseing): Checklist {
  const chemin = cheminChecklist(repertoire_run);
  const actuelle = valider<Checklist>("checklist", lireJson(chemin), chemin);
  const signee = valider<Checklist>("checklist", contresigner(actuelle, demande), `${chemin} contresigné`);
  ecrireParRenommage(chemin, signee);
  return signee;
}
