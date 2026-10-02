/**
 * L'éditeur simulé : un adaptateur et un transport sans réseau, pour `pnpm run:dry` et les tests.
 *
 * Il imite une API de messages ordinaire — corps JSON, stop_reason, identifiant de modèle
 * renvoyé, refus de modération signalé par un statut et un code — et ne produit aucun contenu
 * réel : le texte de ses réponses dit qu'il est simulé et ne parle d'aucun candidat.
 *
 * Ce qui le distingue d'un autre éditeur est rangé dans `REGLES_SIMULE`, des données : c'est le
 * modèle de ce que sera l'adaptateur d'un éditeur réel (D3), jamais un `if` sur un outil.
 */

import { canoniser, sha256 } from "../../validation/domaine/empreinte.ts";
import { TOKENS_SORTIE_MAX } from "./conditions.ts";
import {
  CorpsNonObjet,
  ErreurReseau,
  estObjetJson,
  lireJson,
  RefusNonObjet,
  type Adaptateur,
  type Classement,
  type EntreeRequete,
  type LectureJson,
  type MetadonneesRenvoyees,
  type Projection,
  type ReponseHttp,
  type RequeteHttp,
  type Transport,
} from "./editeur.ts";
import type { Horloge } from "./horloge.ts";
import type { Mode, ObjetJson } from "./types.ts";

/* ------------------------------------------------------------------ règles */

/** Les particularités de l'éditeur simulé, en données. */
export const REGLES_SIMULE = {
  endpoint: "simule://editeur-simule.invalid/v1/messages",
  /** Refus de modération identifiable : ce statut ET ce code d'erreur, rien d'autre. */
  refus: { statut: 400, code: "contenu_refuse" },
  statuts_quota: [429] as readonly number[],
  /** stop_reason qui disent une réponse coupée par la limite de longueur. */
  stop_troncature: ["max_tokens"] as readonly string[],
  /** Ce que chaque mode ajoute au corps de la requête. */
  champs_mode: {
    web_activee: { outils: [{ type: "recherche_web" }] },
    web_desactivee: {},
  } satisfies Readonly<Record<Mode, ObjetJson>>,
  /** Valeurs par défaut que l'éditeur simulé déclare appliquer : aucune n'est envoyée. */
  parametres_par_defaut: { temperature: 1, top_p: 1 },
} as const;

/* -------------------------------------------------------------- lecture JSON */

function champ(objet: unknown, cle: string): unknown {
  return estObjetJson(objet) ? objet[cle] : undefined;
}

function texteOuNull(valeur: unknown): string | null {
  return typeof valeur === "string" ? valeur : null;
}

/** Le code d'erreur d'un corps lu : `error.code` d'un objet, ou du premier élément d'une liste. */
function codeErreur(lecture: LectureJson): string | null {
  if (!lecture.lisible) return null;
  const porteur = Array.isArray(lecture.valeur) ? (lecture.valeur as readonly unknown[])[0] : lecture.valeur;
  return texteOuNull(champ(champ(porteur, "error"), "code"));
}

function blocs(brut: ObjetJson): readonly ObjetJson[] {
  const contenu = brut["content"];
  if (!Array.isArray(contenu) || !contenu.every(estObjetJson)) {
    throw new Error("Éditeur simulé : `content` absent ou malformé ; la normalisation ne devine rien.");
  }
  return contenu;
}

function citationsDe(bloc: ObjetJson): readonly ObjetJson[] {
  const citations = bloc["citations"];
  return Array.isArray(citations) ? citations.filter(estObjetJson) : [];
}

function urlDe(citation: ObjetJson): readonly string[] {
  const url = citation["url"];
  return typeof url === "string" ? [url] : [];
}

/* --------------------------------------------------------------- adaptateur */

function construireRequete(cle_api: string, entree: EntreeRequete): RequeteHttp {
  return {
    endpoint: REGLES_SIMULE.endpoint,
    entetes_authentification: { authorization: `Bearer ${cle_api}` },
    corps: {
      model: entree.modele_demande,
      max_tokens: TOKENS_SORTIE_MAX,
      messages: [{ role: "user", content: entree.texte }],
      ...REGLES_SIMULE.champs_mode[entree.mode],
    },
  };
}

function estRefus(statut: number, lecture: LectureJson): boolean {
  return statut === REGLES_SIMULE.refus.statut && codeErreur(lecture) === REGLES_SIMULE.refus.code;
}

function classerReussite(reponse: ReponseHttp): Classement {
  const lecture = lireJson(reponse.corps);
  if (!lecture.lisible || !estObjetJson(lecture.valeur)) throw new CorpsNonObjet(reponse.statut, reponse.corps);
  return { issue: "reponse", brut: lecture.valeur };
}

function classerRefus(reponse: ReponseHttp, lecture: LectureJson): Classement {
  if (!lecture.lisible || !estObjetJson(lecture.valeur)) throw new RefusNonObjet(reponse.statut, reponse.corps);
  return { issue: "refus_api", brut: lecture.valeur };
}

function classerEchec(statut: number, lecture: LectureJson): Classement {
  const code = codeErreur(lecture);
  const type = REGLES_SIMULE.statuts_quota.includes(statut) ? "quota" : "http";
  const message = code === null ? `HTTP ${statut}` : `HTTP ${statut} (${code})`;
  return { issue: "echec", erreur: { type, message, code_http: statut } };
}

function classer(reponse: ReponseHttp): Classement {
  if (reponse.statut >= 200 && reponse.statut < 300) return classerReussite(reponse);
  const lecture = lireJson(reponse.corps);
  if (estRefus(reponse.statut, lecture)) return classerRefus(reponse, lecture);
  return classerEchec(reponse.statut, lecture);
}

/** troncature dérivée du stop_reason ; un stop_reason absent n'autorise aucune supposition. */
function troncatureDe(brut: ObjetJson): boolean {
  const stop = texteOuNull(brut["stop_reason"]);
  if (stop === null) {
    throw new Error("Éditeur simulé : réponse sans stop_reason ; la troncature ne se devine pas.");
  }
  return REGLES_SIMULE.stop_troncature.includes(stop);
}

function normaliser(brut: ObjetJson): Projection {
  const contenu = blocs(brut);
  const textes = contenu.filter((bloc) => bloc["type"] === "text");
  const citations = textes.flatMap(citationsDe);
  return {
    texte: textes.map((bloc) => texteOuNull(bloc["text"])).filter((t) => t !== null).join(""),
    liens: citations.flatMap(urlDe),
    citations,
    troncature: troncatureDe(brut),
  };
}

function entierOuAbsent(valeur: unknown): number | undefined {
  return typeof valeur === "number" && Number.isInteger(valeur) ? valeur : undefined;
}

function tokensDe(brut: ObjetJson): MetadonneesRenvoyees["tokens"] {
  const entree = entierOuAbsent(champ(brut["usage"], "input_tokens"));
  const sortie = entierOuAbsent(champ(brut["usage"], "output_tokens"));
  if (entree === undefined || sortie === undefined) return undefined;
  return { entree, sortie };
}

function metadonnees(brut: ObjetJson): MetadonneesRenvoyees {
  const tokens = tokensDe(brut);
  const base = { modele_renvoye: texteOuNull(brut["model"]), stop_reason: texteOuNull(brut["stop_reason"]) };
  return tokens === undefined ? base : { ...base, tokens };
}

function parametresEffectifs(requete: RequeteHttp): ObjetJson {
  return {
    max_tokens: requete.corps["max_tokens"],
    instruction_systeme: "aucune",
    ...REGLES_SIMULE.parametres_par_defaut,
  };
}

export function adaptateurSimule(cle_api: string): Adaptateur {
  return {
    normalisation: { fonction: "normaliser_editeur_simule", version: "1.0.0" },
    construireRequete: (entree) => construireRequete(cle_api, entree),
    parametresEffectifs,
    classer,
    normaliser,
    metadonnees,
  };
}

/* ---------------------------------------------------------------- transport */

export type IssueSimulee =
  | {
      readonly genre: "reponse";
      readonly texte: string;
      readonly stop_reason: string;
      readonly modele: string | null;
      readonly liens: readonly string[];
    }
  | { readonly genre: "refus" }
  | { readonly genre: "refus_non_objet" }
  | { readonly genre: "http"; readonly statut: number }
  | { readonly genre: "quota" }
  | { readonly genre: "reseau" }
  | { readonly genre: "lent" };

/** L'issue du `rang`-ième envoi (à partir de 1) d'un même corps de requête. */
export type Scenario = (corps: ObjetJson, rang: number) => IssueSimulee;

/** Latence simulée d'un envoi qui aboutit ; un envoi « lent » dépasse le délai de 180 s. */
export const LATENCE_SIMULEE_MS = 1_200;
export const LATENCE_LENTE_MS = 600_000;

/** L'envoi abandonné par l'exécution (délai dépassé) : personne n'attend plus sa réponse. */
export class EnvoiAbandonne extends Error {
  constructor() {
    super("Envoi simulé abandonné par l'appelant.");
    this.name = "EnvoiAbandonne";
  }
}

function corpsJson(valeur: unknown): string {
  return JSON.stringify(valeur);
}

function corpsReponse(issue: Extract<IssueSimulee, { genre: "reponse" }>, numero: number): string {
  const modele = issue.modele === null ? {} : { model: issue.modele };
  return corpsJson({
    id: `sim-${numero}`,
    type: "message",
    ...modele,
    content: [{ type: "text", text: issue.texte, citations: issue.liens.map((url) => ({ url })) }],
    stop_reason: issue.stop_reason,
    usage: { input_tokens: 12, output_tokens: 34 },
  });
}

const CORPS_REFUS = corpsJson({
  type: "error",
  error: { type: "moderation", code: REGLES_SIMULE.refus.code, message: "Requête refusée par la modération (simulée)." },
});

/** Ce qu'un envoi « lent » renverrait s'il était attendu au-delà de 180 s, ce qui n'arrive pas. */
const REPONSE_TARDIVE = {
  genre: "reponse",
  texte: "Réponse simulée tardive.",
  stop_reason: "end_turn",
  modele: null,
  liens: [],
} as const satisfies IssueSimulee;

const CORPS_REFUS_LISTE = corpsJson([{ error: { code: REGLES_SIMULE.refus.code, message: "Refus simulé." } }]);

function reponseHttp(issue: IssueSimulee, numero: number): ReponseHttp {
  switch (issue.genre) {
    case "reponse":
      return { statut: 200, corps: corpsReponse(issue, numero) };
    case "refus":
      return { statut: REGLES_SIMULE.refus.statut, corps: CORPS_REFUS };
    case "refus_non_objet":
      return { statut: REGLES_SIMULE.refus.statut, corps: CORPS_REFUS_LISTE };
    case "http":
      return { statut: issue.statut, corps: "Service Unavailable" };
    case "quota":
      return { statut: 429, corps: corpsJson({ type: "error", error: { code: "quota_depasse" } }) };
    case "lent":
      return { statut: 200, corps: corpsReponse(REPONSE_TARDIVE, numero) };
    case "reseau":
      throw new ErreurReseau("Connexion simulée interrompue.");
  }
}

export class TransportSimule implements Transport {
  /** Chaque requête reçue, en-têtes compris, dans l'ordre : ce que le serveur simulé a vu. */
  readonly recues: { readonly requete: RequeteHttp; readonly instant: number }[] = [];
  private readonly rangs = new Map<string, number>();
  private readonly horloge: Horloge;
  private readonly scenario: Scenario;

  constructor(horloge: Horloge, scenario: Scenario) {
    this.horloge = horloge;
    this.scenario = scenario;
  }

  async envoyer(requete: RequeteHttp, signal: AbortSignal): Promise<ReponseHttp> {
    this.recues.push({ requete, instant: this.horloge.maintenant() });
    const cle = canoniser(requete.corps);
    const precedent = this.rangs.get(cle);
    const rang = precedent === undefined ? 1 : precedent + 1;
    this.rangs.set(cle, rang);
    const issue = this.scenario(requete.corps, rang);
    const latence = issue.genre === "lent" ? LATENCE_LENTE_MS : LATENCE_SIMULEE_MS;
    if ((await this.horloge.attendre(latence, signal)) === "annulee") throw new EnvoiAbandonne();
    return reponseHttp(issue, this.recues.length);
  }
}

/* ----------------------------------------------------------- scénario du run */

const TEXTE_SIMULE = "Réponse simulée par l'éditeur simulé : aucun contenu réel, aucun candidat.";

/** Les issues nommées qu'un profil de fixture peut citer. */
export const ISSUES_NOMMEES: Readonly<Record<string, IssueSimulee>> = {
  reponse: {
    genre: "reponse",
    texte: TEXTE_SIMULE,
    stop_reason: "end_turn",
    modele: "modele-simule-2026-12",
    liens: ["https://source-simulee.invalid/page"],
  },
  tronquee: { genre: "reponse", texte: TEXTE_SIMULE, stop_reason: "max_tokens", modele: "modele-simule-2026-12", liens: [] },
  sans_modele: { genre: "reponse", texte: TEXTE_SIMULE, stop_reason: "end_turn", modele: null, liens: [] },
  refus: { genre: "refus" },
  http_503: { genre: "http", statut: 503 },
  quota: { genre: "quota" },
  reseau: { genre: "reseau" },
  lent: { genre: "lent" },
};

function issueNommee(nom: string): IssueSimulee {
  const issue = ISSUES_NOMMEES[nom];
  if (issue === undefined) throw new Error(`Issue simulée inconnue : « ${nom} » (ISSUES_NOMMEES).`);
  return issue;
}

/**
 * Un scénario déterministe : l'issue d'un envoi est l'élément du profil désigné par l'empreinte
 * du corps et du rang. Aucune graine : la même requête au même rang a toujours la même issue.
 */
export function scenarioParEmpreinte(profil: readonly string[]): Scenario {
  if (profil.length === 0) throw new Error("Profil d'éditeur simulé vide.");
  const issues = profil.map(issueNommee);
  return (corps, rang) => {
    const empreinte = sha256(canoniser({ corps, rang }));
    const indice = Number.parseInt(empreinte.slice(0, 8), 16) % issues.length;
    const issue = issues[indice];
    if (issue === undefined) throw new Error(`Indice de profil hors bornes : ${indice}.`);
    return issue;
  };
}
