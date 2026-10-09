/**
 * Kappa juges-humains de l'échantillon humain (§7, « À chaque run, l'accord juges-humains sur
 * l'échantillon de 10 % est publié » ; §12, premier critère). Décision D24 (1) et (2) de l'auteur du
 * 2026-10-09 :
 *
 * - **un kappa par juge retenu** (`retire === false`) ; les notations d'un juge retiré n'entrent
 *   nulle part (D13) ;
 * - pour chaque réponse de l'échantillon, la catégorie primaire de la notation du juge est comparée
 *   à celle de la **note humaine retenue** : celle des deux humains quand ils s'accordent (au sens
 *   de `analysis/note-lue.ts:notationsConcordent`, seule égalité du dépôt), sinon celle de
 *   l'arbitre (`arbitrage_echantillon_10`) ;
 * - kappa de Cohen non pondéré sur `exacte`, `inexacte`, `non_reponse`, fixées a priori — le noyau
 *   est celui du §4 (`validation/domaine/kappa.ts`), jamais un second ;
 * - un kappa indéfini (accord attendu maximal, ou aucune réponse comparable) est publié absent
 *   avec son motif, jamais 0, 1 ni null.
 *
 * L'échantillon est rejoué par l'appelant (`pipeline/notation/echantillons.ts:tirerEchantillonHumain`),
 * comme le fait le contrôle croisé. Toute référence humaine qui manque (double notation incomplète,
 * désaccord sans arbitre) ou qui sort des trois catégories lève `ReferenceHumaineIndefinie` : aucune
 * référence n'est inventée, et le kappa n'est pas calculé sur un échantillon amputé en silence.
 */

import { notationsConcordent } from "../../analysis/note-lue.ts";
import type { CategorieRetenue, MotifNotation, Ulid } from "../../analysis/types.ts";
import { comptesKappa, kappaCohen, type PaireCategories } from "../../validation/domaine/kappa.ts";
import { JugeIndetermine } from "../notation/decision.ts";
import type { JugeDuRun, NotationIndividuelle } from "../notation/types.ts";

/** Les trois catégories primaires qu'un juge peut rendre (§7), dans un ordre figé. */
export const CATEGORIES_KAPPA_ECHANTILLON = ["exacte", "inexacte", "non_reponse"] as const;
export type CategorieKappaEchantillon = (typeof CATEGORIES_KAPPA_ECHANTILLON)[number];

/** `schema/run.schema.json#/$defs/motif_kappa_echantillon_indefini`. */
export type MotifKappaEchantillonIndefini = "accord_attendu_maximal" | "aucune_reponse_comparable";

/** §12 : « ≥ 0,75 », en fraction exacte ; 0,75 exactement passe. */
export const SEUIL_KAPPA_ECHANTILLON = { numerateur: 3, denominateur: 4 } as const;

export interface KappaDeJuge {
  readonly juge_id: string;
  /** `null` quand le kappa n'est pas défini : `motif_indefini` dit pourquoi. */
  readonly kappa: number | null;
  readonly motif_indefini: MotifKappaEchantillonIndefini | null;
  /** Décidé en entiers sur les comptes du kappa ; faux pour un kappa indéfini. */
  readonly atteint_seuil: boolean;
  readonly n: number;
}

export class ReferenceHumaineIndefinie extends Error {
  readonly reponse_id: Ulid;

  constructor(reponse_id: Ulid, detail: string) {
    super(`Réponse ${reponse_id} de l'échantillon humain : ${detail} Le kappa de l'échantillon n'est pas calculé (D24) ; aucune référence n'est inventée.`);
    this.name = "ReferenceHumaineIndefinie";
    this.reponse_id = reponse_id;
  }
}

export class NotationDeJugeIntrouvable extends Error {
  constructor(juge_id: string, reponse_id: Ulid, nombre: number) {
    super(`Réponse ${reponse_id} de l'échantillon humain : ${nombre} notation(s) du juge retenu ${juge_id} au lieu d'une. Le kappa de l'échantillon n'est pas calculé (D24).`);
    this.name = "NotationDeJugeIntrouvable";
  }
}

export interface EntreeKappaEchantillon {
  readonly juges: readonly JugeDuRun[];
  /** Les réponses de l'échantillon humain, rejouées par l'appelant. */
  readonly echantillon: readonly Ulid[];
  /** Les notations individuelles du volume ; seules celles de contexte `run` sont lues. */
  readonly notations: readonly NotationIndividuelle[];
}

/** Un kappa par juge retenu, dans l'ordre de `run.json#/juges`. Les juges retirés n'en ont pas. */
export function kappasEchantillon(entree: EntreeKappaEchantillon): readonly KappaDeJuge[] {
  const parReponse = notationsParReponse(entree.echantillon, entree.notations);
  const references = [...parReponse].map(([id, notations]) => ({ id, notations, categorie: referenceHumaine(id, notations) }));
  return entree.juges
    .filter((juge) => !juge.retire)
    .map((juge) => kappaDuJuge(juge.juge_id, references.map((r) => ({ a: categorieDuJuge(juge.juge_id, r.id, r.notations), b: r.categorie }))));
}

/** Les notations de contexte `run` de chaque réponse de l'échantillon, dans l'ordre de l'échantillon. */
function notationsParReponse(echantillon: readonly Ulid[], notations: readonly NotationIndividuelle[]): ReadonlyMap<Ulid, readonly NotationIndividuelle[]> {
  const index = new Map<Ulid, NotationIndividuelle[]>(echantillon.map((id) => [id, []]));
  for (const notation of notations) {
    if (notation.contexte !== "run" || notation.objet_note.type !== "reponse") continue;
    index.get(notation.objet_note.id)?.push(notation);
  }
  return index;
}

function humainesSous(notations: readonly NotationIndividuelle[], motif: MotifNotation): readonly NotationIndividuelle[] {
  return notations.filter((n) => n.notateur.type === "humain" && n.motif_notation === motif);
}

/**
 * La catégorie de la note humaine retenue d'une réponse de l'échantillon (D24 (1)) : celle des deux
 * humains s'ils s'accordent, sinon celle de l'arbitre. Exportée pour ses tests.
 */
export function referenceHumaine(reponse_id: Ulid, notations: readonly NotationIndividuelle[]): CategorieKappaEchantillon {
  const double = humainesSous(notations, "echantillon_aleatoire_10");
  const [premiere, seconde] = double;
  if (premiere === undefined || seconde === undefined || double.length !== 2) {
    throw new ReferenceHumaineIndefinie(reponse_id, `${double.length} notation(s) humaine(s) d'échantillon au lieu de deux (double notation incomplète).`);
  }
  if (notationsConcordent(premiere, seconde)) return categorieComparable(reponse_id, premiere.categorie);
  return categorieComparable(reponse_id, arbitreDe(reponse_id, notations).categorie);
}

function arbitreDe(reponse_id: Ulid, notations: readonly NotationIndividuelle[]): NotationIndividuelle {
  const arbitrages = humainesSous(notations, "arbitrage_echantillon_10");
  const [arbitre] = arbitrages;
  if (arbitre === undefined || arbitrages.length !== 1) {
    throw new ReferenceHumaineIndefinie(reponse_id, `les deux humains divergent et ${arbitrages.length} arbitrage(s) au lieu d'un (§7 : le troisième humain tranche).`);
  }
  return arbitre;
}

/**
 * Une note humaine `indeterminee` n'a pas de place parmi les trois catégories de D24 : la compter
 * comme un désaccord ou l'écarter changerait le kappa publié, et D24 ne le dit pas. Question
 * ouverte, posée à l'auteur ; d'ici là, elle arrête le calcul.
 */
function categorieComparable(reponse_id: Ulid, categorie: CategorieRetenue): CategorieKappaEchantillon {
  if (categorie === "indeterminee") {
    throw new ReferenceHumaineIndefinie(reponse_id, "la note humaine retenue est « indeterminee », hors des trois catégories du kappa (D24 ne dit pas comment la compter).");
  }
  return categorie;
}

/** La notation du juge retenu sur la réponse : exactement une, jamais « indeterminee » (§7). */
function categorieDuJuge(juge_id: string, reponse_id: Ulid, notations: readonly NotationIndividuelle[]): CategorieKappaEchantillon {
  const siennes = notations.filter((n) => n.notateur.type === "juge" && n.notateur.id === juge_id);
  const [notation] = siennes;
  if (notation === undefined || siennes.length !== 1) throw new NotationDeJugeIntrouvable(juge_id, reponse_id, siennes.length);
  if (notation.categorie === "indeterminee") throw new JugeIndetermine(notation);
  return notation.categorie;
}

function kappaDuJuge(juge_id: string, paires: readonly PaireCategories<CategorieKappaEchantillon>[]): KappaDeJuge {
  const resultat = kappaCohen(paires, CATEGORIES_KAPPA_ECHANTILLON);
  if (resultat.kappa === null) {
    const motif = resultat.n === 0 ? "aucune_reponse_comparable" : "accord_attendu_maximal";
    return { juge_id, kappa: null, motif_indefini: motif, atteint_seuil: false, n: resultat.n };
  }
  return { juge_id, kappa: resultat.kappa, motif_indefini: null, atteint_seuil: atteintSeuil(paires), n: resultat.n };
}

/**
 * κ ≥ 3/4 décidé en entiers : `κ = (A·n − B) / (n² − B)` avec `n² − B > 0` (kappa défini), donc
 * `κ ≥ 3/4 ⇔ 4·(A·n − B) ≥ 3·(n² − B)`. Le flottant de `kappaCohen` est publié, il ne décide pas.
 */
function atteintSeuil(paires: readonly PaireCategories<CategorieKappaEchantillon>[]): boolean {
  const { n, accords, attendus } = comptesKappa(paires, CATEGORIES_KAPPA_ECHANTILLON);
  const { numerateur, denominateur } = SEUIL_KAPPA_ECHANTILLON;
  return denominateur * (accords * n - attendus) >= numerateur * (n * n - attendus);
}
