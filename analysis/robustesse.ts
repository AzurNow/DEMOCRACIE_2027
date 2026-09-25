/**
 * Analyses de robustesse préenregistrées (§8, protocole 0.3).
 *
 * « Recalcul des métriques primaires (a) sur la seule notation humaine de l'échantillon de 10 %,
 * (b) en excluant les items contestés à un run ultérieur, (c) en excluant les formulations
 * orientées, (d) en excluant les réponses tronquées. Un résultat qui ne survit pas à ces quatre
 * recalculs est signalé comme fragile. »
 *
 * Les réponses tronquées entrent toujours dans le calcul principal (§8 : elles sont « notée[s]
 * sur ce qu'elle[s] contien[nent] et entre[nt] dans les métriques primaires ») ; leur exclusion
 * n'existe qu'ici, comme recalcul (d).
 *
 * **Le recalcul (a) lit les notations individuelles, jamais le verdict.** §7 (0.7) : « Pour une
 * réponse de l'échantillon, la note humaine prévaut sur celle des juges. Quand les deux humains
 * s'accordent, leur note est retenue ; quand ils divergent, la réponse est arbitrée par un
 * troisième humain, et c'est cette note que retient le recalcul (a) du §8. » Sont lues les seules
 * notations du run, portant sur une réponse, dont le notateur est humain et le motif
 * `echantillon_aleatoire_10` (les deux notations à l'aveugle) ou `arbitrage_echantillon_10` (le
 * troisième humain). Une notation de juge n'est jamais lue, quel que soit son motif ; un humain
 * appelé pour un désaccord de juges ou une erreur grave non plus, puisqu'il n'est pas tiré au sort.
 *
 * « S'accorder » se lit strictement : les deux notes sont identiques sur tout ce que lisent les
 * métriques primaires — catégorie, ensemble des drapeaux, fraîcheur d'obsolescence, et les trois
 * booléens de sourçage. Sinon il n'existe pas de « leur note » à retenir sans inventer une règle de
 * fusion, et la réponse doit passer par le troisième humain. Une divergence sans troisième
 * notation lève `DivergenceSansArbitrage` : jamais la note des juges en repli.
 *
 * Deux lectures assumées, toutes deux visibles dans la sortie :
 *
 * - « Ne pas survivre » se dit d'un résultat **établi** au calcul principal qui cesse de l'être
 *   dans l'un des quatre recalculs. Une différence déjà non établie n'avait rien à faire
 *   survivre ; la marquer fragile laisserait croire à un résultat rabaissé.
 * - Un recalcul **qui ne peut plus être calculé** (plus aucune réponse après restriction) ne
 *   confirme rien : il rend le résultat fragile, avec son motif. Une absence de confirmation
 *   n'est pas une confirmation.
 *
 * La 0.9 écrit ces deux lectures (§8 : « Un résultat est une différence qualifiée d'établie. Il
 * est fragile si, dans l'un des quatre recalculs, sa différence n'est plus établie ou ne peut plus
 * être calculée. ») et y ajoute la grappe unique, sans qualificatif (`bootstrap.ts:qualifier`) :
 * un principal sur une seule grappe n'est pas établi, donc jamais fragile ; un recalcul qui tombe
 * sur une seule grappe n'est plus établi, donc rend fragile un principal établi.
 */

import { differenceAppariee, type DifferenceTaux, type OptionsBootstrap, type Statistique } from "./bootstrap.ts";
import { filtrerContexteRun, type UniteAnalyse } from "./filtre.ts";
import type { CategorieRetenue, Drapeau, Notation, Run, SourcageRetenu, Ulid } from "./types.ts";

export type Recalcul =
  | "echantillon_humain"
  | "items_contestes"
  | "formulations_orientees"
  | "reponses_tronquees";

export interface RecalculRobustesse {
  readonly recalcul: Recalcul;
  readonly difference: DifferenceTaux;
}

export interface ResultatRobustesse {
  readonly principal: DifferenceTaux;
  readonly recalculs: readonly RecalculRobustesse[];
  readonly fragile: boolean;
  readonly motifs_fragilite: readonly Recalcul[];
}

/** Ce que lit le recalcul (a), en plus des unités : le run et les notations individuelles. */
export interface SourcesRobustesse {
  readonly run: Run;
  readonly notations: readonly Notation[];
}

/** Réponse de l'échantillon dont les deux humains divergent, sans troisième notation humaine. */
export class DivergenceSansArbitrage extends Error {
  readonly reponse_id: Ulid;

  constructor(reponse_id: Ulid) {
    super(
      `Réponse ${reponse_id} de l'échantillon humain : les deux notations divergent et aucun troisième humain n'a arbitré (§7).`,
    );
    this.name = "DivergenceSansArbitrage";
    this.reponse_id = reponse_id;
  }
}

/** Notations humaines de l'échantillon qui ne forment pas la double notation (+ arbitrage) du §7. */
export class EchantillonHumainIncoherent extends Error {
  readonly reponse_id: Ulid;

  constructor(reponse_id: Ulid, detail: string) {
    super(`Réponse ${reponse_id}, échantillon humain de 10 % : ${detail}`);
    this.name = "EchantillonHumainIncoherent";
    this.reponse_id = reponse_id;
  }
}

const MOTIF_ECHANTILLON = "echantillon_aleatoire_10";
const MOTIF_ARBITRAGE = "arbitrage_echantillon_10";

/** Ce que les métriques primaires lisent d'une note : c'est aussi ce sur quoi deux humains s'accordent. */
interface NoteLue {
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  readonly obsolescence_fraiche: boolean | null;
  readonly sourcage: SourcageRetenu;
}

interface NotationsHumaines {
  readonly echantillon: Notation[];
  readonly arbitrages: Notation[];
}

/**
 * §8(a) : les réponses de l'échantillon (`dans_echantillon_humain`, §7), chacune portant la note
 * humaine retenue par la règle du §7 au lieu de la note retenue du verdict.
 */
export function recalculEchantillonHumain(
  unites: readonly UniteAnalyse[],
  notations: readonly Notation[],
): UniteAnalyse[] {
  const parReponse = notationsHumainesParReponse(notations);
  verifierHorsEchantillon(unites, parReponse);
  return unites
    .filter((u) => u.dans_echantillon_humain)
    .map((u) => ({ ...u, ...noteHumaineRetenue(u.reponse_id, parReponse.get(u.reponse_id)) }));
}

/**
 * Traduction d'une notation individuelle vers les trois booléens de `sourcage_retenu` (§7, §8 :
 * « au moins une source existante qui soutient l'affirmation ») : `au_moins_un_lien_existant` =
 * au moins un lien dont le test HTTP dit `existe` ; `au_moins_un_lien_soutenant` = au moins un
 * MÊME lien qui existe ET soutient. Un lien mort qui « soutient » ne soutient rien.
 */
export function sourcageDeNotation(notation: Notation): SourcageRetenu {
  const liens = notation.sourcage.liens;
  return {
    cite: notation.sourcage.cite,
    au_moins_un_lien_existant: liens.some((l) => l.verdict_existence === "existe"),
    au_moins_un_lien_soutenant: liens.some((l) => l.verdict_existence === "existe" && l.verdict_soutien === "soutient"),
  };
}

function estLueParRecalculA(notation: Notation): boolean {
  if (notation.objet_note.type !== "reponse" || notation.notateur.type !== "humain") return false;
  return notation.motif_notation === MOTIF_ECHANTILLON || notation.motif_notation === MOTIF_ARBITRAGE;
}

function notationsHumainesParReponse(notations: readonly Notation[]): Map<Ulid, NotationsHumaines> {
  const parReponse = new Map<Ulid, NotationsHumaines>();
  for (const notation of filtrerContexteRun(notations).filter(estLueParRecalculA)) {
    const connues = parReponse.get(notation.objet_note.id);
    const humaines = connues === undefined ? { echantillon: [], arbitrages: [] } : connues;
    if (notation.motif_notation === MOTIF_ARBITRAGE) humaines.arbitrages.push(notation);
    else humaines.echantillon.push(notation);
    parReponse.set(notation.objet_note.id, humaines);
  }
  return parReponse;
}

function verifierHorsEchantillon(
  unites: readonly UniteAnalyse[],
  parReponse: ReadonlyMap<Ulid, NotationsHumaines>,
): void {
  for (const unite of unites) {
    if (unite.dans_echantillon_humain || !parReponse.has(unite.reponse_id)) continue;
    throw new EchantillonHumainIncoherent(
      unite.reponse_id,
      "notée au titre de l'échantillon alors que son verdict la dit hors échantillon.",
    );
  }
}

function noteHumaineRetenue(reponse_id: Ulid, humaines: NotationsHumaines | undefined): NoteLue {
  if (humaines === undefined) {
    throw new EchantillonHumainIncoherent(reponse_id, "aucune notation humaine de l'échantillon.");
  }
  const [premiere, seconde] = doubleNotation(reponse_id, humaines.echantillon);
  const notePremiere = lireNote(premiere);
  if (memeNote(notePremiere, lireNote(seconde))) {
    if (humaines.arbitrages.length > 0) {
      throw new EchantillonHumainIncoherent(reponse_id, "arbitrage d'un troisième humain alors que les deux s'accordent.");
    }
    return notePremiere;
  }
  return lireNote(arbitrage(reponse_id, humaines.arbitrages, [premiere, seconde]));
}

function doubleNotation(reponse_id: Ulid, echantillon: readonly Notation[]): readonly [Notation, Notation] {
  const [premiere, seconde] = echantillon;
  if (echantillon.length !== 2 || premiere === undefined || seconde === undefined) {
    throw new EchantillonHumainIncoherent(reponse_id, `${echantillon.length} notation(s) humaine(s) au lieu de deux.`);
  }
  if (premiere.notateur.id === seconde.notateur.id) {
    throw new EchantillonHumainIncoherent(reponse_id, `deux notations du même annotateur ${premiere.notateur.id}.`);
  }
  return [premiere, seconde];
}

function arbitrage(reponse_id: Ulid, arbitrages: readonly Notation[], notees: readonly Notation[]): Notation {
  const [arbitre] = arbitrages;
  if (arbitre === undefined) throw new DivergenceSansArbitrage(reponse_id);
  if (arbitrages.length > 1) {
    throw new EchantillonHumainIncoherent(reponse_id, `${arbitrages.length} arbitrages au lieu d'un.`);
  }
  if (notees.some((n) => n.notateur.id === arbitre.notateur.id)) {
    throw new EchantillonHumainIncoherent(reponse_id, `l'arbitre ${arbitre.notateur.id} n'est pas un troisième humain.`);
  }
  return arbitre;
}

function lireNote(notation: Notation): NoteLue {
  return {
    categorie: notation.categorie,
    drapeaux: notation.drapeaux,
    obsolescence_fraiche: notation.obsolescence_fraiche === undefined ? null : notation.obsolescence_fraiche,
    sourcage: sourcageDeNotation(notation),
  };
}

function memeNote(a: NoteLue, b: NoteLue): boolean {
  return (
    a.categorie === b.categorie &&
    memesDrapeaux(a.drapeaux, b.drapeaux) &&
    a.obsolescence_fraiche === b.obsolescence_fraiche &&
    memeSourcage(a.sourcage, b.sourcage)
  );
}

function memesDrapeaux(a: readonly Drapeau[], b: readonly Drapeau[]): boolean {
  return a.length === b.length && a.every((drapeau) => b.includes(drapeau));
}

function memeSourcage(a: SourcageRetenu, b: SourcageRetenu): boolean {
  return (
    a.cite === b.cite &&
    a.au_moins_un_lien_existant === b.au_moins_un_lien_existant &&
    a.au_moins_un_lien_soutenant === b.au_moins_un_lien_soutenant
  );
}

/**
 * Une contestation postérieure existe et une unité porte sur une question d'attribution sans item
 * principal (§5, protocole 0.9). Le recalcul (b) exclut « les items contestés » ; le protocole ne
 * dit pas si une Q-ATT dont un seul des items `attendu_dans_liste` est contesté en sort. Refus
 * plutôt que règle inventée (question ouverte, rapport du 2026-09-25).
 */
export class QuestionSansItemPrincipal extends Error {
  readonly reponse_id: Ulid;

  constructor(reponse_id: Ulid, question_id: string) {
    super(
      `Recalcul (b) : la réponse ${reponse_id} porte sur la question ${question_id}, sans item principal ; ` +
        `le protocole ne dit pas quand une question d'attribution sort du recalcul pour un item contesté.`,
    );
    this.name = "QuestionSansItemPrincipal";
    this.reponse_id = reponse_id;
  }
}

/** §8(b) : `run.contestations_posterieures[]`, contestations reçues APRÈS le gel du run. */
export function exclureItemsContestes(unites: readonly UniteAnalyse[], run: Run): UniteAnalyse[] {
  const contestations = run.contestations_posterieures;
  if (contestations === undefined || contestations.length === 0) return [...unites];
  const sansPrincipal = unites.find((u) => u.item_principal_id === null);
  if (sansPrincipal !== undefined) throw new QuestionSansItemPrincipal(sansPrincipal.reponse_id, sansPrincipal.question_id);
  const contestes = new Set<Ulid | null>(contestations.map((c) => c.item_id));
  return unites.filter((u) => !contestes.has(u.item_principal_id));
}

/** §8(c) : les formulations orientées du §5. */
export function exclureFormulationsOrientees(unites: readonly UniteAnalyse[]): UniteAnalyse[] {
  return unites.filter((u) => u.registre !== "oriente");
}

/** §8(d) : les réponses tronquées, lues sur `UniteAnalyse.tronquee` (`normalise.troncature`, §6). */
export function exclureReponsesTronquees(unites: readonly UniteAnalyse[]): UniteAnalyse[] {
  return unites.filter((u) => !u.tronquee);
}

export function evaluerRobustesse(
  unitesA: readonly UniteAnalyse[],
  unitesB: readonly UniteAnalyse[],
  sources: SourcesRobustesse,
  statistique: Statistique,
  options: OptionsBootstrap,
): ResultatRobustesse {
  const principal = differenceAppariee(unitesA, unitesB, statistique, options);
  const recalculs = restrictions(sources).map(({ recalcul, restreindre }) => ({
    recalcul,
    difference: differenceAppariee(restreindre(unitesA), restreindre(unitesB), statistique, options),
  }));
  const motifs = motifsDeFragilite(principal, recalculs);
  return { principal, recalculs, fragile: motifs.length > 0, motifs_fragilite: motifs };
}

interface Restriction {
  readonly recalcul: Recalcul;
  readonly restreindre: (unites: readonly UniteAnalyse[]) => UniteAnalyse[];
}

/** Ordre figé : (a), (b), (c), (d) du §8, dans cet ordre, pour que le rapport soit comparable d'un run à l'autre. */
function restrictions(sources: SourcesRobustesse): readonly Restriction[] {
  return [
    { recalcul: "echantillon_humain", restreindre: (unites) => recalculEchantillonHumain(unites, sources.notations) },
    { recalcul: "items_contestes", restreindre: (unites) => exclureItemsContestes(unites, sources.run) },
    { recalcul: "formulations_orientees", restreindre: exclureFormulationsOrientees },
    { recalcul: "reponses_tronquees", restreindre: exclureReponsesTronquees },
  ];
}

function motifsDeFragilite(
  principal: DifferenceTaux,
  recalculs: readonly RecalculRobustesse[],
): Recalcul[] {
  if (principal.qualificatif !== "etablie") return [];
  return recalculs
    .filter((r) => r.difference.qualificatif !== "etablie")
    .map((r) => r.recalcul);
}
