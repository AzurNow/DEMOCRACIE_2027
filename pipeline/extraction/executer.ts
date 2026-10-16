/**
 * L'exécution de `pnpm extraire` : pour chaque entrée, dans l'ordre de `listerEntrees`, l'extraction
 * double d'une source de bout en bout (§4, décisions D52 et D53, PR 3 du lot extraction). Aucune
 * logique de mesure ici : le choix du texte, la lecture des sorties, l'appariement, le refus D53 (2)
 * et l'assemblage des items appartiennent au cœur (`extraction.ts:extraireSource`).
 *
 * Par source :
 * 1. journal présent ⇒ sautée, aucun appel : une source traitée, refusée comprise, n'est jamais
 *    relancée automatiquement ;
 * 2. entrée lue et validée, fiche choisie, texte et transcription relus (`entrees.ts`) ; une
 *    incohérence est nommée et la source laissée non traitée, rien n'est écrit pour elle ;
 * 3. prompt rendu (`prompt.ts`), puis, pour chaque extracteur **dans l'ordre de la configuration** :
 *    réponse déjà gardée pour (source, modèle, empreinte du prompt rendu) ⇒ réutilisée ; sinon,
 *    plafond atteint ⇒ arrêt de toute la commande ; sinon un appel (`editeur.ts:appelerExtracteur`),
 *    décompté du plafond, et la réponse est écrite telle que reçue avant d'être lue (règle 7). Un
 *    échec de transport, un délai dépassé ou un corps non UTF-8 n'écrit rien : la source reste à
 *    traiter et sera reprise sans repayer l'appel déjà gardé ;
 * 4. les deux réponses gardées sont relues depuis ce qui est écrit, par l'enveloppe de leur éditeur
 *    (`editeur.ts:lectureDe`), et le texte de chaque modèle est passé au cœur. **Une lecture
 *    illisible** (statut hors 2xx, sortie coupée, refus, enveloppe inattendue) n'a pas de texte :
 *    le cœur reçoit pour ce modèle la chaîne vide, qu'il rejette en entier (`json_invalide`), ce qui
 *    refuse la source (D53 (2), `extraction_double_incomplete`). La raison réelle est consignée dans
 *    le journal, à côté de la réponse. `extraireSource` n'accepte qu'une chaîne par modèle : c'est la
 *    seule transmission possible sans changer son interface (voir le rapport de la PR) ;
 * 5. items et mesures écrits sous `items/` et `mesures/`, puis le journal en dernier.
 */

import { createHash } from "node:crypto";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import { TexteCanoniqueAltere } from "../../validation/io/staging.ts";
import { CorpsNonUtf8, ErreurReseau, type Contenu, type ReponseHttp } from "../interrogation/editeur.ts";
import { instantParis } from "../interrogation/heure-paris.ts";
import { AucunTexteEpingle, FicheDUneAutreSource, PlusieursTextesEpingles } from "./choix-texte.ts";
import type { ConfigurationExtraction } from "./configuration.ts";
import { appelerExtracteur, lectureDe, type EditeurExtraction, type LectureTexteModele } from "./editeur.ts";
import { EntreeExtractionIncoherente, lireEntree, materiauDe, type EntreeLue, type Materiau } from "./entrees.ts";
import {
  extraireSource,
  PagesAbsentes,
  SourceDejaLocalisee,
  SourceIncoherente,
  TexteNeCorrespondPas,
  TranscriptionIncoherente,
  type ResultatExtraction,
} from "./extraction.ts";
import { rendrePromptExtraction, type VariablesExtraction } from "./prompt.ts";
import {
  ecrireItem,
  ecrireJournal,
  ecrireMesure,
  ecrireReponse,
  journalPresent,
  lireReponseGardee,
  type CorpsGarde,
  type IssueJournal,
  type JournalExtraction,
  type ReponseGardee,
  type ReponseJournal,
} from "./staging.ts";

export interface ContexteExtraction {
  /** `staging/` du dépôt : entrées, fiches, textes, transcriptions, en lecture seule. */
  readonly staging: string;
  /** Où écrire : `staging/` du dépôt en mode réel, hors du dépôt en mode simulé. */
  readonly sortie: string;
  /** Le texte du prompt (`chargerPromptExtraction`), variables non remplacées. */
  readonly texte_prompt: string;
  readonly configuration: ConfigurationExtraction;
  /** Les deux éditeurs, dans l'ordre de `configuration.modeles`, prêts pour cette demande. */
  readonly editeurs: (demande: VariablesExtraction) => readonly [EditeurExtraction, EditeurExtraction];
  /** Nombre maximal d'appels ; `null` : aucun plafond (mode simulé seulement). */
  readonly plafond: number | null;
  readonly commit: string;
  readonly maintenant: () => number;
  readonly nouvelUlid: () => string;
  readonly signaler: (ligne: string) => void;
}

export interface Bilan {
  readonly sources: number;
  readonly sautees: number;
  readonly extraites: number;
  readonly refusees: number;
  readonly incoherentes: number;
  readonly echecs_transport: number;
  readonly appels: number;
  readonly reutilisees: number;
  readonly items: number;
  readonly mesures: number;
  /** Vrai si un appel nécessaire a été refusé par le plafond : la commande s'est arrêtée là. */
  readonly plafond_atteint: boolean;
}

/** Les incohérences d'entrée nommées : la source n'est pas traitée, la commande continue. */
const INCOHERENCES = [
  EntreeExtractionIncoherente,
  AucunTexteEpingle,
  PlusieursTextesEpingles,
  FicheDUneAutreSource,
  TexteCanoniqueAltere,
  TexteNeCorrespondPas,
  SourceIncoherente,
  SourceDejaLocalisee,
  PagesAbsentes,
  TranscriptionIncoherente,
];

type IssueSource =
  | { readonly genre: "sautee" }
  | { readonly genre: "traitee"; readonly issue: IssueJournal }
  | { readonly genre: "incoherente"; readonly message: string }
  | { readonly genre: "transport"; readonly message: string }
  | { readonly genre: "plafond" };

interface Compteurs {
  appels: number;
  reutilisees: number;
}

/* ------------------------------------------------------------------ appels */

function corpsGarde(contenu: Contenu): CorpsGarde {
  return contenu.forme === "objet" ? { brut: contenu.brut } : { brut_texte: contenu.brut_texte };
}

function contenuGarde(reponse: ReponseGardee): Contenu {
  return "brut" in reponse ? { forme: "objet", brut: reponse.brut } : { forme: "texte", brut_texte: reponse.brut_texte };
}

interface Demande {
  readonly lue: EntreeLue;
  readonly prompt: string;
  readonly prompt_sha256: string;
}

function reponseGardee(demande: Demande, modele: string, reponse: ReponseHttp, contenu: Contenu, contexte: ContexteExtraction): ReponseGardee {
  return {
    cle_source: demande.lue.entree.cle_source,
    sha256_source: demande.lue.entree.sha256_source,
    modele,
    version_prompt: contexte.configuration.version_prompt,
    prompt_sha256: demande.prompt_sha256,
    date: instantParis(contexte.maintenant()),
    statut_http: reponse.statut,
    brut_octets_sha256: createHash("sha256").update(reponse.corps).digest("hex"),
    ...corpsGarde(contenu),
  };
}

type Obtention = { readonly genre: "gardee"; readonly reponse: ReponseGardee } | Extract<IssueSource, { genre: "transport" | "plafond" }>;

async function appeler(demande: Demande, editeur: EditeurExtraction, contexte: ContexteExtraction): Promise<Obtention> {
  try {
    const appel = await appelerExtracteur(editeur, demande.prompt, new AbortController().signal);
    const reponse = reponseGardee(demande, editeur.adaptateur.modele, appel.reponse, appel.contenu, contexte);
    ecrireReponse(contexte.sortie, reponse);
    return { genre: "gardee", reponse };
  } catch (erreur) {
    if (erreur instanceof ErreurReseau || erreur instanceof CorpsNonUtf8) return { genre: "transport", message: erreur.message };
    throw erreur;
  }
}

function plafondAtteint(compteurs: Compteurs, plafond: number | null): boolean {
  return plafond !== null && compteurs.appels >= plafond;
}

async function obtenir(demande: Demande, editeur: EditeurExtraction, contexte: ContexteExtraction, compteurs: Compteurs): Promise<Obtention> {
  const cle = { ...demande.lue.entree, modele: editeur.adaptateur.modele, prompt_sha256: demande.prompt_sha256 };
  const deja = lireReponseGardee(contexte.sortie, cle);
  if (deja !== null) {
    compteurs.reutilisees += 1;
    return { genre: "gardee", reponse: deja };
  }
  if (plafondAtteint(compteurs, contexte.plafond)) return { genre: "plafond" };
  compteurs.appels += 1;
  return appeler(demande, editeur, contexte);
}

/** Les deux réponses, dans l'ordre de la configuration ; s'arrête au premier échec. */
async function obtenirLesDeux(demande: Demande, editeurs: readonly EditeurExtraction[], contexte: ContexteExtraction, compteurs: Compteurs) {
  const gardees: ReponseGardee[] = [];
  for (const editeur of editeurs) {
    const obtention = await obtenir(demande, editeur, contexte, compteurs);
    if (obtention.genre !== "gardee") return obtention;
    gardees.push(obtention.reponse);
  }
  return { genre: "gardees" as const, gardees };
}

/* ------------------------------------------------------------------ cœur */

interface Lue {
  readonly reponse: ReponseGardee;
  readonly lecture: LectureTexteModele;
}

function lire(gardees: readonly ReponseGardee[], editeurs: readonly EditeurExtraction[]): readonly Lue[] {
  return gardees.map((reponse, rang) => {
    const editeur = editeurs[rang];
    if (editeur === undefined) throw new Error(`Aucun éditeur au rang ${rang} pour relire la réponse de ${reponse.modele}.`);
    return { reponse, lecture: lectureDe(editeur.adaptateur, reponse.statut_http, contenuGarde(reponse)) };
  });
}

/** La sortie transmise au cœur : le texte du modèle, ou la chaîne vide qu'il rejette (voir l'en-tête). */
function sortieDe(lecture: LectureTexteModele): string {
  return lecture.lisible ? lecture.texte : "";
}

function extraire(demande: Demande, materiau: Materiau, lues: readonly Lue[], contexte: ContexteExtraction): ResultatExtraction {
  const resultat = extraireSource(
    {
      configuration: contexte.configuration,
      extracteur_epingle: demande.lue.entree.extracteur_epingle,
      candidat_id: demande.lue.entree.candidat_id,
      source: materiau.source,
      fiches: materiau.fiches,
      texte: materiau.texte,
      vtt: materiau.vtt,
      sorties: new Map(lues.map((lue) => [lue.reponse.modele, sortieDe(lue.lecture)])),
      commit: contexte.commit,
    },
    { maintenant: () => instantParis(contexte.maintenant()), nouvelUlid: contexte.nouvelUlid },
  );
  const illisible = lues.some((lue) => !lue.lecture.lisible);
  if (illisible && !resultat.rejets.some((rejet) => rejet.portee === "source")) {
    throw new Error(`Source ${demande.lue.cle} : une lecture illisible n'a pas refusé la source (D53 (2)) ; la commande s'arrête.`);
  }
  return resultat;
}

function issueDe(resultat: ResultatExtraction): IssueJournal {
  if (resultat.rejets.some((rejet) => rejet.portee === "source")) return { statut: "refusee", rejets: resultat.rejets };
  return {
    statut: "extraite",
    items: resultat.items.map((item) => item.id),
    mesures: resultat.mesures.map((mesure) => mesure.id),
    rejets: resultat.rejets,
  };
}

function reponseJournal(lue: Lue): ReponseJournal {
  return {
    modele: lue.reponse.modele,
    statut_http: lue.reponse.statut_http,
    brut_octets_sha256: lue.reponse.brut_octets_sha256,
    lecture: lue.lecture.lisible ? { lisible: true } : { lisible: false, raison: lue.lecture.raison },
  };
}

function deposer(demande: Demande, materiau: Materiau, lues: readonly Lue[], contexte: ContexteExtraction): IssueJournal {
  const resultat = extraire(demande, materiau, lues, contexte);
  resultat.items.forEach((item) => ecrireItem(contexte.sortie, item));
  resultat.mesures.forEach((mesure) => ecrireMesure(contexte.sortie, mesure));
  const journal: JournalExtraction = {
    cle_source: demande.lue.entree.cle_source,
    sha256_source: demande.lue.entree.sha256_source,
    texte_sha256: materiau.fiche.texte_sha256,
    date: instantParis(contexte.maintenant()),
    commit: contexte.commit,
    version_prompt: contexte.configuration.version_prompt,
    prompt_sha256: demande.prompt_sha256,
    reponses: lues.map(reponseJournal),
    issue: issueDe(resultat),
  };
  ecrireJournal(contexte.sortie, journal);
  return journal.issue;
}

/* ----------------------------------------------------------------- source */

function variablesDe(lue: EntreeLue, materiau: Materiau): VariablesExtraction {
  return {
    candidat_id: lue.entree.candidat_id,
    type_document: materiau.source.type_document,
    format: materiau.source.format,
    texte_canonique: materiau.texte,
  };
}

function exigerOrdre(editeurs: readonly EditeurExtraction[], configuration: ConfigurationExtraction): void {
  const modeles = editeurs.map((editeur) => editeur.adaptateur.modele);
  if (modeles.join("\n") !== configuration.modeles.join("\n")) {
    throw new Error(`Éditeurs ${JSON.stringify(modeles)} hors de l'ordre de la configuration ${JSON.stringify(configuration.modeles)}.`);
  }
}

async function traiterLue(lue: EntreeLue, contexte: ContexteExtraction, compteurs: Compteurs): Promise<IssueSource> {
  const materiau = materiauDe(contexte.staging, lue);
  const variables = variablesDe(lue, materiau);
  const prompt = rendrePromptExtraction(contexte.texte_prompt, variables);
  const demande: Demande = { lue, prompt, prompt_sha256: sha256(prompt) };
  const editeurs = contexte.editeurs(variables);
  exigerOrdre(editeurs, contexte.configuration);
  const obtenues = await obtenirLesDeux(demande, editeurs, contexte, compteurs);
  if (obtenues.genre !== "gardees") return obtenues;
  return { genre: "traitee", issue: deposer(demande, materiau, lire(obtenues.gardees, editeurs), contexte) };
}

async function traiterSource(cle: string, contexte: ContexteExtraction, compteurs: Compteurs): Promise<IssueSource> {
  try {
    const lue = lireEntree(contexte.staging, cle);
    if (journalPresent(contexte.sortie, lue.entree.cle_source, lue.entree.sha256_source)) return { genre: "sautee" };
    return await traiterLue(lue, contexte, compteurs);
  } catch (erreur) {
    if (INCOHERENCES.some((classe) => erreur instanceof classe)) return { genre: "incoherente", message: (erreur as Error).message };
    throw erreur;
  }
}

/* ------------------------------------------------------------------ bilan */

type Comptes = { -readonly [K in keyof Bilan]: Bilan[K] };

const SIGNALEMENTS: { readonly [G in IssueSource["genre"]]: (cle: string, issue: Extract<IssueSource, { genre: G }>) => string } = {
  sautee: (cle) => `${cle} : journal présent, sautée.`,
  traitee: (cle, issue) => `${cle} : ${issue.issue.statut}${issue.issue.statut === "extraite" ? `, ${issue.issue.items.length} item(s)` : ""}.`,
  incoherente: (_cle, issue) => `${issue.message} Rien n'est écrit pour cette source.`,
  transport: (cle, issue) => `${cle} : ${issue.message} Source laissée à traiter.`,
  plafond: (cle) => `${cle} : plafond d'appels atteint, la commande s'arrête ici.`,
};

function compter(comptes: Comptes, issue: IssueSource): void {
  const champ = { sautee: "sautees", incoherente: "incoherentes", transport: "echecs_transport" } as const;
  if (issue.genre === "traitee") {
    const extraite = issue.issue.statut === "extraite";
    comptes.extraites += extraite ? 1 : 0;
    comptes.refusees += extraite ? 0 : 1;
    comptes.items += extraite ? issue.issue.items.length : 0;
    comptes.mesures += extraite ? issue.issue.mesures.length : 0;
    return;
  }
  if (issue.genre === "plafond") {
    comptes.plafond_atteint = true;
    return;
  }
  comptes[champ[issue.genre]] += 1;
}

function signaler(cle: string, issue: IssueSource, contexte: ContexteExtraction): void {
  const ligne = (SIGNALEMENTS[issue.genre] as (cle: string, issue: IssueSource) => string)(cle, issue);
  contexte.signaler(ligne);
}

/** Traite chaque source listée, dans l'ordre, jusqu'à la fin ou jusqu'au plafond. */
export async function executer(cles: readonly string[], contexte: ContexteExtraction): Promise<Bilan> {
  const compteurs: Compteurs = { appels: 0, reutilisees: 0 };
  const comptes: Comptes = {
    sources: cles.length,
    sautees: 0,
    extraites: 0,
    refusees: 0,
    incoherentes: 0,
    echecs_transport: 0,
    appels: 0,
    reutilisees: 0,
    items: 0,
    mesures: 0,
    plafond_atteint: false,
  };
  for (const cle of cles) {
    const issue = await traiterSource(cle, contexte, compteurs);
    signaler(cle, issue, contexte);
    compter(comptes, issue);
    if (comptes.plafond_atteint) break;
  }
  return { ...comptes, appels: compteurs.appels, reutilisees: compteurs.reutilisees };
}
