/**
 * `config/extraction.json` : les deux extracteurs de l'extraction double, **dans l'ordre**, avec
 * l'éditeur de chacun et ses réglages (décision D52 (1) et (3)). Rempli à la main par l'auteur, qui
 * épingle les identifiants exacts avant le premier appel réel.
 *
 * L'ordre du fichier est l'ordre de `ConfigurationExtraction.modeles` : il fixe le modèle dont les
 * champs sont gardés pour un item apparié (D52 (3), `configuration.ts`). Il n'est jamais réordonné.
 *
 * Aucune valeur par défaut dans le code, sur le modèle de `pipeline/reformulation/configuration.ts` :
 * chaque réglage de l'éditeur est obligatoire, non nul et de la forme dite ; une clé inconnue est
 * refusée (une coquille enverrait sinon la valeur par défaut de l'API sans que rien ne le dise) ; une
 * clé répétée aussi (`JSON.parse` n'en garderait que la dernière). Chaque refus nomme son chemin
 * (`extracteurs[1].temperature`). Un `editeur` inconnu est refusé, ses réglages ne sont pas devinés.
 * Deux `modele` identiques sont refusés par le cœur (`exigerConfiguration`). Seul `$commentaire`
 * s'ajoute à la racine, et il n'est jamais envoyé.
 *
 * Les réglages d'un éditeur et sa fabrique d'adaptateur sont des données, dans deux tables indexées
 * par l'éditeur (`REGLES`, `FABRIQUES`) : aucun `if` sur un éditeur ni sur un modèle.
 */

import { readFileSync } from "node:fs";
import { estObjetJson } from "../interrogation/editeur.ts";
import type { ObjetJson } from "../interrogation/types.ts";
import { premiereCleDupliquee } from "../reformulation/cles-dupliquees.ts";
import { exigerConfiguration, type ConfigurationExtraction } from "./configuration.ts";
import { EDITEURS, type AdaptateurExtraction, type NomEditeur } from "./editeur.ts";
import { adaptateurAnthropic, EFFORTS, type ReglagesAnthropic } from "./editeur-anthropic.ts";
import { adaptateurMistralExtraction, type ReglagesMistral } from "./editeur-mistral.ts";
import { VERSION_PROMPT_EXTRACTION } from "./prompt.ts";

export interface ReglagesParEditeur {
  readonly anthropic: ReglagesAnthropic;
  readonly mistral: ReglagesMistral;
}

export interface ExtracteurDe<E extends NomEditeur> {
  readonly editeur: E;
  readonly reglages: ReglagesParEditeur[E];
}

export type ExtracteurConfigure = { readonly [E in NomEditeur]: ExtracteurDe<E> }[NomEditeur];

export interface ConfigurationEditeurs {
  /** Ce que lit le cœur : les deux identifiants, dans l'ordre du fichier, et la version du prompt. */
  readonly extraction: ConfigurationExtraction;
  /** Les deux extracteurs, dans le même ordre, avec les réglages de leur éditeur. */
  readonly extracteurs: readonly [ExtracteurConfigure, ExtracteurConfigure];
}

/* ------------------------------------------------------------------- règles */

interface Regle {
  readonly attendu: string;
  readonly admet: (valeur: unknown) => boolean;
}

const estEntier = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur);

function enumeration(valeurs: readonly string[]): string {
  return valeurs.length < 2 ? valeurs.join("") : `${valeurs.slice(0, -1).join(", ")} ou ${String(valeurs.at(-1))}`;
}

function regleEnumeree(valeurs: readonly string[]): Regle {
  return { attendu: enumeration(valeurs), admet: (valeur) => typeof valeur === "string" && valeurs.includes(valeur) };
}

const MODELE: Regle = { attendu: "un texte non vide", admet: (valeur) => typeof valeur === "string" && valeur.trim().length > 0 };
const MAX_TOKENS: Regle = { attendu: "un entier >= 1", admet: (valeur) => estEntier(valeur) && valeur >= 1 };
const DELAI: Regle = { attendu: "un entier >= 1, en millisecondes", admet: (valeur) => estEntier(valeur) && valeur >= 1 };

/** Les réglages de chaque éditeur, dans l'ordre où les refus sont rendus. */
const REGLES: { readonly [E in NomEditeur]: Readonly<Record<keyof ReglagesParEditeur[E], Regle>> } = {
  anthropic: { modele: MODELE, max_tokens: MAX_TOKENS, effort: regleEnumeree(EFFORTS), delai_abandon_ms: DELAI },
  mistral: {
    modele: MODELE,
    temperature: {
      attendu: "un nombre fini >= 0",
      admet: (valeur) => typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0,
    },
    max_tokens: MAX_TOKENS,
    random_seed: { attendu: "un entier >= 0", admet: (valeur) => estEntier(valeur) && valeur >= 0 },
    delai_abandon_ms: DELAI,
  },
};

const EDITEUR: Regle = regleEnumeree(EDITEURS);
const NOMBRE_EXTRACTEURS = 2;
const COMMENTAIRE = "$commentaire";
const EXTRACTEURS = "extracteurs";
const CLES_RACINE: readonly string[] = [COMMENTAIRE, EXTRACTEURS];

/* ------------------------------------------------------------------ refus */

export class ConfigurationEditeursRefusee extends Error {
  readonly provenance: string;
  readonly motifs: readonly string[];

  constructor(provenance: string, motifs: readonly string[]) {
    super(
      `${provenance} : configuration des extracteurs refusée, aucune valeur par défaut n'est appliquée :\n` +
        motifs.map((motif) => `  ${motif}`).join("\n"),
    );
    this.name = "ConfigurationEditeursRefusee";
    this.provenance = provenance;
    this.motifs = motifs;
  }
}

function lireObjet(texte: string, provenance: string): ObjetJson {
  let valeur: unknown;
  try {
    valeur = JSON.parse(texte);
  } catch (erreur) {
    throw new ConfigurationEditeursRefusee(provenance, [`JSON illisible : ${erreur instanceof Error ? erreur.message : String(erreur)}`]);
  }
  if (!estObjetJson(valeur)) throw new ConfigurationEditeursRefusee(provenance, ["un objet JSON est attendu"]);
  const repetee = premiereCleDupliquee(texte);
  if (repetee !== null) throw new ConfigurationEditeursRefusee(provenance, [`${repetee} : clé répétée`]);
  return valeur;
}

/* ------------------------------------------------------------- validation */

function motifDe(objet: ObjetJson, cle: string, regle: Regle, chemin: string): readonly string[] {
  if (!Object.hasOwn(objet, cle)) return [`${chemin} : absente (attendu : ${regle.attendu})`];
  const valeur = objet[cle];
  if (valeur === null) return [`${chemin} : null, à remplir par l'auteur (attendu : ${regle.attendu})`];
  if (!regle.admet(valeur)) return [`${chemin} : ${JSON.stringify(valeur)} refusée (attendu : ${regle.attendu})`];
  return [];
}

function motifsDesInconnues(objet: ObjetJson, admises: readonly string[], prefixe: string): readonly string[] {
  return Object.keys(objet)
    .filter((cle) => !admises.includes(cle))
    .map((cle) => `${prefixe}${cle} : clé inconnue (admises : ${admises.join(", ")})`);
}

function motifsDesReglages(objet: ObjetJson, editeur: NomEditeur, chemin: string): readonly string[] {
  const regles: Readonly<Record<string, Regle>> = REGLES[editeur];
  const reglages = Object.entries(regles).flatMap(([cle, regle]) => motifDe(objet, cle, regle, `${chemin}.${cle}`));
  return [...reglages, ...motifsDesInconnues(objet, ["editeur", ...Object.keys(regles)], `${chemin}.`)];
}

function motifsDeLExtracteur(valeur: unknown, rang: number): readonly string[] {
  const chemin = `${EXTRACTEURS}[${rang}]`;
  if (!estObjetJson(valeur)) return [`${chemin} : un objet est attendu`];
  const editeur = motifDe(valeur, "editeur", EDITEUR, `${chemin}.editeur`);
  if (editeur.length > 0) return editeur;
  return motifsDesReglages(valeur, valeur["editeur"] as NomEditeur, chemin);
}

function motifsDesExtracteurs(objet: ObjetJson): readonly string[] {
  if (!Object.hasOwn(objet, EXTRACTEURS)) return [`${EXTRACTEURS} : absente (attendu : une liste de ${NOMBRE_EXTRACTEURS} extracteurs)`];
  const liste = objet[EXTRACTEURS];
  if (!Array.isArray(liste)) return [`${EXTRACTEURS} : une liste est attendue`];
  const entrees = liste as readonly unknown[];
  const nombre =
    entrees.length === NOMBRE_EXTRACTEURS
      ? []
      : [`${EXTRACTEURS} : ${entrees.length} entrée(s), exactement ${NOMBRE_EXTRACTEURS} attendues (§4, extraction double)`];
  return [...nombre, ...entrees.flatMap(motifsDeLExtracteur)];
}

function motifsDeLaRacine(objet: ObjetJson): readonly string[] {
  const commentaire = objet[COMMENTAIRE];
  const commentaireRefuse = commentaire !== undefined && typeof commentaire !== "string";
  return [
    ...(commentaireRefuse ? [`${COMMENTAIRE} : un texte est attendu`] : []),
    ...motifsDesInconnues(objet, CLES_RACINE, ""),
    ...motifsDesExtracteurs(objet),
  ];
}

/* --------------------------------------------------------------- lecture */

/** Un extracteur validé : l'éditeur, et ses réglages seuls, dans l'ordre de `REGLES`. */
function extracteurDe(valeur: unknown): ExtracteurConfigure {
  const objet = valeur as ObjetJson;
  const editeur = objet["editeur"] as NomEditeur;
  const reglages = Object.fromEntries(Object.keys(REGLES[editeur]).map((cle) => [cle, objet[cle]]));
  return { editeur, reglages } as unknown as ExtracteurConfigure;
}

/** Le texte du fichier, validé ; lève `ConfigurationEditeursRefusee` en nommant chaque chemin fautif. */
export function validerConfigurationEditeurs(texte: string, provenance: string): ConfigurationEditeurs {
  const objet = lireObjet(texte, provenance);
  const motifs = motifsDeLaRacine(objet);
  if (motifs.length > 0) throw new ConfigurationEditeursRefusee(provenance, motifs);
  const [premier, second] = (objet[EXTRACTEURS] as readonly unknown[]).map(extracteurDe) as [ExtracteurConfigure, ExtracteurConfigure];
  const extraction: ConfigurationExtraction = {
    modeles: [premier.reglages.modele, second.reglages.modele],
    version_prompt: VERSION_PROMPT_EXTRACTION,
  };
  exigerConfiguration(extraction);
  return { extraction, extracteurs: [premier, second] };
}

export function lireConfigurationEditeurs(chemin: string): ConfigurationEditeurs {
  return validerConfigurationEditeurs(readFileSync(chemin, "utf8"), chemin);
}

/* ------------------------------------------------------------ assemblage */

export type Fabrique<E extends NomEditeur> = (reglages: ReglagesParEditeur[E], cle_api: string) => AdaptateurExtraction;

/** La fabrique d'adaptateur de chaque éditeur : la seule correspondance éditeur → code. */
export const FABRIQUES: { readonly [E in NomEditeur]: Fabrique<E> } = {
  anthropic: adaptateurAnthropic,
  mistral: adaptateurMistralExtraction,
};

function adaptateurDe<E extends NomEditeur>(extracteur: ExtracteurDe<E>, cle_api: string): AdaptateurExtraction {
  const fabrique: Fabrique<E> = FABRIQUES[extracteur.editeur];
  return fabrique(extracteur.reglages, cle_api);
}

/**
 * Les deux adaptateurs, dans l'ordre de la configuration. `cleDe` rend la clé d'API d'un éditeur
 * (lue par l'appelant, jamais enregistrée) ; une clé vide est refusée par la fabrique, avant toute
 * requête.
 */
export function construireAdaptateurs(
  configuration: ConfigurationEditeurs,
  cleDe: (editeur: NomEditeur) => string,
): readonly [AdaptateurExtraction, AdaptateurExtraction] {
  const [premier, second] = configuration.extracteurs;
  return [adaptateurDe(premier, cleDe(premier.editeur)), adaptateurDe(second, cleDe(second.editeur))];
}
