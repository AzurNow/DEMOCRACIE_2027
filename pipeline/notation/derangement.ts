/**
 * Le dérangement des candidats du test contrefactuel de biais du juge (§7).
 *
 * Décision D14 (2) de l'auteur du 2026-10-05 (texte proposé pour la 0.16) : « Les permutations sont
 * un dérangement des candidats du run, tiré avec sa graine dérivée, appliqué par remplacement exact
 * du libellé et du nom seul déclarés au périmètre ». Un seul dérangement pour tout le run : chaque
 * candidat a une image, distincte de lui, et la même pour toutes les réponses du sous-ensemble.
 *
 * **Candidats.** Tous ceux que déclare `run.perimetre.candidats`, interrogés ou non : un candidat
 * retiré peut encore être nommé dans une réponse ou dans un item, et ne pas le permuter laisserait
 * son nom en clair. Leurs formes (libellés et noms seuls, toutes ensemble) doivent être deux à deux
 * distinctes et non blanches : une forme partagée par deux candidats, ou servant de libellé à l'un
 * et de nom seul à l'autre, ne dirait pas par quoi la remplacer. Identifiants en double : erreur.
 *
 * **Tirage, pour le rejouer ailleurs.** Graine : `run.graines.contrefactuel`, dont le générateur
 * déclaré doit être celui du tirage (`splitmix64-sha256-v1`, sinon `GraineNonConforme`). Clé
 * lisible : `CLE_DERANGEMENT_CANDIDATS`. La dérivation est celle d'`analysis/graines.ts`
 * (`graineDerivee`) : l'entier publié en décimal, puis chaque composant de la clé, joints par
 * U+0000, hachés en sha256 ; les huit premiers octets, en gros-boutiste, amorcent SplitMix64.
 * Texte haché : `<valeur>␀contrefactuel␀noms_candidats␀derangement`.
 *
 * Consommation du générateur : les candidats sont rangés par `candidat_id` dans l'ordre croissant
 * des chaînes (unités UTF-16, comme `<` en JavaScript ; `echantillons.ts:comparerChaines`), quel
 * que soit l'ordre reçu. Ce rangement est mélangé par Fisher-Yates du dernier au premier
 * (`validation/domaine/alea.ts`, `melanger`). Si le mélange a un point fixe (un candidat à sa
 * propre place), il est rejeté et le rangement, et non le mélange rejeté, est mélangé de nouveau
 * avec le MÊME générateur, qui poursuit sa suite ; le premier mélange sans point fixe est retenu.
 * Le candidat de rang i du rangement a pour image le candidat de rang i du mélange retenu. Ce rejet
 * rend le dérangement uniforme parmi tous les dérangements possibles.
 */

import { graineDerivee } from "../../analysis/graines.ts";
import { generateur, melanger, type GenerateurAleatoire } from "../../validation/domaine/alea.ts";
import type { GraineTirage } from "../questions/types.ts";
import { comparerChaines, verifierGraine } from "./echantillons.ts";
import type { CandidatDuRun } from "./types.ts";

/**
 * Clé lisible de la graine du dérangement, dérivée de `run.graines.contrefactuel`. Elle ne partage
 * pas sa suite avec le sous-ensemble (`echantillons.ts:CLE_SOUS_ENSEMBLE_CONTREFACTUEL`).
 */
export const CLE_DERANGEMENT_CANDIDATS: readonly string[] = ["contrefactuel", "noms_candidats", "derangement"];

export interface PaireDuDerangement {
  readonly source: CandidatDuRun;
  readonly image: CandidatDuRun;
}

export interface Derangement {
  /** Une paire par candidat, dans l'ordre croissant des `candidat_id` des sources. */
  readonly paires: readonly PaireDuDerangement[];
}

export function tirerDerangement(candidats: readonly CandidatDuRun[], graine: GraineTirage): Derangement {
  verifierCandidats(candidats);
  if (candidats.length < 2) {
    throw new Error(`Dérangement impossible : ${candidats.length} candidat(s) au périmètre, il en faut au moins deux candidats (§7).`);
  }
  verifierGraine(graine);
  const ranges = [...candidats].sort((a, b) => comparerChaines(a.candidat_id, b.candidat_id));
  const images = melangeSansPointFixe(ranges, generateur(graineDerivee(graine.valeur, CLE_DERANGEMENT_CANDIDATS)));
  return { paires: ranges.map((source, rang) => ({ source, image: exiger(images, rang) })) };
}

/** `reponse.schema.json#/properties/permutation/properties/correspondances` : source → image. */
export function correspondancesDe(derangement: Derangement): Readonly<Record<string, string>> {
  return Object.fromEntries(derangement.paires.map((paire) => [paire.source.candidat_id, paire.image.candidat_id]));
}

/** Formes non blanches, deux à deux distinctes ; identifiants uniques. */
export function verifierCandidats(candidats: readonly CandidatDuRun[]): void {
  const identifiants = new Set<string>();
  const formes = new Map<string, string>();
  for (const candidat of candidats) {
    if (identifiants.has(candidat.candidat_id)) throw new Error(`Candidat en double au périmètre : identifiant ${candidat.candidat_id}.`);
    identifiants.add(candidat.candidat_id);
    for (const forme of [candidat.libelle, candidat.nom]) enregistrerForme(formes, forme, candidat.candidat_id);
  }
}

function enregistrerForme(formes: Map<string, string>, forme: string, candidat_id: string): void {
  if (forme.trim().length === 0) throw new Error(`Candidat ${candidat_id} : libellé ou nom seul vide ou blanc.`);
  const deja = formes.get(forme);
  if (deja !== undefined) {
    throw new Error(`La forme « ${forme} » est déclarée pour ${deja} et pour ${candidat_id} : son remplacement serait ambigu (D14 (2)).`);
  }
  formes.set(forme, candidat_id);
}

function melangeSansPointFixe(ranges: readonly CandidatDuRun[], rng: GenerateurAleatoire): CandidatDuRun[] {
  let images = melanger(ranges, rng);
  while (aUnPointFixe(ranges, images)) images = melanger(ranges, rng);
  return images;
}

function aUnPointFixe(ranges: readonly CandidatDuRun[], images: readonly CandidatDuRun[]): boolean {
  return ranges.some((candidat, rang) => images[rang] === candidat);
}

function exiger(images: readonly CandidatDuRun[], rang: number): CandidatDuRun {
  const image = images[rang];
  if (image === undefined) throw new Error(`Dérangement incomplet : aucune image au rang ${rang}.`);
  return image;
}
