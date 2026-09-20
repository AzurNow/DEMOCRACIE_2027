/**
 * Analyse d'un WebVTT et calcul de l'horodatage correspondant à un offset du texte canonique.
 *
 * Pur, sans DOM (décision du 2026-09-18, docs/DETTE.md). Extrait de
 * `validation/client/source.ts`.
 *
 * `docs/CONTRATS.md` §2 : le texte canonique d'une source audio ou vidéo n'est pas indépendant
 * du `.vtt`, il en est **dérivé** — la jonction des textes de cue, dans l'ordre, par un saut de
 * ligne. C'est cette dérivation, reproduite ici, qui permet à un offset du texte canonique de
 * retomber sur un cue et donc sur un horodatage, sans qu'aucun item n'ait à stocker
 * d'horodatage par citation.
 *
 * Portée volontairement limitée : les cues, leurs horodatages et leur texte. Les blocs `NOTE`,
 * `STYLE` et `REGION` du format WebVTT sont des métadonnées de style ou de position, ignorées
 * sans faire dériver les offsets des cues qui suivent — ils ne contribuent aucun texte au
 * document dérivé, donc aucun offset ne leur est réservé.
 */

import { longueurPointsDeCode } from "./normalisation.ts";

export class ErreurVtt extends Error {}

export interface Cue {
  readonly debut: number;
  readonly fin: number;
  readonly texte: string;
  /** Offset, en points de code, du premier caractère de ce cue dans le texte canonique dérivé. */
  readonly offset: number;
}

export interface DocumentVtt {
  readonly cues: readonly Cue[];
  /** Jonction des textes de cue par un saut de ligne — le texte canonique dérivé, §2. */
  readonly texte: string;
}

const BLOCS_IGNORES = ["NOTE", "STYLE", "REGION"];

export function analyserVtt(contenu: string): DocumentVtt {
  const blocs = contenu.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  verifierEntete(blocs[0]);
  const cues = analyserCues(blocs.slice(1));
  return { cues, texte: cues.map((cue) => cue.texte).join("\n") };
}

function verifierEntete(premierBloc: string | undefined): void {
  if (premierBloc === undefined || !premierBloc.trimStart().startsWith("WEBVTT")) {
    throw new ErreurVtt("Fichier WebVTT sans en-tête WEBVTT.");
  }
}

function analyserCues(blocs: readonly string[]): Cue[] {
  const cues: Cue[] = [];
  let offset = 0;
  blocs.forEach((bloc, index) => {
    if (bloc.length === 0 || estBlocIgnorable(bloc)) return;
    const cue = analyserBloc(bloc, index);
    cues.push({ ...cue, offset });
    offset += longueurPointsDeCode(cue.texte) + 1; // +1 pour le saut de ligne de jonction
  });
  return cues;
}

function estBlocIgnorable(bloc: string): boolean {
  const premiereLigne = (bloc.split("\n")[0] ?? "").trim();
  return BLOCS_IGNORES.some((motCle) => premiereLigne.startsWith(motCle));
}

function analyserBloc(bloc: string, index: number): Omit<Cue, "offset"> {
  const lignes = bloc.split("\n");
  const indexFleche = lignes.findIndex((ligne) => ligne.includes("-->"));
  if (indexFleche < 0) {
    throw new ErreurVtt(`Bloc sans flèche d'horodatage (bloc n°${index + 1} : "${lignes[0]}").`);
  }
  const bornes = (lignes[indexFleche] as string).split("-->");
  const texte = lignes
    .slice(indexFleche + 1)
    .join("\n")
    .normalize("NFC");
  return {
    debut: secondesDeHorodatage(bornes[0] as string),
    fin: secondesDeHorodatage(sansReglagesDeCue(bornes[1] as string)),
    texte,
  };
}

/**
 * La borne de fin peut être suivie de réglages de cue (`align:start`, `position:50%`), légaux en
 * WebVTT et sans effet sur le minutage. On les écarte ici plutôt que de les laisser atteindre
 * l'analyse de l'horodatage, qui refuse tout ce qui n'est pas un horodatage nu.
 */
function sansReglagesDeCue(borne: string): string {
  const premier = borne.trim().split(/\s+/)[0];
  if (premier === undefined || premier.length === 0) {
    throw new ErreurVtt(`Borne de fin absente après la flèche : "${borne}".`);
  }
  return premier;
}

/**
 * Horodatage `MM:SS.mmm` ou `HH:MM:SS.mmm` converti en secondes.
 *
 * Toute autre forme lève : un horodatage illisible positionnerait le lecteur ailleurs que sur la
 * citation, et l'annotateur vérifierait alors une autre portion de l'enregistrement sans rien
 * remarquer. Un nombre de secondes faux est plus coûteux qu'un écran qui refuse de se peindre.
 */
export function secondesDeHorodatage(horodatage: string): number {
  const parties = horodatage.trim().split(":").map(Number);
  if (parties.some((partie) => !Number.isFinite(partie))) {
    throw new ErreurVtt(`Horodatage illisible : "${horodatage.trim()}".`);
  }
  if (parties.length === 3) {
    return (parties[0] as number) * 3600 + (parties[1] as number) * 60 + (parties[2] as number);
  }
  if (parties.length === 2) return (parties[0] as number) * 60 + (parties[1] as number);
  throw new ErreurVtt(
    `Horodatage à ${parties.length} champ(s), attendu MM:SS.mmm ou HH:MM:SS.mmm : "${horodatage.trim()}".`,
  );
}

/**
 * Horodatage de début du cue qui couvre l'offset donné, en points de code du texte canonique
 * dérivé. Un offset qui ne tombe dans aucun cue — négatif, ou au-delà de la fin du texte dérivé
 * — lève une `ErreurVtt` nommée : ce n'est jamais une valeur plausible inventée, c'est un
 * désaccord entre la transcription et l'offset qu'on lui demande de situer.
 */
export function horodatageDebut(document: DocumentVtt, offset: number): number {
  const longueur = longueurPointsDeCode(document.texte);
  if (offset < 0 || offset >= longueur) {
    throw new ErreurVtt(
      `Offset hors bornes du texte canonique dérivé : ${offset} pour une longueur de ${longueur}.`,
    );
  }
  for (let index = document.cues.length - 1; index >= 0; index -= 1) {
    const cue = document.cues[index] as Cue;
    if (offset >= cue.offset) return cue.debut;
  }
  throw new ErreurVtt(`Aucun cue ne couvre l'offset ${offset}.`);
}
