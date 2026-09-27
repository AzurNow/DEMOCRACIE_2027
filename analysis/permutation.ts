/**
 * Test de permutation de l'homogénéité des taux d'erreur entre candidats (§8, QR3/H4).
 *
 * « Pour chaque outil et chaque mode, un test de permutation de l'homogénéité des taux d'erreur
 * entre candidats : les étiquettes de candidat sont permutées entre items 10 000 fois ; la
 * statistique est l'écart maximal absolu entre l'exactitude d'un candidat et l'exactitude
 * moyenne de l'outil. »
 *
 * Trois points de lecture, tous conséquents :
 *
 * 1. **Les étiquettes sont permutées entre items, pas entre réponses.** Une étiquette voyage avec
 *    l'item entier — ses trois formulations et ses deux échantillons. Permuter par réponse
 *    fabriquerait de l'indépendance qui n'existe pas et rendrait la valeur p trop petite.
 * 2. **« L'exactitude moyenne de l'outil » est son exactitude globale** (exactes / classées sur
 *    ses réponses aux questions qui nomment un candidat comparé — conformité n° 30), invariante
 *    par permutation. La moyenne non pondérée des exactitudes par candidat, elle, bougerait d'une
 *    permutation à l'autre.
 * 3. **L'exactitude d'un candidat garde la définition de `metriques.ts`** : l'agrégat par grappe
 *    est produit par `exactitude()`, et la statistique ne fait qu'en sommer numérateurs et
 *    dénominateurs. La métrique ne vit pas ici une deuxième fois.
 *
 * Le générateur est amorcé par `graineDerivee(options.graine_du_run, ["permutation",
 * ...options.cle])` (`graines.ts`) : la valeur p se rejoue depuis `run.graines.permutation.valeur`.
 *
 * Valeur p de Monte-Carlo : (1 + nombre de permutations au moins aussi extrêmes) / (1 + B). Le
 * « 1 + » compte l'échantillon observé lui-même ; sans lui, une valeur p nulle serait publiable,
 * ce qu'aucun nombre fini de permutations ne justifie.
 */

import { generateur, melanger, type GenerateurAleatoire } from "../validation/domaine/alea.ts";
import type { UniteAnalyse } from "./filtre.ts";
import { graineDerivee } from "./graines.ts";
import { corrigerHolm, type ValeurP, type ValeurPCorrigee } from "./holm.ts";
import { exactitude, exactitudeParCandidat } from "./metriques.ts";
import { cleCouple, repartirParCandidat, type PartageCandidats, type PartageCouples } from "./seuils.ts";
import { taux, type CoupleOutilMode, type IdentifiantCourt, type Taux, type Ulid } from "./types.ts";

/** §8. Les tests en utilisent beaucoup moins, à graine fixe. */
export const PERMUTATIONS_PRODUCTION = 10000;

/**
 * Tolérance de comparaison des statistiques, en valeur absolue. Deux statistiques égales à
 * l'arithmétique près doivent compter comme « au moins aussi extrême » : sans cette tolérance,
 * le bruit du flottant retirerait des permutations du compte et réduirait la valeur p.
 */
const TOLERANCE = 1e-12;

export interface OptionsPermutation {
  readonly permutations: number;
  /** `run.graines.permutation.valeur`, l'entier publié du run. */
  readonly graine_du_run: number;
  /** Clé lisible du test (outil, mode), sans la famille `permutation` que ce module ajoute en tête. */
  readonly cle: readonly string[];
}

/** Famille ajoutée en tête de toute clé de permutation (`graines.ts`). */
export const FAMILLE_PERMUTATION = "permutation";

/** Un item, son étiquette de candidat, et ses comptages d'exactitude. */
export interface GrappeEtiquetee {
  readonly grappe_id: Ulid;
  readonly candidat_id: IdentifiantCourt;
  readonly exactes: number;
  readonly classees: number;
}

export interface ExactitudeCandidat {
  readonly candidat_id: IdentifiantCourt;
  readonly exactitude: Taux;
}

export interface ResultatPermutation {
  readonly statistique_observee: number;
  readonly valeur_p: number;
  readonly permutations: number;
  readonly exactitude_outil: Taux;
  readonly candidats: readonly ExactitudeCandidat[];
  /**
   * §4 : candidats sous le seuil de couverture présents dans les unités, rapportés à part avec la
   * mention « couverture insuffisante », sans taux (§8). Leurs items n'entrent ni dans la
   * statistique, ni dans l'exactitude globale de référence, ni dans les permutations.
   */
  readonly candidats_rapportes_a_part: readonly IdentifiantCourt[];
}

/**
 * Agrège les unités par item. Sont écartés, explicitement : les items sans candidat (Q-ATT, que
 * le §5 interdit d'attribuer) et les items dont aucune réponse n'est classée (ni exacte ni
 * inexacte), qui ne portent aucune information d'exactitude.
 */
export function grappesEtiquetees(unites: readonly UniteAnalyse[]): GrappeEtiquetee[] {
  const parGrappe = new Map<Ulid, UniteAnalyse[]>();
  for (const unite of unites) {
    if (unite.candidat_id === null) continue;
    const existante = parGrappe.get(unite.grappe_id);
    if (existante === undefined) parGrappe.set(unite.grappe_id, [unite]);
    else existante.push(unite);
  }
  const grappes: GrappeEtiquetee[] = [];
  for (const [grappe_id, membres] of parGrappe) {
    const comptages = exactitude(membres);
    if (comptages.denominateur === 0) continue;
    grappes.push({
      grappe_id,
      candidat_id: candidatUnique(grappe_id, membres),
      exactes: comptages.numerateur,
      classees: comptages.denominateur,
    });
  }
  return grappes;
}

function candidatUnique(grappe_id: Ulid, membres: readonly UniteAnalyse[]): IdentifiantCourt {
  const candidats = new Set(membres.map((u) => u.candidat_id));
  if (candidats.size !== 1) {
    throw new Error(`Item ${grappe_id} portant ${candidats.size} candidats différents : étiquette indécidable.`);
  }
  return membres[0]?.candidat_id as IdentifiantCourt;
}

/** Les étiquettes changent d'item ; les comptages d'un item ne bougent jamais. */
export function permuterEtiquettes(
  grappes: readonly GrappeEtiquetee[],
  rng: GenerateurAleatoire,
): GrappeEtiquetee[] {
  const etiquettes = melanger(
    grappes.map((g) => g.candidat_id),
    rng,
  );
  return grappes.map((g, i) => ({ ...g, candidat_id: etiquettes[i] as IdentifiantCourt }));
}

/** Écart maximal absolu entre l'exactitude d'un candidat et l'exactitude globale de l'outil. */
export function ecartMaximal(grappes: readonly GrappeEtiquetee[]): number {
  const parCandidat = new Map<IdentifiantCourt, { exactes: number; classees: number }>();
  let exactes = 0;
  let classees = 0;
  for (const grappe of grappes) {
    const connu = parCandidat.get(grappe.candidat_id);
    const cumul = connu === undefined ? { exactes: 0, classees: 0 } : connu;
    cumul.exactes += grappe.exactes;
    cumul.classees += grappe.classees;
    parCandidat.set(grappe.candidat_id, cumul);
    exactes += grappe.exactes;
    classees += grappe.classees;
  }
  if (classees === 0) {
    throw new Error("Écart maximal sur un jeu sans réponse classée : statistique indéfinie.");
  }
  const globale = exactes / classees;
  let ecart = 0;
  for (const cumul of parCandidat.values()) {
    ecart = Math.max(ecart, Math.abs(cumul.exactes / cumul.classees - globale));
  }
  return ecart;
}

/**
 * `null` quand le test n'a pas d'objet : aucun item exploitable, ou moins de deux candidats
 * comparés — il n'y a alors rien à permuter, et publier une valeur p de 1 laisserait croire
 * qu'un test a eu lieu.
 *
 * Le partage vient de `candidatsComparables(run)` (conformité n° 30) : un candidat sous le seuil
 * de couverture « n'entre pas dans les comparaisons inter-candidats » (§4). Ses items sont retirés
 * avant la formation des grappes ; il est rendu à part dans le résultat, jamais effacé.
 */
export function testHomogeneiteCandidats(
  unites: readonly UniteAnalyse[],
  partage: PartageCandidats,
  options: OptionsPermutation,
): ResultatPermutation | null {
  verifierOptions(options);
  const { comparees } = repartirParCandidat(unites, partage);
  const grappes = grappesEtiquetees(comparees);
  const candidats = new Set(grappes.map((g) => g.candidat_id));
  if (candidats.size < 2) return null;
  const observee = ecartMaximal(grappes);
  const parCandidat = exactitudeParCandidat(unites, partage);
  return {
    statistique_observee: observee,
    valeur_p: valeurPDe(grappes, observee, options),
    permutations: options.permutations,
    exactitude_outil: exactitudeDesGrappes(grappes),
    candidats: [...parCandidat.compares].map(([candidat_id, t]) => ({ candidat_id, exactitude: t })),
    candidats_rapportes_a_part: parCandidat.rapportes_a_part,
  };
}

/** Le test d'un couple outil × mode ; `null` quand il n'a pas eu d'objet. */
export interface ResultatCouple {
  readonly couple: CoupleOutilMode;
  readonly resultat: ResultatPermutation | null;
}

export interface FamilleAsymetrie {
  /** Une entrée par couple testé, clé `cleCouple`, dans l'ordre d'entrée. */
  readonly corrigees: readonly ValeurPCorrigee[];
  /** §8 : couples marqués « run incomplet », exclus des comparaisons, donc de la famille. */
  readonly couples_incomplets: readonly string[];
  /** Couples comparables dont le test n'a pas eu d'objet : aucune valeur p, rien à corriger. */
  readonly couples_sans_test: readonly string[];
}

/**
 * §8 (protocole 0.11) : « Correction de Holm sur la famille de toutes les valeurs p du run, une
 * par couple outil × mode. » La famille est formée ici, une seule fois : les couples incomplets
 * (conformité n° 84) et les tests sans objet n'y entrent pas, et sont rendus à part.
 *
 * Une famille qui perdrait un couple comparable aurait des valeurs corrigées plus petites qu'elle
 * ne doit : un couple comparable sans résultat lève, comme un couple inconnu ou en double.
 */
export function corrigerFamilleAsymetrie(
  resultats: readonly ResultatCouple[],
  couples: PartageCouples,
): FamilleAsymetrie {
  const comparables = new Set(couples.compares.map(cleCouple));
  const incomplets = new Set(couples.incomplets.map(cleCouple));
  verifierCouplesDeLaFamille(resultats, comparables, incomplets);
  const famille: ValeurP[] = [];
  const sans_test: string[] = [];
  for (const { couple, resultat } of resultats) {
    const cle = cleCouple(couple);
    if (incomplets.has(cle)) continue;
    if (resultat === null) sans_test.push(cle);
    else famille.push({ cle, valeur: resultat.valeur_p });
  }
  return { corrigees: corrigerHolm(famille), couples_incomplets: [...incomplets], couples_sans_test: sans_test };
}

function verifierCouplesDeLaFamille(
  resultats: readonly ResultatCouple[],
  comparables: ReadonlySet<string>,
  incomplets: ReadonlySet<string>,
): void {
  const vus = new Set<string>();
  for (const { couple } of resultats) {
    const cle = cleCouple(couple);
    if (vus.has(cle)) throw new Error(`Couple ${cle} en double dans la famille de Holm.`);
    if (!comparables.has(cle) && !incomplets.has(cle)) {
      throw new Error(`Couple ${cle} absent du partage des couples du run : famille de Holm indécidable.`);
    }
    vus.add(cle);
  }
  const manquants = [...comparables].filter((cle) => !vus.has(cle));
  if (manquants.length > 0) {
    throw new Error(`Couples comparables sans résultat de test : ${manquants.join(", ")}. Famille de Holm incomplète.`);
  }
}

function valeurPDe(
  grappes: readonly GrappeEtiquetee[],
  observee: number,
  options: OptionsPermutation,
): number {
  const rng = generateur(graineDerivee(options.graine_du_run, [FAMILLE_PERMUTATION, ...options.cle]));
  let extremes = 0;
  for (let i = 0; i < options.permutations; i += 1) {
    if (ecartMaximal(permuterEtiquettes(grappes, rng)) >= observee - TOLERANCE) extremes += 1;
  }
  return (1 + extremes) / (1 + options.permutations);
}

function exactitudeDesGrappes(grappes: readonly GrappeEtiquetee[]): Taux {
  let exactes = 0;
  let classees = 0;
  for (const grappe of grappes) {
    exactes += grappe.exactes;
    classees += grappe.classees;
  }
  return taux(exactes, classees);
}

function verifierOptions(options: OptionsPermutation): void {
  if (!Number.isInteger(options.permutations) || options.permutations < 1) {
    throw new Error(`Nombre de permutations invalide : ${options.permutations}`);
  }
  // Une graine invalide refuse avant tout calcul, pas seulement quand un tirage a lieu.
  graineDerivee(options.graine_du_run, [FAMILLE_PERMUTATION, ...options.cle]);
}
