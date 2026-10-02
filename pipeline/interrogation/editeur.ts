/**
 * L'interface d'un éditeur interrogé (D3) : un adaptateur, propre à l'éditeur, et un transport.
 *
 * Tout ce qui distingue un éditeur d'un autre vit dans son adaptateur — la forme de la requête,
 * le mode web, la reconnaissance d'un refus de modération, la lecture du stop_reason — et jamais
 * dans un `if` sur un outil. L'exécution (`executer.ts`) ne connaît que cette interface.
 *
 * D3 : la réponse brute stockée est le corps HTTP tel que reçu, jamais l'objet d'un SDK. Le
 * transport rend donc le texte du corps et son statut, rien d'autre ; c'est l'adaptateur qui le lit.
 */

import type { ErreurTentative, Mode, ObjetJson } from "./types.ts";

/** Une requête prête à partir. Les en-têtes d'authentification ne sont jamais enregistrés. */
export interface RequeteHttp {
  readonly endpoint: string;
  readonly entetes_authentification: Readonly<Record<string, string>>;
  readonly corps: ObjetJson;
}

/** Ce que le serveur a renvoyé : le statut et le corps, texte tel que reçu. */
export interface ReponseHttp {
  readonly statut: number;
  readonly corps: string;
}

/** Échec du transport lui-même (connexion refusée, coupée) : erreur de tentative « reseau ». */
export class ErreurReseau extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurReseau";
  }
}

export interface Transport {
  /** Rejette `ErreurReseau` sur un échec de transport ; un `signal` levé abandonne l'envoi. */
  envoyer(requete: RequeteHttp, signal: AbortSignal): Promise<ReponseHttp>;
}

/** Ce que l'adaptateur conclut d'une réponse HTTP. */
export type Classement =
  | { readonly issue: "reponse"; readonly brut: ObjetJson }
  | { readonly issue: "refus_api"; readonly brut: ObjetJson }
  | { readonly issue: "echec"; readonly erreur: ErreurTentative };

/** La projection avec perte d'une réponse ordinaire ; `refus_api` est posé par l'exécution. */
export interface Projection {
  readonly texte: string;
  readonly liens: readonly string[];
  readonly citations?: readonly ObjetJson[];
  readonly appels_outils?: readonly ObjetJson[];
  readonly troncature: boolean;
}

/** Ce que l'API renvoie sur elle-même. Une valeur absente vaut `null`, jamais une copie. */
export interface MetadonneesRenvoyees {
  readonly modele_renvoye: string | null;
  readonly stop_reason: string | null;
  readonly tokens?: { readonly entree?: number; readonly sortie?: number };
}

export interface EntreeRequete {
  readonly texte: string;
  readonly mode: Mode;
  readonly modele_demande: string;
}

export interface Adaptateur {
  /** `reponse.normalisation` : la fonction de projection et sa version. */
  readonly normalisation: { readonly fonction: string; readonly version: string };
  /** §6 : aucune instruction système, paramètres par défaut, 2 048 tokens, le texte seul. */
  construireRequete(entree: EntreeRequete): RequeteHttp;
  /** §6 : les valeurs effectives des paramètres, enregistrées dans les métadonnées. */
  parametresEffectifs(requete: RequeteHttp): ObjetJson;
  classer(reponse: ReponseHttp): Classement;
  normaliser(brut: ObjetJson): Projection;
  metadonnees(brut: ObjetJson): MetadonneesRenvoyees;
}

export interface Editeur {
  readonly adaptateur: Adaptateur;
  readonly transport: Transport;
}

/**
 * Le corps d'un refus de modération n'est pas un objet JSON : `reponse.brut` ne peut pas le
 * porter tel quel, et l'envelopper serait le reformater (règle 7). Question ouverte, posée à
 * l'auteur ; d'ici là, le run s'arrête sur cette requête.
 */
export class RefusNonObjet extends Error {
  constructor(statut: number, corps: string) {
    super(
      `Refus de modération (HTTP ${statut}) dont le corps n'est pas un objet JSON : reponse.brut ne peut ` +
        `pas le porter sans l'envelopper (règle 7). Corps tel que reçu : ${corps}`,
    );
    this.name = "RefusNonObjet";
  }
}

/** Une réponse 2xx dont le corps n'est pas un objet JSON : même impasse que `RefusNonObjet`. */
export class CorpsNonObjet extends Error {
  constructor(statut: number, corps: string) {
    super(
      `Réponse HTTP ${statut} dont le corps n'est pas un objet JSON : reponse.brut ne peut pas la ` +
        `porter sans l'envelopper (règle 7). Corps tel que reçu : ${corps}`,
    );
    this.name = "CorpsNonObjet";
  }
}

export type LectureJson = { readonly lisible: true; readonly valeur: unknown } | { readonly lisible: false; readonly raison: string };

/** Lit un corps comme JSON sans rien en perdre de visible : l'illisible est dit, pas comblé. */
export function lireJson(corps: string): LectureJson {
  try {
    return { lisible: true, valeur: JSON.parse(corps) as unknown };
  } catch (erreur) {
    return { lisible: false, raison: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}

export function estObjetJson(valeur: unknown): valeur is ObjetJson {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}
