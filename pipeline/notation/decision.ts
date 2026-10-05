/**
 * Règle de décision du §7 : des notations individuelles d'une réponse au verdict retenu.
 *
 * Entrées : le run (ses juges, dont les retirés), toutes les notations du run qui portent sur
 * l'objet, son appartenance à l'échantillon humain, et les textes contre lesquels l'extrait de
 * chaque juge est contrôlé. Sortie : un verdict conforme à `schema/verdict.schema.json`, ou l'état
 * explicite « en attente » avec ses motifs. Cet état n'est jamais un verdict par défaut.
 *
 * Les règles, dans l'ordre où elles s'appliquent :
 *
 * 1. **Juge retiré** (§7 ; D13 du 2026-10-03). Ses notations sont écartées partout : elles ne
 *    comptent ni dans l'accord, ni dans le désaccord, ni dans les drapeaux graves, et ne figurent
 *    jamais dans `notations_sources`.
 * 2. **Juge indéterminé.** Un juge ne rend jamais `indeterminee` (§7) : une telle notation lève
 *    `JugeIndetermine`, même d'un juge retiré. Elle n'est pas avalée.
 * 3. **Extrait.** Un extrait qui échoue au test verbatim (`extrait.ts`) invalide la notation du
 *    juge : elle ne compte pas, et un humain est requis.
 * 4. **Échantillon humain.** La note humaine prévaut : celle des deux humains s'ils s'accordent,
 *    sinon celle du troisième (`echantillon_humain_10`, nom du schéma conservé à 25 %).
 * 5. **Hors échantillon.** Désaccord, extrait invalide ou drapeau grave posé par un juge non retiré
 *    : un humain tranche (`tranche_humain`, ou `revue_erreur_grave` dès qu'un drapeau grave est posé
 *    par un juge non retiré ou par cet humain). Sinon, accord des deux juges (`accord_juges`), ou
 *    juge restant seul après un retrait (`juge_unique_apres_retrait`).
 *
 * « S'accorder » est `analysis/note-lue.ts:notationsConcordent` (D14 (3)), seule égalité du dépôt.
 *
 * **Note commune.** Deux notations qui s'accordent peuvent encore différer sur des champs que les
 * métriques primaires ne lisent pas, mais que le verdict porte : `motif_inexactitude`, `cite`,
 * `au_moins_un_lien_existant`. Le §7 ne dit pas lequel retenir. Plutôt que d'inventer une règle de
 * fusion, la réponse attend un humain (`accord_sans_note_commune`) : voir `note-retenue.ts:noteCommune`.
 *
 * Toute incohérence des entrées (notation d'un autre run ou d'un autre objet, juge inconnu, deux
 * notations d'un même juge, humain sous un motif que la situation n'appelle pas…) lève
 * `NotationsIncoherentes` : une donnée qui ne colle pas n'est jamais ignorée en silence.
 */

import { notationsConcordent } from "../../analysis/note-lue.ts";
import type { Instant, MotifNotation, ObjetNote, Ulid } from "../../analysis/types.ts";
import { comparerChaines } from "./echantillons.ts";
import { controlerExtrait, type TextesDeVerification } from "./extrait.ts";
import { construireVerdict, noteCommune, noteDe, porteDrapeauGrave, type Resolution } from "./note-retenue.ts";
import type { NotationIndividuelle, RunDeNotation, VerdictProduit } from "./types.ts";

export interface EntreeDecision {
  readonly run: RunDeNotation;
  readonly objet_note: ObjetNote;
  /** Toutes les notations du run portant sur l'objet, juges retirés compris. */
  readonly notations: readonly NotationIndividuelle[];
  readonly dans_echantillon_humain: boolean;
  readonly textes: TextesDeVerification;
  /** Fournis par l'appelant : le noyau n'engendre ni identifiant ni date. */
  readonly verdict_id: Ulid;
  readonly date: Instant;
}

export const MOTIFS_ATTENTE = [
  "notation_juge_manquante",
  "desaccord_juges",
  "extrait_invalide",
  "drapeau_grave",
  "double_notation_humaine_incomplete",
  "arbitrage_echantillon_manquant",
  "accord_sans_note_commune",
] as const;
export type MotifAttente = (typeof MOTIFS_ATTENTE)[number];

export type Decision =
  | { readonly statut: "verdict"; readonly verdict: VerdictProduit }
  | { readonly statut: "en_attente"; readonly attend: "humain" | "juge"; readonly motifs: readonly MotifAttente[] };

export class NotationsIncoherentes extends Error {
  readonly objet_id: Ulid;

  constructor(objet_id: Ulid, detail: string) {
    super(`Objet noté ${objet_id} : ${detail}`);
    this.name = "NotationsIncoherentes";
    this.objet_id = objet_id;
  }
}

/** §7 : « réservée aux humains, jamais attribuée par un juge automatique ». */
export class JugeIndetermine extends Error {
  readonly notation_id: Ulid;

  constructor(notation: NotationIndividuelle) {
    super(
      `Notation ${notation.id} : le juge ${notation.notateur.id} a rendu « indeterminee », que le §7 réserve aux humains. ` +
        `Elle est rejetée, pas comptée.`,
    );
    this.name = "JugeIndetermine";
    this.notation_id = notation.id;
  }
}

/** Les notations d'un objet, rangées par rôle. */
interface Tri {
  readonly juges: readonly NotationIndividuelle[];
  readonly echantillon: readonly NotationIndividuelle[];
  readonly arbitrages: readonly NotationIndividuelle[];
  /** Humains appelés hors échantillon : désaccord, extrait invalide, erreur grave. */
  readonly appeles: readonly NotationIndividuelle[];
}

/** Ce que disent les juges non retirés. */
interface BilanJuges {
  readonly manquants: readonly string[];
  /** Notations à extrait valide : les seules qui comptent. */
  readonly comptees: readonly NotationIndividuelle[];
  readonly invalides: readonly NotationIndividuelle[];
  readonly desaccord: boolean;
  readonly grave: boolean;
}

export function decider(entree: EntreeDecision): Decision {
  const juges = jugesDuRun(entree.run, entree.objet_note.id);
  const tri = trier(entree, juges);
  const bilan = bilanDesJuges(tri.juges, juges.actifs, entree.textes);
  return entree.dans_echantillon_humain ? deciderEchantillon(entree, tri, bilan) : deciderHorsEchantillon(entree, tri, bilan);
}

/** §7 : deux juges, dont au plus un retiré. Exporté pour le contrôle croisé. */
export function jugesDuRun(run: RunDeNotation, objet_id: Ulid): { readonly actifs: readonly string[]; readonly retires: ReadonlySet<string> } {
  const ids = run.juges.map((juge) => juge.juge_id);
  if (ids.length !== 2 || new Set(ids).size !== 2) {
    throw new NotationsIncoherentes(objet_id, `le run ${run.id} déclare ${ids.length} juge(s) distincts au lieu de deux (§7).`);
  }
  const actifs = run.juges.filter((juge) => !juge.retire).map((juge) => juge.juge_id);
  if (actifs.length === 0) throw new NotationsIncoherentes(objet_id, `les deux juges du run ${run.id} sont retirés : aucune note de juge ne reste.`);
  return { actifs, retires: new Set(run.juges.filter((juge) => juge.retire).map((juge) => juge.juge_id)) };
}

/* ------------------------------------------------------------------ tri des entrées */

function trier(entree: EntreeDecision, juges: { readonly actifs: readonly string[]; readonly retires: ReadonlySet<string> }): Tri {
  const tri: Record<keyof Tri, NotationIndividuelle[]> = { juges: [], echantillon: [], arbitrages: [], appeles: [] };
  for (const notation of entree.notations) {
    verifierAppartenance(notation, entree);
    if (notation.notateur.type === "juge") classerJuge(notation, juges, tri.juges, entree.objet_note.id);
    else casierHumain(notation, tri, entree.objet_note.id).push(notation);
  }
  verifierUnParNotateur(tri.juges, entree.objet_note.id);
  return tri;
}

function verifierAppartenance(notation: NotationIndividuelle, entree: EntreeDecision): void {
  const objet = entree.objet_note;
  const memeObjet = notation.objet_note.type === objet.type && notation.objet_note.id === objet.id;
  if (notation.run_id !== entree.run.id || !memeObjet || notation.contexte !== "run") {
    throw new NotationsIncoherentes(
      objet.id,
      `la notation ${notation.id} porte sur ${notation.objet_note.type} ${notation.objet_note.id}, run ${notation.run_id}, contexte ${notation.contexte}.`,
    );
  }
}

/** Range une notation de juge ; celle d'un juge retiré est écartée ici, une fois pour toutes (D13). */
function classerJuge(
  notation: NotationIndividuelle,
  juges: { readonly actifs: readonly string[]; readonly retires: ReadonlySet<string> },
  actives: NotationIndividuelle[],
  objet_id: Ulid,
): void {
  if (notation.categorie === "indeterminee") throw new JugeIndetermine(notation);
  if (notation.motif_notation !== "notation_juge") {
    throw new NotationsIncoherentes(objet_id, `la notation de juge ${notation.id} porte le motif ${String(notation.motif_notation)}.`);
  }
  if (juges.retires.has(notation.notateur.id)) return;
  if (!juges.actifs.includes(notation.notateur.id)) {
    throw new NotationsIncoherentes(objet_id, `le juge ${notation.notateur.id} n'est pas un juge du run.`);
  }
  actives.push(notation);
}

type Casier = "echantillon" | "arbitrages" | "appeles";

/** Le rôle d'une notation humaine selon son motif ; un motif absent de cette table est hors de la règle. */
const CASIER_DU_MOTIF: ReadonlyMap<MotifNotation, Casier> = new Map<MotifNotation, Casier>([
  ["echantillon_aleatoire_10", "echantillon"],
  ["arbitrage_echantillon_10", "arbitrages"],
  ["desaccord_juges", "appeles"],
  ["erreur_grave", "appeles"],
]);

function casierHumain(notation: NotationIndividuelle, tri: Record<Casier, NotationIndividuelle[]>, objet_id: Ulid): NotationIndividuelle[] {
  const casier = notation.motif_notation === undefined ? undefined : CASIER_DU_MOTIF.get(notation.motif_notation);
  if (casier === undefined) {
    throw new NotationsIncoherentes(
      objet_id,
      `la notation humaine ${notation.id} porte le motif ${String(notation.motif_notation)}, hors de la règle de décision du §7.`,
    );
  }
  return tri[casier];
}

function verifierUnParNotateur(notations: readonly NotationIndividuelle[], objet_id: Ulid): void {
  const vus = new Set<string>();
  for (const notation of notations) {
    if (vus.has(notation.notateur.id)) throw new NotationsIncoherentes(objet_id, `deux notations du notateur ${notation.notateur.id}.`);
    vus.add(notation.notateur.id);
  }
}

/* ------------------------------------------------------------------ juges */

function bilanDesJuges(
  notations: readonly NotationIndividuelle[],
  actifs: readonly string[],
  textes: TextesDeVerification,
): BilanJuges {
  const presents = new Set(notations.map((n) => n.notateur.id));
  const triees = [...notations].sort((a, b) => comparerChaines(a.notateur.id, b.notateur.id));
  const comptees = triees.filter((n) => controlerExtrait(n, textes).valide);
  const [premiere, seconde] = comptees;
  return {
    manquants: actifs.filter((id) => !presents.has(id)),
    comptees,
    invalides: triees.filter((n) => !comptees.includes(n)),
    desaccord: premiere !== undefined && seconde !== undefined && !notationsConcordent(premiere, seconde),
    grave: triees.some(porteDrapeauGrave),
  };
}

/* ------------------------------------------------------------------ hors échantillon */

function deciderHorsEchantillon(entree: EntreeDecision, tri: Tri, bilan: BilanJuges): Decision {
  if (tri.echantillon.length + tri.arbitrages.length > 0) {
    throw new NotationsIncoherentes(entree.objet_note.id, "notation humaine d'échantillon sur une réponse hors de l'échantillon.");
  }
  if (bilan.manquants.length > 0) return enAttente("juge", ["notation_juge_manquante"]);
  const motifs = motifsHumainRequis(bilan);
  if (motifs.length > 0) return trancherParHumain(entree, tri.appeles, bilan, motifs);
  if (tri.appeles.length > 0) {
    throw new NotationsIncoherentes(entree.objet_note.id, "humain appelé alors que ni désaccord, ni extrait invalide, ni drapeau grave ne l'exige.");
  }
  const [premiere, seconde] = bilan.comptees;
  if (premiere === undefined) throw new NotationsIncoherentes(entree.objet_note.id, "aucune notation de juge ne compte, sans motif d'humain.");
  return seconde === undefined ? jugeUnique(entree, premiere) : accordDesJuges(entree, premiere, seconde);
}

function motifsHumainRequis(bilan: BilanJuges): MotifAttente[] {
  const motifs: MotifAttente[] = [];
  if (bilan.desaccord) motifs.push("desaccord_juges");
  if (bilan.invalides.length > 0) motifs.push("extrait_invalide");
  if (bilan.grave) motifs.push("drapeau_grave");
  return motifs;
}

function trancherParHumain(
  entree: EntreeDecision,
  appeles: readonly NotationIndividuelle[],
  bilan: BilanJuges,
  motifs: readonly MotifAttente[],
): Decision {
  const [humain, ...autres] = appeles;
  if (humain === undefined) return enAttente("humain", motifs);
  if (autres.length > 0) {
    throw new NotationsIncoherentes(entree.objet_note.id, `${appeles.length} humains appelés : le §7 en fait trancher un.`);
  }
  const grave = bilan.grave || porteDrapeauGrave(humain);
  return verdict(entree, {
    note: noteDe(humain),
    mode: grave ? "revue_erreur_grave" : "tranche_humain",
    sources: [...bilan.comptees, humain],
    humains: [humain],
    desaccord: bilan.desaccord,
  });
}

function accordDesJuges(entree: EntreeDecision, premiere: NotationIndividuelle, seconde: NotationIndividuelle): Decision {
  const note = noteCommune(premiere, seconde);
  if (note === null) return enAttente("humain", ["accord_sans_note_commune"]);
  return verdict(entree, { note, mode: "accord_juges", sources: [premiere, seconde], humains: [], desaccord: false });
}

/** D13 : hors échantillon, le juge restant seul donne la note. */
function jugeUnique(entree: EntreeDecision, restant: NotationIndividuelle): Decision {
  return verdict(entree, { note: noteDe(restant), mode: "juge_unique_apres_retrait", sources: [restant], humains: [], desaccord: false });
}

/* ------------------------------------------------------------------ échantillon */

function deciderEchantillon(entree: EntreeDecision, tri: Tri, bilan: BilanJuges): Decision {
  if (tri.appeles.length > 0) {
    throw new NotationsIncoherentes(entree.objet_note.id, "humain appelé hors échantillon sur une réponse de l'échantillon.");
  }
  if (bilan.manquants.length > 0) return enAttente("juge", ["notation_juge_manquante"]);
  const double = doubleNotation(tri.echantillon, entree.objet_note.id);
  if (double === null) return enAttente("humain", ["double_notation_humaine_incomplete"]);
  const [premiere, seconde] = double;
  if (notationsConcordent(premiere, seconde)) return accordDesHumains(entree, tri, bilan, double);
  const arbitre = arbitreDe(tri.arbitrages, double, entree.objet_note.id);
  if (arbitre === null) return enAttente("humain", ["arbitrage_echantillon_manquant"]);
  return verdict(entree, {
    note: noteDe(arbitre),
    mode: "echantillon_humain_10",
    sources: [...bilan.comptees, premiere, seconde, arbitre],
    humains: [premiere, seconde, arbitre],
    desaccord: bilan.desaccord,
  });
}

function accordDesHumains(
  entree: EntreeDecision,
  tri: Tri,
  bilan: BilanJuges,
  [premiere, seconde]: readonly [NotationIndividuelle, NotationIndividuelle],
): Decision {
  if (tri.arbitrages.length > 0) {
    throw new NotationsIncoherentes(entree.objet_note.id, "arbitrage d'un troisième humain alors que les deux s'accordent.");
  }
  const note = noteCommune(premiere, seconde);
  if (note === null) return enAttente("humain", ["accord_sans_note_commune"]);
  return verdict(entree, {
    note,
    mode: "echantillon_humain_10",
    sources: [...bilan.comptees, premiere, seconde],
    humains: [premiere, seconde],
    desaccord: bilan.desaccord,
  });
}

function doubleNotation(
  echantillon: readonly NotationIndividuelle[],
  objet_id: Ulid,
): readonly [NotationIndividuelle, NotationIndividuelle] | null {
  if (echantillon.length > 2) throw new NotationsIncoherentes(objet_id, `${echantillon.length} notations d'échantillon au lieu de deux.`);
  const [premiere, seconde] = echantillon;
  if (premiere === undefined || seconde === undefined) return null;
  if (premiere.notateur.id === seconde.notateur.id) {
    throw new NotationsIncoherentes(objet_id, `deux notations d'échantillon du même annotateur ${premiere.notateur.id}.`);
  }
  return [premiere, seconde];
}

function arbitreDe(
  arbitrages: readonly NotationIndividuelle[],
  double: readonly NotationIndividuelle[],
  objet_id: Ulid,
): NotationIndividuelle | null {
  const [arbitre, ...autres] = arbitrages;
  if (arbitre === undefined) return null;
  if (autres.length > 0) throw new NotationsIncoherentes(objet_id, `${arbitrages.length} arbitrages au lieu d'un.`);
  if (double.some((n) => n.notateur.id === arbitre.notateur.id)) {
    throw new NotationsIncoherentes(objet_id, `l'arbitre ${arbitre.notateur.id} n'est pas un troisième humain.`);
  }
  return arbitre;
}

function verdict(entree: EntreeDecision, resolution: Resolution): Decision {
  const cadre = {
    verdict_id: entree.verdict_id,
    run_id: entree.run.id,
    objet_note: entree.objet_note,
    dans_echantillon_humain: entree.dans_echantillon_humain,
    date: entree.date,
  };
  return { statut: "verdict", verdict: construireVerdict(cadre, resolution) };
}

function enAttente(attend: "humain" | "juge", motifs: readonly MotifAttente[]): Decision {
  return { statut: "en_attente", attend, motifs };
}
