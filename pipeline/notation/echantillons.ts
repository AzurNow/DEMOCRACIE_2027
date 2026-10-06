/**
 * Les deux tirages de la notation (§7) : l'échantillon humain et le sous-ensemble du test
 * contrefactuel.
 *
 * §7 (protocole 0.13) : « L'échantillon humain et ce sous-ensemble sont tirés avec le générateur du
 * tirage (SplitMix64, `splitmix64-sha256-v1`), chacun avec sa graine dérivée de la graine publiée et
 * d'une clé lisible, comme en section 8. » La dérivation est celle d'`analysis/graines.ts`
 * (`graineDerivee`) : l'entier publié du run (`run.graines.echantillon_humain.valeur` ou
 * `run.graines.contrefactuel.valeur`) en décimal, puis chaque composant de la clé, joints par
 * U+0000, hachés en sha256 ; les huit premiers octets, en gros-boutiste, amorcent SplitMix64.
 *
 * Consommation du générateur, pour rejouer ailleurs : les identifiants reçus sont rangés dans
 * l'ordre croissant des chaînes (unités UTF-16, comme `<` en JavaScript), quel que soit l'ordre
 * reçu ; ils sont mélangés par Fisher-Yates du dernier au premier (`validation/domaine/alea.ts`,
 * `melanger`) ; le tirage est un préfixe de cet ordre.
 *
 * **Échantillon humain** (décision D14 (1) de l'auteur du 2026-10-05, texte proposé pour la 0.16).
 * Le test contrefactuel précède la notation des autres réponses, donc un retrait de juge est connu
 * avant ce tirage. L'échantillon de 25 % prolonge l'ordre de tirage de celui de 10 %, avec la même
 * graine, et le contient : c'est un seul ordre, dont on prend un préfixe plus ou moins long. Le
 * taux est lu dans `run.taux_echantillon_humain`, jamais supposé.
 *
 * **Taille de l'échantillon** : `⌈taux × n⌉`, calculée en entiers (`⌈n / 10⌉`, `⌈n / 4⌉`). Le §7 dit
 * « 10 % des réponses » sans arrondi ; l'arrondi au supérieur garantit au moins 10 % (resp. 25 %),
 * jamais moins, ce qui est le choix le plus restrictif pour une mesure de fiabilité. Une réponse
 * seule donne donc un échantillon d'une réponse ; zéro réponse, un échantillon vide. Le calcul en
 * entiers évite qu'un `0.1 × n` flottant tombe juste sous un entier.
 *
 * **Sous-ensemble contrefactuel** (D14 (2)) : 200 réponses tirées parmi celles dont la réponse ou
 * l'item nomme au moins un candidat (`candidats.ts`, `nommeUnCandidat`). Ce module ne reçoit que
 * les éligibles, déjà filtrés. S'il y en a moins de 200, toutes sont prises et le résultat le dit
 * (`sous_effectif`), jamais en silence.
 */

import { graineDerivee } from "../../analysis/graines.ts";
import { generateur, melanger } from "../../validation/domaine/alea.ts";
import { GENERATEUR_DU_TIRAGE, GraineNonConforme } from "../questions/tirage.ts";
import type { GraineTirage } from "../questions/types.ts";
import type { TauxEchantillonHumain } from "./types.ts";

/**
 * Clé lisible de la graine de l'échantillon humain, dérivée de `run.graines.echantillon_humain`.
 * Une seule clé pour 10 % et 25 % : c'est ce qui rend l'échantillon de 25 % emboîté sur celui de
 * 10 % (D14 (1)). Texte haché : `<valeur>␀echantillon_humain`.
 */
export const CLE_ECHANTILLON_HUMAIN: readonly string[] = ["echantillon_humain"];

/**
 * Clé lisible de la graine du sous-ensemble contrefactuel des candidats, dérivée de
 * `run.graines.contrefactuel`. Le troisième composant nomme l'usage : le dérangement des candidats
 * (PR B) et un éventuel sous-ensemble du contrefactuel outil auront chacun le leur, sans partager
 * de suite aléatoire. `noms_candidats` est la valeur de `reponse.permutation.type`.
 * Texte haché : `<valeur>␀contrefactuel␀noms_candidats␀sous_ensemble`.
 */
export const CLE_SOUS_ENSEMBLE_CONTREFACTUEL: readonly string[] = ["contrefactuel", "noms_candidats", "sous_ensemble"];

/** §7 : « un sous-ensemble de 200 réponses est renoté ». */
export const TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL = 200;

/** Le taux publié, écrit en fraction exacte : la taille se calcule en entiers. */
const FRACTION_DU_TAUX: ReadonlyMap<number, { readonly numerateur: number; readonly denominateur: number }> = new Map([
  [0.1, { numerateur: 1, denominateur: 10 }],
  [0.25, { numerateur: 1, denominateur: 4 }],
]);

export interface SousEnsembleContrefactuel {
  /** Les réponses tirées, dans l'ordre du tirage. */
  readonly reponse_ids: readonly string[];
  readonly eligibles: number;
  readonly taille_visee: number;
  /** Moins d'éligibles que la taille visée : tous sont pris, et c'est dit. */
  readonly sous_effectif: boolean;
}

/** `⌈taux × n⌉`, en entiers. */
export function tailleEchantillonHumain(nombreReponses: number, taux: TauxEchantillonHumain): number {
  if (!Number.isInteger(nombreReponses) || nombreReponses < 0) {
    throw new Error(`Nombre de réponses invalide : ${nombreReponses}.`);
  }
  const fraction = FRACTION_DU_TAUX.get(taux);
  if (fraction === undefined) {
    throw new Error(`Taux d'échantillon humain ${String(taux)} hors de run.schema.json (0.1 ou 0.25).`);
  }
  const produit = nombreReponses * fraction.numerateur;
  return Math.floor((produit + fraction.denominateur - 1) / fraction.denominateur);
}

/**
 * L'ordre de tirage de l'échantillon humain : un mélange des réponses, dont l'échantillon est un
 * préfixe. Exporté pour que le contrôle croisé et un tiers rejouent le même ordre.
 */
export function ordreEchantillonHumain(reponse_ids: readonly string[], graine: GraineTirage): readonly string[] {
  return ordreTire(reponse_ids, graine, CLE_ECHANTILLON_HUMAIN);
}

/** Les réponses de l'échantillon humain, dans l'ordre du tirage. */
export function tirerEchantillonHumain(
  reponse_ids: readonly string[],
  graine: GraineTirage,
  taux: TauxEchantillonHumain,
): readonly string[] {
  const taille = tailleEchantillonHumain(reponse_ids.length, taux);
  return ordreEchantillonHumain(reponse_ids, graine).slice(0, taille);
}

/** Le sous-ensemble contrefactuel, tiré parmi les réponses éligibles reçues. */
export function tirerSousEnsembleContrefactuel(
  eligibles: readonly string[],
  graine: GraineTirage,
): SousEnsembleContrefactuel {
  const ordre = ordreTire(eligibles, graine, CLE_SOUS_ENSEMBLE_CONTREFACTUEL);
  return {
    reponse_ids: ordre.slice(0, TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL),
    eligibles: eligibles.length,
    taille_visee: TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL,
    sous_effectif: eligibles.length < TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL,
  };
}

function ordreTire(ids: readonly string[], graine: GraineTirage, cle: readonly string[]): readonly string[] {
  verifierGraine(graine);
  const ranges = rangerSansDoublon(ids);
  return melanger(ranges, generateur(graineDerivee(graine.valeur, cle)));
}

/** Ordre croissant des chaînes ; un identifiant en double est une donnée corrompue, pas un poids. */
function rangerSansDoublon(ids: readonly string[]): string[] {
  const ranges = [...ids].sort(comparerChaines);
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i] === ranges[i - 1]) throw new Error(`Identifiant en double dans un tirage de notation : ${String(ranges[i])}.`);
  }
  return ranges;
}

/** Ordre croissant des chaînes en unités UTF-16, celui de `<` : l'ordre de rangement publié. */
export function comparerChaines(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Une graine qui déclare un autre générateur que celui du tirage promet un tirage non rejouable. */
export function verifierGraine(graine: GraineTirage): void {
  for (const champ of ["algorithme", "bibliotheque", "version"] as const) {
    const attendu = GENERATEUR_DU_TIRAGE[champ];
    if (graine[champ] !== attendu) throw new GraineNonConforme(champ, graine[champ], `« ${attendu} »`);
  }
}
