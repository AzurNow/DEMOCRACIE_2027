/**
 * Le journal des tentatives : un fichier `.jsonl` par requête, en ajout seul.
 *
 * Avant chaque envoi, la tentative est inscrite (`debut`) et le fichier est synchronisé sur disque ;
 * après un échec, l'erreur est inscrite (`echec`). Une relance relit le journal : chaque `debut`
 * sans `echec` est une tentative interrompue (le processus s'est arrêté pendant qu'elle était en vol)
 * et compte comme échouée, de type « autre ». Le plafond de trois tentatives du §6 tient donc même
 * après un arrêt brutal : une requête n'est jamais envoyée une quatrième fois.
 *
 * Le journal ne consigne pas les réussites : une requête aboutie a sa réponse écrite
 * (`stockage.ts`), et c'est elle qui fait sauter la requête à la relance.
 *
 * Chaque ligne relue est contrôlée : forme, numéros consécutifs, clé de la requête, et l'erreur
 * contre `reponse.schema.json#/$defs/tentative/properties/erreur`. Une ligne illisible lève en
 * nommant le fichier et la ligne : un journal abîmé se montre, il ne se répare pas en silence.
 */

import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { validerFragment } from "../../outils/schemas/valider.ts";
import { canoniser, sha256 } from "../../validation/domaine/empreinte.ts";
import { TENTATIVES_MAX } from "./conditions.ts";
import { estObjetJson, lireJson } from "./editeur.ts";
import type { CleRequete, ErreurTentative, Tentative } from "./types.ts";

export const MESSAGE_INTERROMPUE =
  "Tentative interrompue : inscrite au journal avant l'envoi, sans résultat journalisé ; comptée comme échouée à la reprise.";

type LigneDebut = { readonly evenement: "debut"; readonly numero: number; readonly horodatage: string; readonly requete: CleRequete };
type LigneEchec = { readonly evenement: "echec"; readonly numero: number; readonly erreur: ErreurTentative };
type Ligne = LigneDebut | LigneEchec;

export class JournalIllisible extends Error {
  constructor(chemin: string, numeroLigne: number, raison: string) {
    super(`${chemin}, ligne ${numeroLigne} : ${raison}. Le journal n'est ni réparé ni ignoré.`);
    this.name = "JournalIllisible";
  }
}

/** Nom de fichier opaque et stable d'une requête : l'empreinte de sa clé canonique. */
export function nomJournal(cle: CleRequete): string {
  return `${sha256(canoniser(cle))}.jsonl`;
}

function ajouterLigne(chemin: string, ligne: Ligne): void {
  const descripteur = openSync(chemin, "a");
  try {
    writeSync(descripteur, `${JSON.stringify(ligne)}\n`);
    fsyncSync(descripteur);
  } finally {
    closeSync(descripteur);
  }
}

/* ------------------------------------------------------------------ lecture */

function exigerNumero(valeur: unknown): number {
  if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 1 || valeur > TENTATIVES_MAX) {
    throw new Error(`numéro de tentative invalide : ${JSON.stringify(valeur)}`);
  }
  return valeur;
}

function exigerTexte(valeur: unknown, nom: string): string {
  if (typeof valeur !== "string") throw new Error(`${nom} absent ou non textuel`);
  return valeur;
}

/** La clé portée par la ligne n'est pas typée ici : `appliquer` l'exige égale à celle du fichier. */
function lireDebut(objet: Readonly<Record<string, unknown>>): LigneDebut {
  const requete = objet["requete"];
  if (!estObjetJson(requete)) throw new Error("ligne debut sans clé de requête");
  return {
    evenement: "debut",
    numero: exigerNumero(objet["numero"]),
    horodatage: exigerTexte(objet["horodatage"], "horodatage"),
    requete: requete as unknown as CleRequete,
  };
}

function lireEchec(objet: Readonly<Record<string, unknown>>, provenance: string): LigneEchec {
  const erreur = validerFragment<ErreurTentative>(
    "reponse",
    "#/$defs/tentative/properties/erreur",
    objet["erreur"],
    provenance,
  );
  return { evenement: "echec", numero: exigerNumero(objet["numero"]), erreur };
}

function lireLigne(texte: string, provenance: string): Ligne {
  const lecture = lireJson(texte);
  if (!lecture.lisible) throw new Error(`JSON illisible (${lecture.raison})`);
  const objet = lecture.valeur;
  if (!estObjetJson(objet)) throw new Error("ligne qui n'est pas un objet JSON");
  if (objet["evenement"] === "debut") return lireDebut(objet);
  if (objet["evenement"] === "echec") return lireEchec(objet, provenance);
  throw new Error(`événement inconnu : ${JSON.stringify(objet["evenement"])}`);
}

/* --------------------------------------------------------------- séquence */

function interrompue(debut: LigneDebut): Tentative {
  return { numero: debut.numero, horodatage: debut.horodatage, erreur: { type: "autre", message: MESSAGE_INTERROMPUE } };
}

interface Lecture {
  readonly tentatives: Tentative[];
  enCours: LigneDebut | null;
}

/** Applique une ligne à la séquence ; lève si elle la contredit. */
function appliquer(lecture: Lecture, ligne: Ligne, cle: string): void {
  if (ligne.evenement === "debut") {
    if (canoniser(ligne.requete) !== cle) throw new Error("clé de requête différente de celle du fichier");
    if (lecture.enCours !== null) lecture.tentatives.push(interrompue(lecture.enCours));
    if (ligne.numero !== lecture.tentatives.length + 1) throw new Error(`tentative ${ligne.numero} hors séquence`);
    lecture.enCours = ligne;
    return;
  }
  if (lecture.enCours?.numero !== ligne.numero) throw new Error(`échec de la tentative ${ligne.numero} sans son début`);
  lecture.tentatives.push({ numero: ligne.numero, horodatage: lecture.enCours.horodatage, erreur: ligne.erreur });
  lecture.enCours = null;
}

function lignesDe(chemin: string): readonly string[] {
  const contenu = readFileSync(chemin, "utf8");
  if (contenu.length > 0 && !contenu.endsWith("\n")) {
    throw new JournalIllisible(chemin, contenu.split("\n").length, "dernière ligne tronquée (écriture interrompue)");
  }
  return contenu.split("\n").slice(0, -1);
}

/* ------------------------------------------------------------------ journal */

/** Le journal d'une requête, dans le répertoire `tentatives/` du volume du run. */
export class JournalRequete {
  readonly chemin: string;
  private readonly cle: string;

  constructor(repertoire: string, cle: CleRequete) {
    this.chemin = join(repertoire, nomJournal(cle));
    this.cle = canoniser(cle);
  }

  /** Les tentatives déjà faites, interrompues comprises, dans l'ordre. Vide si aucun journal. */
  tentativesPassees(): readonly Tentative[] {
    if (!existsSync(this.chemin)) return [];
    const lecture: Lecture = { tentatives: [], enCours: null };
    lignesDe(this.chemin).forEach((texte, rang) => {
      const provenance = `${this.chemin}, ligne ${rang + 1}`;
      try {
        appliquer(lecture, lireLigne(texte, provenance), this.cle);
      } catch (erreur) {
        throw new JournalIllisible(this.chemin, rang + 1, erreur instanceof Error ? erreur.message : String(erreur));
      }
    });
    return lecture.enCours === null ? lecture.tentatives : [...lecture.tentatives, interrompue(lecture.enCours)];
  }

  inscrireDebut(numero: number, horodatage: string, requete: CleRequete): void {
    ajouterLigne(this.chemin, { evenement: "debut", numero, horodatage, requete });
  }

  inscrireEchec(numero: number, erreur: ErreurTentative): void {
    ajouterLigne(this.chemin, { evenement: "echec", numero, erreur });
  }
}
