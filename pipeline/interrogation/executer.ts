/**
 * L'exécution d'un run d'interrogation (§6) : chaque outil a sa file, les files avancent en
 * parallèle, chaque requête a au plus trois tentatives dans la fenêtre du run, et chaque requête
 * finit en une réponse écrite une fois — obtenue, ou manquante avec son motif.
 *
 * Reprise : une requête dont la réponse est écrite est sautée ; sinon ses tentatives déjà
 * journalisées comptent (`journal.ts`), et l'exécution reprend à la suivante, après l'attente qui
 * la précède. Relancer un run complet ne fait donc rien.
 *
 * Une erreur qui n'est pas un échec de tentative (corps de refus illisible, réponse malformée,
 * réponse non conforme au schéma) arrête la file de son outil ; les autres files vont au bout, puis
 * l'erreur remonte. Sa tentative reste journalisée sans résultat.
 */

import { mkdirSync } from "node:fs";
import { empreinteDe } from "../../validation/domaine/empreinte.ts";
import { ulid } from "../../validation/domaine/ulid.ts";
import { attenteAvantTentative, TENTATIVES_MAX } from "./conditions.ts";
import type { Adaptateur, Editeur, RequeteHttp } from "./editeur.ts";
import { tentativePeutDemarrer, type Fenetre } from "./fenetre.ts";
import { instantParis } from "./heure-paris.ts";
import type { Horloge } from "./horloge.ts";
import { JournalRequete } from "./journal.ts";
import type { PlanInterrogation } from "./plan.ts";
import type { DepotReponses } from "./stockage.ts";
import { conclure, envoyerSousDelai } from "./tentatives.ts";
import {
  cleDe,
  type MotifManquante,
  type ObjetJson,
  type ProjectionNormalisee,
  type ReponseEcrite,
  type ReponseManquante,
  type ReponseObtenue,
  type RequetePlanifiee,
  type Tentative,
} from "./types.ts";

export interface ContexteRun {
  readonly run_id: string;
  readonly fenetre: Fenetre;
  readonly horloge: Horloge;
  readonly depot: DepotReponses;
  /** Répertoire des journaux de tentatives (`volume/tentatives/`). */
  readonly repertoire_tentatives: string;
  /** L'éditeur de chaque outil du plan. Un outil sans éditeur lève avant tout envoi. */
  readonly editeurs: ReadonlyMap<string, Editeur>;
}

export interface BilanExecution {
  readonly ecrites: number;
  readonly deja_ecrites: number;
}

export class RunHorsFenetre extends Error {
  constructor(maintenant: string, fenetre: Fenetre) {
    super(`Exécution lancée le ${maintenant}, avant l'ouverture de la fenêtre ${fenetre.debut} (§6).`);
    this.name = "RunHorsFenetre";
  }
}

/** Ce qu'une requête traverse, de son premier envoi à sa réponse écrite. */
interface Course {
  readonly requete: RequetePlanifiee;
  readonly http: RequeteHttp;
  readonly editeur: Editeur;
  readonly journal: JournalRequete;
  readonly contexte: ContexteRun;
}

type Aboutissement =
  | {
      readonly genre: "obtenue";
      readonly tentatives: readonly Tentative[];
      readonly brut: ObjetJson;
      readonly refus_api: boolean;
      readonly debut_ms: number;
      readonly fin_ms: number;
    }
  | { readonly genre: "manquante"; readonly motif: MotifManquante; readonly tentatives: readonly Tentative[] };

type Essai =
  | { readonly genre: "obtenue"; readonly brut: ObjetJson; readonly refus_api: boolean; readonly debut_ms: number; readonly fin_ms: number }
  | { readonly genre: "echec"; readonly tentative: Tentative };

/* ----------------------------------------------------------------- tentatives */

/** Attend l'heure de la tentative `numero` ; faux si elle tomberait à la fin de la fenêtre ou après. */
async function attendreSonTour(numero: number, contexte: ContexteRun): Promise<boolean> {
  const { horloge, fenetre } = contexte;
  const attente = numero === 1 ? 0 : attenteAvantTentative(numero);
  if (!tentativePeutDemarrer(fenetre, horloge.maintenant() + attente)) return false;
  if (attente > 0) await horloge.attendre(attente, new AbortController().signal);
  return tentativePeutDemarrer(fenetre, horloge.maintenant());
}

async function tenter(numero: number, course: Course): Promise<Essai> {
  const { horloge } = course.contexte;
  const debut_ms = horloge.maintenant();
  const horodatage = instantParis(debut_ms);
  course.journal.inscrireDebut(numero, horodatage, cleDe(course.requete));
  const conclusion = conclure(await envoyerSousDelai(course.editeur, course.http, horloge), course.editeur.adaptateur);
  if (conclusion.genre === "echec") {
    course.journal.inscrireEchec(numero, conclusion.erreur);
    return { genre: "echec", tentative: { numero, horodatage, erreur: conclusion.erreur } };
  }
  return { ...conclusion, debut_ms, fin_ms: horloge.maintenant() };
}

async function poursuivre(course: Course, passees: readonly Tentative[]): Promise<Aboutissement> {
  const tentatives = [...passees];
  while (tentatives.length < TENTATIVES_MAX) {
    const numero = tentatives.length + 1;
    if (!(await attendreSonTour(numero, course.contexte))) return { genre: "manquante", motif: "hors_fenetre", tentatives };
    const essai = await tenter(numero, course);
    if (essai.genre === "obtenue") return { ...essai, tentatives };
    tentatives.push(essai.tentative);
  }
  return { genre: "manquante", motif: "echecs", tentatives };
}

/* ------------------------------------------------------------------ réponse */

/** Décision de l'auteur du 2026-10-02 : la projection d'un refus de l'API est fixée. */
const PROJECTION_REFUS: ProjectionNormalisee = { texte: "", liens: [], troncature: false, refus_api: true };

function projection(adaptateur: Adaptateur, brut: ObjetJson, refus_api: boolean): ProjectionNormalisee {
  return refus_api ? PROJECTION_REFUS : { ...adaptateur.normaliser(brut), refus_api: false };
}

/** La requête telle qu'enregistrée : son corps, sans aucun en-tête (seul retrait autorisé). */
function requeteEnregistree(http: RequeteHttp, horodatage: string): ReponseEcrite["requete"] {
  return { corps: http.corps, sha256: empreinteDe(http.corps), endpoint: http.endpoint, horodatage };
}

function commun(course: Course, horodatage_requete: string) {
  const { requete, contexte } = course;
  return {
    id: ulid(contexte.horloge.maintenant()),
    run_id: contexte.run_id,
    contexte: "run",
    canal: "api",
    alias_aveugle: requete.alias_aveugle,
    outil_id: requete.outil_id,
    mode: requete.mode,
    question_id: requete.question_id,
    formulation_id: requete.formulation_id,
    echantillon: requete.echantillon,
    requete: requeteEnregistree(course.http, horodatage_requete),
  } as const;
}

function reponseObtenue(course: Course, fin: Extract<Aboutissement, { genre: "obtenue" }>): ReponseObtenue {
  const { adaptateur } = course.editeur;
  const renvoyees = adaptateur.metadonnees(fin.brut);
  const tokens = renvoyees.tokens === undefined ? {} : { tokens: renvoyees.tokens };
  const tentatives = fin.tentatives.length === 0 ? {} : { tentatives: fin.tentatives };
  const premiere = fin.tentatives[0];
  return {
    ...commun(course, premiere === undefined ? instantParis(fin.debut_ms) : premiere.horodatage),
    statut_reponse: "obtenue",
    brut: fin.brut,
    brut_sha256: empreinteDe(fin.brut),
    normalise: projection(adaptateur, fin.brut, fin.refus_api),
    normalisation: adaptateur.normalisation,
    metadonnees: {
      modele_demande: course.requete.modele_demande,
      modele_renvoye: renvoyees.modele_renvoye,
      horodatage_requete: instantParis(fin.debut_ms),
      horodatage_reponse: instantParis(fin.fin_ms),
      latence_ms: fin.fin_ms - fin.debut_ms,
      stop_reason: renvoyees.stop_reason,
      parametres_effectifs: adaptateur.parametresEffectifs(course.http),
      ...tokens,
    },
    ...tentatives,
  };
}

/**
 * Une manquante sans aucune tentative n'a jamais été envoyée : son horodatage de requête est
 * l'instant où elle a été constituée et déclarée hors fenêtre (`motif_manquante`, schéma).
 */
function reponseManquante(course: Course, fin: Extract<Aboutissement, { genre: "manquante" }>): ReponseManquante {
  const premiere = fin.tentatives[0];
  const horodatage = premiere === undefined ? instantParis(course.contexte.horloge.maintenant()) : premiere.horodatage;
  return {
    ...commun(course, horodatage),
    statut_reponse: "manquante",
    motif_manquante: fin.motif,
    tentatives: fin.tentatives,
  };
}

function reponseDe(course: Course, fin: Aboutissement): ReponseEcrite {
  return fin.genre === "obtenue" ? reponseObtenue(course, fin) : reponseManquante(course, fin);
}

/* ------------------------------------------------------------------- files */

type IssueRequete = "ecrite" | "deja_ecrite";

async function executerRequete(requete: RequetePlanifiee, editeur: Editeur, contexte: ContexteRun): Promise<IssueRequete> {
  if (contexte.depot.contient(requete)) return "deja_ecrite";
  const journal = new JournalRequete(contexte.repertoire_tentatives, cleDe(requete));
  const http = editeur.adaptateur.construireRequete({
    texte: requete.texte,
    mode: requete.mode,
    modele_demande: requete.modele_demande,
  });
  const course: Course = { requete, http, editeur, journal, contexte };
  const fin = await poursuivre(course, journal.tentativesPassees());
  contexte.depot.ecrire(reponseDe(course, fin));
  return "ecrite";
}

async function executerFile(requetes: readonly RequetePlanifiee[], editeur: Editeur, contexte: ContexteRun): Promise<IssueRequete[]> {
  const issues: IssueRequete[] = [];
  for (const requete of requetes) issues.push(await executerRequete(requete, editeur, contexte));
  return issues;
}

function editeurDe(contexte: ContexteRun, outil_id: string): Editeur {
  const editeur = contexte.editeurs.get(outil_id);
  if (editeur === undefined) throw new Error(`Aucun éditeur pour l'outil ${outil_id} : il ne sera pas interrogé en silence.`);
  return editeur;
}

/** La première file arrêtée, dans l'ordre du plan ; sa raison telle quelle quand c'est une erreur. */
function premierRejet(resultats: readonly PromiseSettledResult<IssueRequete[]>[]): Error | null {
  const rejet = resultats.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (rejet === undefined) return null;
  const raison: unknown = rejet.reason;
  return raison instanceof Error ? raison : new Error(`File d'outil arrêtée : ${String(raison)}`);
}

export async function executerRun(plan: PlanInterrogation, contexte: ContexteRun): Promise<BilanExecution> {
  const maintenant = contexte.horloge.maintenant();
  if (maintenant < contexte.fenetre.debut_ms) throw new RunHorsFenetre(instantParis(maintenant), contexte.fenetre);
  const files = [...plan].map(([outil_id, requetes]) => ({ requetes, editeur: editeurDe(contexte, outil_id) }));
  mkdirSync(contexte.repertoire_tentatives, { recursive: true });
  const resultats = await Promise.allSettled(files.map((f) => executerFile(f.requetes, f.editeur, contexte)));
  const rejet = premierRejet(resultats);
  if (rejet !== null) throw rejet;
  const issues = resultats.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return {
    ecrites: issues.filter((i) => i === "ecrite").length,
    deja_ecrites: issues.filter((i) => i === "deja_ecrite").length,
  };
}
