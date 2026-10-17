/**
 * Contrôle de la sortie du modèle de reformulation, avant toute relecture humaine.
 *
 * Contrat : `prompts/reformulation-1.0.1`, section « Sortie attendue » : un seul objet JSON, sans
 * texte autour ni bloc de code, exactement `{"familier": {"texte"}, "oriente": {"texte",
 * "position_affirmee"?}}`. Chaque contrôle est une comparaison de chaînes (règle 5), jamais un
 * jugement de modèle :
 * - forme exacte, aucun champ en plus ni en moins à chaque niveau, aucune clé répétée dans un même
 *   objet (`JSON.parse` en garderait la dernière sans le dire, `cles-dupliquees.ts`), textes non
 *   vides ;
 * - `position_affirmee` égale à celle demandée, absente quand la demande vaut `AUCUNE` ;
 * - le libellé du candidat figure caractère pour caractère dans chaque texte (hors Q-ATT) ;
 * - la mesure figure dans chaque texte sous une forme admise (D42 (4), `gabarits.ts`) ;
 * - aucun nom de candidat du périmètre dans une formulation de Q-ATT (§5, `libelles.ts`).
 *
 * Une sortie qui échoue à un contrôle est rejetée en entier, avec le motif du contrôle échoué.
 * Elle n'est jamais réparée, normalisée, tronquée ni déballée d'un bloc de code (règle 7) : le
 * contrôle lit la chaîne reçue, et l'appelant garde le brut tel quel.
 */

import { mesureFigureSousFormeAdmise } from "../questions/gabarits.ts";
import { nomsCherchesEnAttribution, trouverLibelle } from "../questions/libelles.ts";
import type { CandidatNomme } from "../questions/types.ts";
import { premiereCleDupliquee } from "./cles-dupliquees.ts";
import type { DemandeReformulation } from "./demande.ts";
import { AUCUNE } from "./position-affirmee.ts";
import type { PositionAffirmable, PositionDemandee } from "./position-affirmee.ts";

export const MOTIFS_REJET = [
  "bloc_de_code",
  "json_invalide",
  "cle_dupliquee",
  "pas_un_objet",
  "champ_inattendu",
  "champ_manquant",
  "champ_non_textuel",
  "texte_vide",
  "position_affirmee_inattendue",
  "position_affirmee_manquante",
  "position_affirmee_differente",
  "libelle_candidat",
  "mesure",
  "nom_de_candidat_dans_attribution",
] as const;
export type MotifRejet = (typeof MOTIFS_REJET)[number];

export class SortieRejetee extends Error {
  readonly motif: MotifRejet;

  constructor(motif: MotifRejet, detail: string) {
    super(`Sortie de reformulation rejetée en entier (${motif}) : ${detail}`);
    this.name = "SortieRejetee";
    this.motif = motif;
  }
}

export interface SortieReformulation {
  readonly familier: { readonly texte: string };
  readonly oriente: { readonly texte: string; readonly position_affirmee?: PositionAffirmable };
}

type Objet = Readonly<Record<string, unknown>>;

/* ------------------------------------------------------------------- forme */

const BLOC_DE_CODE = /^\s*```/u;

function lireJson(brut: string): unknown {
  if (BLOC_DE_CODE.test(brut)) throw new SortieRejetee("bloc_de_code", "la sortie est entourée d'un bloc de code.");
  let valeur: unknown;
  try {
    valeur = JSON.parse(brut);
  } catch (erreur) {
    throw new SortieRejetee("json_invalide", erreur instanceof Error ? erreur.message : String(erreur));
  }
  const repetee = premiereCleDupliquee(brut);
  if (repetee !== null) throw new SortieRejetee("cle_dupliquee", `la clé « ${repetee} » figure deux fois dans un même objet.`);
  return valeur;
}

function objetDe(valeur: unknown, contexte: string): Objet {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
    throw new SortieRejetee("pas_un_objet", `${contexte} n'est pas un objet.`);
  }
  return valeur as Objet;
}

function exigerChamps(objet: Objet, admis: readonly string[], requis: readonly string[], contexte: string): void {
  for (const cle of Object.keys(objet)) {
    if (!admis.includes(cle)) throw new SortieRejetee("champ_inattendu", `${contexte}.${cle} n'est pas attendu.`);
  }
  for (const cle of requis) {
    if (!Object.hasOwn(objet, cle)) throw new SortieRejetee("champ_manquant", `${contexte}.${cle} manque.`);
  }
}

function texteDe(objet: Objet, contexte: string): string {
  const texte = objet["texte"];
  if (typeof texte !== "string") throw new SortieRejetee("champ_non_textuel", `${contexte}.texte n'est pas un texte.`);
  if (texte.length === 0) throw new SortieRejetee("texte_vide", `${contexte}.texte est vide.`);
  return texte;
}

/* ------------------------------------------------------- position affirmée */

function positionLue(oriente: Objet, demandee: PositionDemandee): PositionAffirmable | undefined {
  const presente = Object.hasOwn(oriente, "position_affirmee");
  if (demandee === AUCUNE) {
    if (presente) throw new SortieRejetee("position_affirmee_inattendue", "AUCUNE demandée, position présente.");
    return undefined;
  }
  if (!presente) throw new SortieRejetee("position_affirmee_manquante", `« ${demandee} » demandée, position absente.`);
  const lue = oriente["position_affirmee"];
  if (lue !== demandee) {
    throw new SortieRejetee("position_affirmee_differente", `« ${demandee} » demandée, « ${String(lue)} » reçue.`);
  }
  return demandee;
}

function sortieDe(brut: string, demandee: PositionDemandee): SortieReformulation {
  const racine = objetDe(lireJson(brut), "la sortie");
  exigerChamps(racine, ["familier", "oriente"], ["familier", "oriente"], "sortie");
  const familier = objetDe(racine["familier"], "sortie.familier");
  exigerChamps(familier, ["texte"], ["texte"], "sortie.familier");
  const oriente = objetDe(racine["oriente"], "sortie.oriente");
  exigerChamps(oriente, ["texte", "position_affirmee"], ["texte"], "sortie.oriente");
  const textes = { familier: texteDe(familier, "sortie.familier"), oriente: texteDe(oriente, "sortie.oriente") };
  const position_affirmee = positionLue(oriente, demandee);
  return {
    familier: { texte: textes.familier },
    oriente: position_affirmee === undefined ? { texte: textes.oriente } : { texte: textes.oriente, position_affirmee },
  };
}

/* ----------------------------------------------------------------- recopies */

/**
 * Les chaînes qu'une formulation de Q-ATT ne doit pas contenir : celles de la barrière de symétrie,
 * lues dans la même fonction (`nomsCherchesEnAttribution`), pour qu'une reformulation acceptée ici
 * ne la fasse pas rougir plus tard. Un périmètre vide est refusé : le contrôle passerait faute de
 * noms.
 */
function nomsInterdits(perimetre: readonly CandidatNomme[]): readonly string[] {
  if (perimetre.length === 0) throw new Error("Périmètre vide : aucun nom de candidat à chercher dans une Q-ATT.");
  return nomsCherchesEnAttribution(perimetre);
}

function controlerRecopies(texte: string, registre: string, demande: DemandeReformulation, interdits: readonly string[]): void {
  const libelle = demande.libelle_candidat;
  if (libelle !== null && !texte.includes(libelle)) {
    throw new SortieRejetee("libelle_candidat", `${registre} : « ${libelle} » n'y figure pas caractère pour caractère.`);
  }
  if (!mesureFigureSousFormeAdmise(texte, demande.gabarit, demande.formulation_mesure)) {
    throw new SortieRejetee("mesure", `${registre} : « ${demande.formulation_mesure} » n'y figure sous aucune forme admise.`);
  }
  const nom = trouverLibelle(texte, interdits);
  if (nom !== null) {
    throw new SortieRejetee("nom_de_candidat_dans_attribution", `${registre} : « ${nom} » nommé dans une question d'attribution.`);
  }
}

/**
 * Contrôle la sortie brute du modèle pour la demande donnée. Rend les deux formulations lues, ou
 * lève `SortieRejetee` au premier contrôle échoué. `perimetre` : les candidats du run, cherchés
 * seulement dans une question qui ne nomme personne.
 */
export function controlerSortie(
  brut: string,
  demande: DemandeReformulation,
  perimetre: readonly CandidatNomme[],
): SortieReformulation {
  const sortie = sortieDe(brut, demande.position_affirmee);
  const interdits = demande.libelle_candidat === null ? nomsInterdits(perimetre) : [];
  controlerRecopies(sortie.familier.texte, "familier", demande, interdits);
  controlerRecopies(sortie.oriente.texte, "oriente", demande, interdits);
  return sortie;
}
