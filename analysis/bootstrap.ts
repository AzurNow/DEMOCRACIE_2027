/**
 * Intervalles de confiance à 95 % par bootstrap en grappes (§8).
 *
 * « Tous les taux sont accompagnés d'un intervalle de confiance à 95 % par bootstrap en grappes,
 * la grappe étant l'item (les formulations et les échantillons d'un même item sont corrélés),
 * 2 000 rééchantillonnages, méthode des percentiles, graine publiée. »
 *
 * Trois choix, tous visibles dans la sortie :
 *
 * 1. **La grappe est lue**, dans `question.grappe_id` reporté sur l'unité, jamais recalculée.
 *    Rééchantillonner réponse par réponse donnerait un intervalle trop étroit : les trois
 *    formulations d'un même item ne sont pas trois observations indépendantes.
 * 2. **Percentile empirique par interpolation linéaire** (dit « type 7 ») : pour m valeurs
 *    triées et une probabilité p, h = (m − 1)·p, et la valeur est v[⌊h⌋] + (h − ⌊h⌋)·(v[⌈h⌉] −
 *    v[⌊h⌋]). Aucun BCa : la correction de biais demanderait un jackknife et un choix de plus,
 *    là où le §8 a préenregistré « méthode des percentiles ».
 * 3. **Un rééchantillon dont la statistique est indéfinie** (dénominateur nul) est compté à part,
 *    jamais remplacé par 0 : `reechantillonnages_indefinis` dit combien l'intervalle ignore.
 *
 * Le générateur est celui du dépôt (`validation/domaine/alea.ts`, SplitMix64 amorcé par le
 * sha256 d'une graine textuelle) : la reproductibilité du §9 ne dépend d'aucune version de Node.
 */

import { generateur, graineDepuisTexte, type GenerateurAleatoire } from "../validation/domaine/alea.ts";
import type { UniteAnalyse } from "./filtre.ts";
import type { Intervalle95, Taux, Ulid } from "./types.ts";

/** §8. Les tests en utilisent beaucoup moins, à graine fixe. */
export const REECHANTILLONNAGES_PRODUCTION = 2000;

export interface OptionsBootstrap {
  readonly reechantillonnages: number;
  /** Graine textuelle, passée telle quelle à l'algorithme `splitmix64-sha256-v1`. */
  readonly graine: string;
}

export type Statistique = (unites: readonly UniteAnalyse[]) => Taux;

/** §8 : une différence est « établie » ou « non établie ». Le rapport n'a pas d'autre mot. */
export type Qualificatif = "etablie" | "non_etablie";

export interface EchantillonBootstrap {
  /** Valeurs des rééchantillons, triées. Sans les indéfinies. */
  readonly valeurs: readonly number[];
  readonly indefinis: number;
  readonly nombre_grappes: number;
}

export interface DifferenceTaux {
  readonly taux_a: Taux;
  readonly taux_b: Taux;
  /** `null` quand l'un des deux taux n'existe pas : une différence sans terme n'existe pas. */
  readonly difference: number | null;
  readonly intervalle: Intervalle95 | null;
  readonly qualificatif: Qualificatif | null;
}

export function grapper(unites: readonly UniteAnalyse[]): Map<Ulid, UniteAnalyse[]> {
  const grappes = new Map<Ulid, UniteAnalyse[]>();
  for (const unite of unites) {
    const existante = grappes.get(unite.grappe_id);
    if (existante === undefined) grappes.set(unite.grappe_id, [unite]);
    else existante.push(unite);
  }
  return grappes;
}

export function percentile(valeursTriees: readonly number[], p: number): number {
  if (valeursTriees.length === 0) {
    throw new Error("Percentile d'une liste vide : aucune borne à publier.");
  }
  if (p < 0 || p > 1) throw new Error(`Probabilité hors de [0, 1] : ${p}`);
  const h = (valeursTriees.length - 1) * p;
  const bas = Math.floor(h);
  const valeurBasse = valeursTriees[bas] as number;
  const valeurHaute = valeursTriees[Math.ceil(h)] as number;
  return valeurBasse + (h - bas) * (valeurHaute - valeurBasse);
}

export function reechantillonner(
  unites: readonly UniteAnalyse[],
  statistique: Statistique,
  options: OptionsBootstrap,
): EchantillonBootstrap {
  const grappes = [...grapper(unites).values()];
  return echantillonner(
    grappes.length,
    (indices) => valeurDe(statistique(rassembler(grappes, indices))),
    options,
  );
}

/**
 * Différence appariée par grappe : les deux bras sont recalculés sur les MÊMES grappes tirées,
 * sinon la corrélation entre les deux mesures d'un même item serait perdue et l'intervalle de la
 * différence, trop large.
 */
export function reechantillonnerDifference(
  unitesA: readonly UniteAnalyse[],
  unitesB: readonly UniteAnalyse[],
  statistique: Statistique,
  options: OptionsBootstrap,
): EchantillonBootstrap {
  const grappesA = grapper(unitesA);
  const grappesB = grapper(unitesB);
  const cles = [...new Set([...grappesA.keys(), ...grappesB.keys()])];
  return echantillonner(
    cles.length,
    (indices) => {
      const cellesTirees = indices.map((i) => cles[i] as Ulid);
      return ecart(
        statistique(rassemblerParCle(grappesA, cellesTirees)),
        statistique(rassemblerParCle(grappesB, cellesTirees)),
      );
    },
    options,
  );
}

export function intervalleBootstrap(
  unites: readonly UniteAnalyse[],
  statistique: Statistique,
  options: OptionsBootstrap,
): Intervalle95 | null {
  return intervalleDepuis(reechantillonner(unites, statistique, options), options.reechantillonnages);
}

export function intervalleDepuis(
  echantillon: EchantillonBootstrap,
  reechantillonnages: number,
): Intervalle95 | null {
  if (echantillon.nombre_grappes === 0 || echantillon.valeurs.length === 0) return null;
  return {
    bas: percentile(echantillon.valeurs, 0.025),
    haut: percentile(echantillon.valeurs, 0.975),
    nombre_grappes: echantillon.nombre_grappes,
    reechantillonnages,
    reechantillonnages_indefinis: echantillon.indefinis,
    degenere: echantillon.nombre_grappes === 1 ? "grappe_unique" : null,
  };
}

export function differenceAppariee(
  unitesA: readonly UniteAnalyse[],
  unitesB: readonly UniteAnalyse[],
  statistique: Statistique,
  options: OptionsBootstrap,
): DifferenceTaux {
  const taux_a = statistique(unitesA);
  const taux_b = statistique(unitesB);
  const difference = ecart(taux_a, taux_b);
  if (difference === null) {
    return { taux_a, taux_b, difference: null, intervalle: null, qualificatif: null };
  }
  const echantillon = reechantillonnerDifference(unitesA, unitesB, statistique, options);
  const intervalle = intervalleDepuis(echantillon, options.reechantillonnages);
  return { taux_a, taux_b, difference, intervalle, qualificatif: qualifier(intervalle) };
}

/** §8 : « établie » seulement si l'intervalle exclut zéro. Aucun autre mot n'est publiable. */
export function qualifier(intervalle: Intervalle95 | null): Qualificatif | null {
  if (intervalle === null) return null;
  return intervalle.bas > 0 || intervalle.haut < 0 ? "etablie" : "non_etablie";
}

function echantillonner(
  nombreGrappes: number,
  valeurPour: (indices: readonly number[]) => number | null,
  options: OptionsBootstrap,
): EchantillonBootstrap {
  verifierOptions(options);
  const rng = generateur(graineDepuisTexte(options.graine));
  const valeurs: number[] = [];
  let indefinis = 0;
  for (let b = 0; b < options.reechantillonnages; b += 1) {
    const valeur = nombreGrappes === 0 ? null : valeurPour(tirerAvecRemise(nombreGrappes, rng));
    if (valeur === null) indefinis += 1;
    else valeurs.push(valeur);
  }
  valeurs.sort((x, y) => x - y);
  return { valeurs, indefinis, nombre_grappes: nombreGrappes };
}

function verifierOptions(options: OptionsBootstrap): void {
  if (!Number.isInteger(options.reechantillonnages) || options.reechantillonnages < 1) {
    throw new Error(`Nombre de rééchantillonnages invalide : ${options.reechantillonnages}`);
  }
  if (options.graine.length === 0) throw new Error("Graine de bootstrap vide : rien ne serait rejouable.");
}

function tirerAvecRemise(nombreGrappes: number, rng: GenerateurAleatoire): number[] {
  const indices: number[] = [];
  for (let i = 0; i < nombreGrappes; i += 1) indices.push(rng.entier(nombreGrappes));
  return indices;
}

function rassembler(grappes: readonly (readonly UniteAnalyse[])[], indices: readonly number[]): UniteAnalyse[] {
  const unites: UniteAnalyse[] = [];
  for (const i of indices) unites.push(...(grappes[i] as readonly UniteAnalyse[]));
  return unites;
}

function rassemblerParCle(
  grappes: ReadonlyMap<Ulid, readonly UniteAnalyse[]>,
  cles: readonly Ulid[],
): UniteAnalyse[] {
  const unites: UniteAnalyse[] = [];
  for (const cle of cles) {
    const membres = grappes.get(cle);
    if (membres !== undefined) unites.push(...membres);
  }
  return unites;
}

/** Différence de deux taux, absente dès que l'un des deux l'est. */
function ecart(a: Taux, b: Taux): number | null {
  if (a.valeur === undefined || b.valeur === undefined) return null;
  return a.valeur - b.valeur;
}

function valeurDe(t: Taux): number | null {
  return t.valeur === undefined ? null : t.valeur;
}
