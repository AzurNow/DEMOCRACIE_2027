/**
 * L'exécution de `pnpm reformuler` : pour chaque question à appeler, un appel au modèle, et pour
 * chaque réponse HTTP reçue, une proposition écrite dans `staging/formulations/` (D39, D42).
 *
 * Par appel :
 * 1. le prompt est rendu depuis `prompts/reformulation-1.0.0.md` (règle 6, `prompt.ts`) ;
 * 2. le transport envoie la requête ; un échec de transport n'écrit rien et est compté ;
 * 3. l'empreinte des octets du corps est prise avant toute lecture ; le corps est lu tel quel —
 *    objet JSON dans `brut`, sinon texte UTF-8 dans `brut_texte` ; un corps qui n'est pas de
 *    l'UTF-8 valide lève `CorpsNonUtf8` et arrête la commande sans rien écrire (même règle que
 *    l'interrogation) ;
 * 4. issue : statut hors 2xx ⇒ `echec_http`, rien contrôlé ; 2xx dont l'enveloppe ne donne pas le
 *    texte du modèle ⇒ `rejetee`, `corps_illisible` ; sinon le texte du modèle passe le contrôle
 *    déterministe (`controle.ts`) ⇒ `acceptee`, sortie recopiée, ou `rejetee` avec son motif ;
 * 5. la proposition est validée contre son schéma, puis écrite une fois.
 *
 * Le plafond borne le nombre d'envois, échecs de transport compris : atteint, la commande s'arrête
 * proprement et compte les questions restées sans appel.
 */

import { createHash } from "node:crypto";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import { ulid } from "../../validation/domaine/ulid.ts";
import { ErreurReseau, lireContenu, type Contenu, type ReponseHttp } from "../interrogation/editeur.ts";
import { instantParis } from "../interrogation/heure-paris.ts";
import type { CandidatNomme } from "../questions/types.ts";
import { controlerSortie, SortieRejetee } from "./controle.ts";
import { variablesDuPrompt } from "./demande.ts";
import type { DemandeReformulation } from "./demande.ts";
import type { AdaptateurReformulation, EditeurReformulation } from "./editeur.ts";
import type { Tache } from "./entrees.ts";
import { rendrePrompt, VERSION_PROMPT_REFORMULATION } from "./prompt.ts";
import { deciderReprise, type DecisionReprise, type EtatQuestion } from "./reprise.ts";
import { ecrireProposition, lirePropositions } from "./staging.ts";
import type { CorpsStocke, IssueProposition, MotifProposition, PropositionFormulation } from "./staging.ts";

export interface ContexteExecution {
  readonly editeur: EditeurReformulation;
  /** Le texte du prompt (`chargerPromptReformulation`), variables non remplacées. */
  readonly texte_prompt: string;
  /** Les candidats du périmètre, cherchés dans une Q-ATT par le contrôle. */
  readonly perimetre: readonly CandidatNomme[];
  /** `staging/formulations/`, ou un répertoire de test. */
  readonly staging: string;
  /** Nombre maximal d'envois ; `null` : aucun plafond (mode simulé seulement, décidé par la commande). */
  readonly plafond: number | null;
  readonly maintenant: () => number;
  /** Reçoit un message par échec de transport. */
  readonly signaler: (message: string) => void;
}

export interface Bilan {
  readonly appels: number;
  readonly acceptees: number;
  readonly rejetees: ReadonlyMap<MotifProposition, number>;
  readonly echecs_http: number;
  readonly echecs_transport: number;
  readonly sautees_deja_acceptees: number;
  readonly sautees_deja_validees: number;
  readonly non_appelees_plafond: number;
  /** Chemins écrits, dans l'ordre. */
  readonly ecrits: readonly string[];
}

/* ----------------------------------------------------------------- reprise */

export interface EtatReprise {
  /** `data/formulations/` : question_id → empreinte validée, ou null. */
  readonly empreinteValidee: (question_id: string) => string | null;
  readonly refus: ReadonlySet<string>;
}

export interface Triage {
  readonly a_appeler: readonly Tache[];
  readonly deja_acceptees: number;
  readonly deja_validees: number;
}

function decisionPour(tache: Tache, staging: string, reprise: EtatReprise): DecisionReprise {
  const etat: EtatQuestion = {
    empreinte_courante: sha256(tache.question.texte_neutre),
    empreinte_validee: reprise.empreinteValidee(tache.question.id),
    propositions: lirePropositions(staging, tache.question.id),
    refus: reprise.refus,
  };
  return deciderReprise(etat);
}

/** Lit tout l'état de reprise avant le premier appel : un fichier illisible arrête tout ici. */
export function trier(taches: readonly Tache[], staging: string, reprise: EtatReprise): Triage {
  const decisions = taches.map((tache) => ({ tache, decision: decisionPour(tache, staging, reprise) }));
  return {
    a_appeler: decisions.filter((entree) => entree.decision === "a_appeler").map((entree) => entree.tache),
    deja_acceptees: decisions.filter((entree) => entree.decision === "deja_acceptee").length,
    deja_validees: decisions.filter((entree) => entree.decision === "deja_validee").length,
  };
}

/* ------------------------------------------------------------------- issue */

function issueDuTexte(texte: string, demande: DemandeReformulation, perimetre: readonly CandidatNomme[]): IssueProposition {
  try {
    const sortie = controlerSortie(texte, demande, perimetre);
    return { statut: "acceptee", familier: sortie.familier, oriente: sortie.oriente };
  } catch (erreur) {
    if (erreur instanceof SortieRejetee) return { statut: "rejetee", motif: erreur.motif, detail: erreur.message };
    throw erreur;
  }
}

function estSucces(statut: number): boolean {
  return statut >= 200 && statut < 300;
}

function issueDe(statut: number, contenu: Contenu, demande: DemandeReformulation, contexte: ContexteExecution): IssueProposition {
  if (!estSucces(statut)) return { statut: "echec_http" };
  const lecture = contexte.editeur.adaptateur.texteDuModele(contenu);
  if (!lecture.lisible) return { statut: "rejetee", motif: "corps_illisible", detail: lecture.raison };
  return issueDuTexte(lecture.texte, demande, contexte.perimetre);
}

function corpsStocke(contenu: Contenu): CorpsStocke {
  return contenu.forme === "objet" ? { brut: contenu.brut } : { brut_texte: contenu.brut_texte };
}

/* ------------------------------------------------------------ proposition */

interface Reception {
  readonly reponse: ReponseHttp;
  readonly instant: number;
}

function propositionDe(tache: Tache, reception: Reception, adaptateur: AdaptateurReformulation, contexte: ContexteExecution): PropositionFormulation {
  const brut_octets_sha256 = createHash("sha256").update(reception.reponse.corps).digest("hex");
  const contenu = lireContenu(reception.reponse);
  const { texte_neutre: _envoye_a_part, ...demande } = variablesDuPrompt(tache.demande);
  return {
    id: ulid(reception.instant),
    question_id: tache.question.id,
    texte_neutre: tache.question.texte_neutre,
    empreinte_texte_neutre: sha256(tache.question.texte_neutre),
    version_gabarits: tache.question.version_gabarits,
    demande: { ...demande, gabarit: tache.demande.gabarit.code, position_affirmee: tache.demande.position_affirmee },
    production: { modele: adaptateur.modele, version_prompt: VERSION_PROMPT_REFORMULATION },
    appel: {
      date: instantParis(reception.instant),
      statut_http: reception.reponse.statut,
      brut_octets_sha256,
      ...corpsStocke(contenu),
    },
    issue: issueDe(reception.reponse.statut, contenu, tache.demande, contexte),
  };
}

/* ------------------------------------------------------------------ appels */

type IssueAppel = { readonly genre: "ecrite"; readonly chemin: string; readonly issue: IssueProposition } | { readonly genre: "transport" };

async function recevoir(tache: Tache, contexte: ContexteExecution): Promise<Reception | null> {
  const { adaptateur, transport } = contexte.editeur;
  const requete = adaptateur.construireRequete(rendrePrompt(contexte.texte_prompt, variablesDuPrompt(tache.demande)));
  try {
    const reponse = await transport.envoyer(requete, new AbortController().signal);
    return { reponse, instant: contexte.maintenant() };
  } catch (erreur) {
    if (!(erreur instanceof ErreurReseau)) throw erreur;
    contexte.signaler(`Question ${tache.question.id} : ${erreur.message} Aucun fichier écrit.`);
    return null;
  }
}

async function appeler(tache: Tache, contexte: ContexteExecution): Promise<IssueAppel> {
  const reception = await recevoir(tache, contexte);
  if (reception === null) return { genre: "transport" };
  const proposition = propositionDe(tache, reception, contexte.editeur.adaptateur, contexte);
  return { genre: "ecrite", chemin: ecrireProposition(contexte.staging, proposition), issue: proposition.issue };
}

/* ------------------------------------------------------------------- bilan */

interface Compteurs {
  appels: number;
  acceptees: number;
  readonly rejetees: Map<MotifProposition, number>;
  echecs_http: number;
  echecs_transport: number;
  readonly ecrits: string[];
}

function compterIssue(compteurs: Compteurs, issue: IssueProposition): void {
  switch (issue.statut) {
    case "acceptee":
      compteurs.acceptees += 1;
      return;
    case "echec_http":
      compteurs.echecs_http += 1;
      return;
    case "rejetee": {
      const avant = compteurs.rejetees.get(issue.motif);
      compteurs.rejetees.set(issue.motif, avant === undefined ? 1 : avant + 1);
      return;
    }
  }
}

function compter(compteurs: Compteurs, issue: IssueAppel): void {
  compteurs.appels += 1;
  if (issue.genre === "transport") {
    compteurs.echecs_transport += 1;
    return;
  }
  compteurs.ecrits.push(issue.chemin);
  compterIssue(compteurs, issue.issue);
}

function plafondAtteint(compteurs: Compteurs, plafond: number | null): boolean {
  return plafond !== null && compteurs.appels >= plafond;
}

/** Appelle chaque question triée, dans l'ordre, jusqu'au plafond. */
export async function executer(triage: Triage, contexte: ContexteExecution): Promise<Bilan> {
  const compteurs: Compteurs = { appels: 0, acceptees: 0, rejetees: new Map(), echecs_http: 0, echecs_transport: 0, ecrits: [] };
  let rang = 0;
  for (const tache of triage.a_appeler) {
    if (plafondAtteint(compteurs, contexte.plafond)) break;
    compter(compteurs, await appeler(tache, contexte));
    rang += 1;
  }
  return {
    ...compteurs,
    sautees_deja_acceptees: triage.deja_acceptees,
    sautees_deja_validees: triage.deja_validees,
    non_appelees_plafond: triage.a_appeler.length - rang,
  };
}
