/**
 * `config/reformulation.json` : les réglages de l'appel au modèle de reformulation, remplis à la main
 * par l'auteur (D42 (1) : Mistral Large, version épinglée, identifiant fourni par l'auteur avant le
 * premier appel réel).
 *
 * Aucune valeur par défaut dans le code : chaque clé de `REGLES` est obligatoire, non nulle et de la
 * forme dite ; une clé inconnue est refusée (une coquille, `temperatur`, enverrait sinon la
 * température par défaut de l'API sans que rien ne le dise) ; une clé répétée aussi (`JSON.parse`
 * n'en garderait que la dernière). Chaque refus nomme sa clé. Seul `$commentaire` s'ajoute aux
 * réglages, et il n'est jamais envoyé.
 *
 * Validé ici en TypeScript, sans schéma JSON : la liste des réglages est celle des paramètres que
 * l'adaptateur Mistral envoie (`editeur-mistral.ts`), plus le délai d'abandon de chaque appel
 * (`delai_abandon_ms`, lu par `executer.ts`), qui n'est jamais envoyé à l'API.
 */

import { readFileSync } from "node:fs";
import { premiereCleDupliquee } from "./cles-dupliquees.ts";

export interface ConfigurationReformulation {
  /** Identifiant exact du modèle épinglé, recopié dans `production.modele`. */
  readonly modele: string;
  readonly temperature: number;
  readonly max_tokens: number;
  readonly random_seed: number;
  /** Délai au-delà duquel un appel sans réponse est abandonné et compté échec de transport. */
  readonly delai_abandon_ms: number;
}

type NomReglage = keyof ConfigurationReformulation;

interface Regle {
  readonly attendu: string;
  readonly admet: (valeur: unknown) => boolean;
}

const estEntier = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur);

/** Les réglages, en données : un réglage ajouté à l'interface sans être listé ici ne compile pas. */
const REGLES: Readonly<Record<NomReglage, Regle>> = {
  modele: { attendu: "un texte non vide", admet: (valeur) => typeof valeur === "string" && valeur.trim().length > 0 },
  temperature: {
    attendu: "un nombre fini >= 0",
    admet: (valeur) => typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0,
  },
  max_tokens: { attendu: "un entier >= 1", admet: (valeur) => estEntier(valeur) && valeur >= 1 },
  random_seed: { attendu: "un entier >= 0", admet: (valeur) => estEntier(valeur) && valeur >= 0 },
  delai_abandon_ms: { attendu: "un entier >= 1, en millisecondes", admet: (valeur) => estEntier(valeur) && valeur >= 1 },
};

const NOMS_REGLAGES = Object.keys(REGLES) as readonly NomReglage[];
const COMMENTAIRE = "$commentaire";

export class ConfigurationRefusee extends Error {
  readonly provenance: string;
  readonly motifs: readonly string[];

  constructor(provenance: string, motifs: readonly string[]) {
    super(
      `${provenance} : configuration de la reformulation refusée, aucune valeur par défaut n'est appliquée :\n` +
        motifs.map((motif) => `  ${motif}`).join("\n"),
    );
    this.name = "ConfigurationRefusee";
    this.provenance = provenance;
    this.motifs = motifs;
  }
}

function lireObjet(texte: string, provenance: string): Readonly<Record<string, unknown>> {
  let valeur: unknown;
  try {
    valeur = JSON.parse(texte);
  } catch (erreur) {
    throw new ConfigurationRefusee(provenance, [`JSON illisible : ${erreur instanceof Error ? erreur.message : String(erreur)}`]);
  }
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
    throw new ConfigurationRefusee(provenance, ["un objet JSON est attendu"]);
  }
  const repetee = premiereCleDupliquee(texte);
  if (repetee !== null) throw new ConfigurationRefusee(provenance, [`${repetee} : clé répétée`]);
  return valeur as Readonly<Record<string, unknown>>;
}

function motifDuReglage(objet: Readonly<Record<string, unknown>>, nom: NomReglage): readonly string[] {
  if (!Object.hasOwn(objet, nom)) return [`${nom} : absente (attendu : ${REGLES[nom].attendu})`];
  const valeur = objet[nom];
  if (valeur === null) return [`${nom} : null, à remplir par l'auteur (attendu : ${REGLES[nom].attendu})`];
  if (!REGLES[nom].admet(valeur)) return [`${nom} : ${JSON.stringify(valeur)} refusée (attendu : ${REGLES[nom].attendu})`];
  return [];
}

function motifsDesClesInconnues(objet: Readonly<Record<string, unknown>>): readonly string[] {
  const connues = new Set<string>([...NOMS_REGLAGES, COMMENTAIRE]);
  const inconnues = Object.keys(objet).filter((cle) => !connues.has(cle));
  const commentaire = objet[COMMENTAIRE];
  const commentaireRefuse = commentaire !== undefined && typeof commentaire !== "string";
  return [
    ...inconnues.map((cle) => `${cle} : clé inconnue (admises : ${[...NOMS_REGLAGES, COMMENTAIRE].join(", ")})`),
    ...(commentaireRefuse ? [`${COMMENTAIRE} : un texte est attendu`] : []),
  ];
}

/** Le texte du fichier, validé ; lève `ConfigurationRefusee` en nommant chaque clé fautive. */
export function validerConfiguration(texte: string, provenance: string): ConfigurationReformulation {
  const objet = lireObjet(texte, provenance);
  const motifs = [...NOMS_REGLAGES.flatMap((nom) => motifDuReglage(objet, nom)), ...motifsDesClesInconnues(objet)];
  if (motifs.length > 0) throw new ConfigurationRefusee(provenance, motifs);
  return {
    modele: objet["modele"] as string,
    temperature: objet["temperature"] as number,
    max_tokens: objet["max_tokens"] as number,
    random_seed: objet["random_seed"] as number,
    delai_abandon_ms: objet["delai_abandon_ms"] as number,
  };
}

export function lireConfiguration(chemin: string): ConfigurationReformulation {
  return validerConfiguration(readFileSync(chemin, "utf8"), chemin);
}
