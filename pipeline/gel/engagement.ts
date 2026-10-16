/**
 * L'engagement archivé du gel (décision D46, 2026-10-16). Le tour drand est fixé par `date_gel` et
 * devient public dès `date_gel` passée : sans engagement, un auteur qui gèlerait plus tard pourrait
 * lire l'aléa, rejouer le tirage, puis modifier `data/` avant de geler. Avant `date_gel`, l'auteur
 * pousse donc le commit à geler et fait capturer par la Wayback Machine sa page GitHub,
 * `https://github.com/AzurNow/DEMOCRACIE_2027/commit/<sha>`. Au gel :
 *
 * 1. l'URL de capture doit être exactement `https://web.archive.org/web/<14 chiffres>/<page du
 *    commit HEAD complet>` (`lireEngagement`) ;
 * 2. l'horodatage de capture, 14 chiffres en UTC, doit être une date réelle et **strictement
 *    antérieur** à `date_gel` ;
 * 3. la Wayback Machine doit servir cette capture : un appel, par le port, à l'API de disponibilité
 *    `https://archive.org/wayback/available?url=<page>&timestamp=<horodatage>`, dont la capture la
 *    plus proche doit porter **exactement** cet horodatage, le statut `"200"` et
 *    `available: true`, sur la page de ce commit.
 *
 * Pourquoi l'API de disponibilité plutôt qu'un GET de l'URL de capture : une capture absente à
 * l'horodatage demandé est servie quand même, par redirection vers la capture voisine
 * (`pipeline/liens/instantanes.py`, D22) ; un 200 au bout des redirections ne prouverait donc pas
 * que la capture nommée existe. L'API rend l'horodatage de la capture la plus proche, que l'on
 * compare à l'égal ; c'est l'appel et le statut retenu (`"200"`, D21) déjà employés par le test des
 * liens. Tout écart est un refus nommé (`EngagementRefuse`), avant toute lecture de la balise.
 */

import { ErreurSchema, validerFragment } from "../../outils/schemas/valider.ts";
import { jsonDesOctets, messageDErreur } from "./reseau.ts";
import type { LireHttp, ReponseHttp } from "./reseau.ts";

/** D46 : le dépôt public dont la page de commit est capturée. */
export const DEPOT_PUBLIC = "https://github.com/AzurNow/DEMOCRACIE_2027";

const DISPONIBILITE = "https://archive.org/wayback/available";

function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const MOTIF_CAPTURE = new RegExp(
  `^https://web\\.archive\\.org/web/([0-9]{14})/(${echapper(DEPOT_PUBLIC)}/commit/([0-9a-f]{40}))$`,
);
const MOTIF_HORODATAGE = /^([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})$/;

export type MotifEngagement =
  | "absent"
  | "forme"
  | "autre_commit"
  | "horodatage_invalide"
  | "tardif"
  | "injoignable"
  | "statut_http"
  | "illisible"
  | "non_servie";

export class EngagementRefuse extends Error {
  readonly motif: MotifEngagement;

  constructor(motif: MotifEngagement, detail: string) {
    super(`Engagement archivé refusé (${motif}, décision D46) : ${detail} Rien n'est écrit.`);
    this.name = "EngagementRefuse";
    this.motif = motif;
  }
}

export interface Engagement {
  /** L'URL de capture, telle que donnée. */
  readonly url: string;
  /** Les 14 chiffres de la capture, UTC. */
  readonly horodatage: string;
  /** La page capturée : celle du commit gelé. */
  readonly page: string;
}

/** L'instant d'un horodatage Wayback (14 chiffres, UTC), en millisecondes ; une date impossible est refusée. */
export function instantDeCapture(horodatage: string): number {
  const parties = MOTIF_HORODATAGE.exec(horodatage);
  if (parties === null) throw new EngagementRefuse("horodatage_invalide", `« ${horodatage} » n'a pas 14 chiffres.`);
  const [annee, mois, jour, heure, minute, seconde] = parties.slice(1).map(Number) as [number, number, number, number, number, number];
  const instant = Date.UTC(annee, mois - 1, jour, heure, minute, seconde);
  const relu = new Date(instant).toISOString().replace(/[-:T]/g, "").slice(0, 14);
  if (relu !== horodatage) throw new EngagementRefuse("horodatage_invalide", `« ${horodatage} » n'est pas une date réelle (UTC).`);
  return instant;
}

/** Les contrôles sans réseau : présence, forme, commit, antériorité. */
export function lireEngagement(url: string | undefined, head: string, date_gel_ms: number): Engagement {
  if (url === undefined) {
    throw new EngagementRefuse("absent", "--engagement manque : l'URL de la capture Wayback du commit gelé, faite avant date_gel.");
  }
  const parties = MOTIF_CAPTURE.exec(url);
  if (parties === null) {
    throw new EngagementRefuse("forme", `« ${url} » n'est pas https://web.archive.org/web/<14 chiffres>/${DEPOT_PUBLIC}/commit/<sha complet>.`);
  }
  const [, horodatage, page, commit] = parties as unknown as [string, string, string, string];
  if (commit !== head) throw new EngagementRefuse("autre_commit", `la capture porte sur ${commit}, le commit gelé (HEAD) est ${head}.`);
  const instant = instantDeCapture(horodatage);
  if (instant >= date_gel_ms) {
    throw new EngagementRefuse(
      "tardif",
      `capture du ${new Date(instant).toISOString()}, qui n'est pas strictement antérieure à date_gel (${new Date(date_gel_ms).toISOString()}).`,
    );
  }
  return { url, horodatage, page };
}

/** L'unique URL interrogée : l'API de disponibilité, sur la page et l'horodatage exacts. */
export function urlDisponibilite(engagement: Engagement): string {
  return `${DISPONIBILITE}?${new URLSearchParams({ url: engagement.page, timestamp: engagement.horodatage }).toString()}`;
}

interface CaptureLue {
  readonly timestamp: string;
  readonly status: string;
  readonly available: boolean;
  readonly url: string;
}

interface Disponibilite {
  readonly archived_snapshots: { readonly closest?: CaptureLue };
}

function lireDisponibilite(reponse: ReponseHttp): Disponibilite {
  if (reponse.statut !== 200) throw new EngagementRefuse("statut_http", `${DISPONIBILITE} : réponse HTTP ${reponse.statut}.`);
  try {
    return validerFragment<Disponibilite>("run", "#/$defs/wayback_disponibilite", jsonDesOctets(reponse.octets), DISPONIBILITE);
  } catch (erreur) {
    if (!(erreur instanceof SyntaxError || erreur instanceof TypeError || erreur instanceof ErreurSchema)) throw erreur;
    throw new EngagementRefuse("illisible", `${DISPONIBILITE} : ${messageDErreur(erreur)}.`);
  }
}

function estLaCapture(capture: CaptureLue, engagement: Engagement): boolean {
  const servie = capture.status === "200" && capture.available;
  return servie && capture.timestamp === engagement.horodatage && capture.url.endsWith(engagement.page.slice("https://".length));
}

/** La réponse de l'API désigne la capture nommée, servie (statut 200). */
export function exigerCaptureServie(engagement: Engagement, reponse: ReponseHttp): void {
  const capture = lireDisponibilite(reponse).archived_snapshots.closest;
  if (capture === undefined) throw new EngagementRefuse("non_servie", `aucune capture de ${engagement.page} n'est servie.`);
  if (!estLaCapture(capture, engagement)) {
    throw new EngagementRefuse(
      "non_servie",
      `capture la plus proche servie : ${capture.url} (horodatage ${capture.timestamp}, statut ${capture.status}, ` +
        `disponible ${String(capture.available)}) ; attendue : ${engagement.url}, statut 200.`,
    );
  }
}

/** Les contrôles sans réseau, puis un appel à la Wayback Machine. */
export async function verifierEngagement(url: string | undefined, head: string, date_gel_ms: number, lire: LireHttp): Promise<Engagement> {
  const engagement = lireEngagement(url, head, date_gel_ms);
  let reponse: ReponseHttp;
  try {
    reponse = await lire(urlDisponibilite(engagement));
  } catch (erreur) {
    throw new EngagementRefuse("injoignable", `${DISPONIBILITE} : ${messageDErreur(erreur)}.`);
  }
  exigerCaptureServie(engagement, reponse);
  return engagement;
}

/** `run.json#/engagement`. */
export function engagementDuRun(engagement: Engagement): { readonly url: string; readonly horodatage: string } {
  return { url: engagement.url, horodatage: engagement.horodatage };
}
