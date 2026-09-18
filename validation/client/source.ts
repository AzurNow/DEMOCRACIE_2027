/**
 * Le volet de gauche : la source telle qu'archivée, et la citation surlignée à sa position.
 *
 * Deux zones superposées, les mêmes pour les trois types de source :
 *
 * - en haut, le document natif — un PDF ouvert à la bonne page par le visionneur du
 *   navigateur, une page web archivée dans un cadre isolé, ou un lecteur audio/vidéo placé sur
 *   l'extrait ;
 * - en bas, le **texte canonique** de cette même source, avec la citation surlignée aux
 *   offsets exacts et amenée dans le champ de vision.
 *
 * C'est ce second volet qui tient la promesse « vérifier en regardant, pas en cherchant » pour
 * les trois types de source à la fois, y compris le PDF, dont le visionneur natif ne sait pas
 * surligner. Il évite ainsi d'embarquer un moteur de rendu PDF complet — une dépendance de
 * plusieurs mégaoctets dans un projet dont la crédibilité tient à sa surface d'audit.
 */

import { urlSource } from "./api.ts";
import type { SourceAffichee, VueItem } from "./types.ts";

export interface Cue {
  readonly debut: number;
  readonly fin: number;
  readonly texte: string;
  /** Offset du premier caractère de ce cue dans le texte canonique dérivé. */
  readonly offset: number;
}

export function rendreSource(vue: VueItem, source: SourceAffichee): HTMLElement {
  const conteneur = document.createElement("div");
  conteneur.className = "volet volet-source";
  conteneur.append(rendreDocument(vue, source), rendreTexte(source));
  return conteneur;
}

function rendreDocument(vue: VueItem, source: SourceAffichee): HTMLElement {
  const adresse = urlSource(vue.lot_id, vue.item.id, source.cle);
  if (source.type_affichage === "media") return rendreMedia(adresse, source);

  const cadre = document.createElement("iframe");
  cadre.className = "cadre-source";
  cadre.setAttribute("sandbox", "");
  cadre.title = source.libelle;
  cadre.src = adresse + fragmentPdf(vue, source);
  return cadre;
}

/** Le visionneur PDF du navigateur comprend `#page=` : c'est ce qui ouvre le bon feuillet. */
function fragmentPdf(vue: VueItem, source: SourceAffichee): string {
  if (source.type_affichage !== "pdf") return "";
  const page = pageDe(vue, source);
  return page === null ? "" : `#page=${page}`;
}

function pageDe(vue: VueItem, source: SourceAffichee): number | null {
  const etat = etatDe(vue, source);
  return etat?.source.page ?? vue.item.absence?.source_couverture_theme.page ?? null;
}

function rendreMedia(adresse: string, source: SourceAffichee): HTMLElement {
  const lecteur = document.createElement("video");
  lecteur.className = "cadre-source";
  lecteur.controls = true;
  lecteur.preload = "metadata";
  lecteur.src = adresse;

  const cues = source.transcription === null ? [] : parserVtt(source.transcription);
  const depart = secondesPourOffset(cues, source.offsets?.debut ?? null);
  if (depart !== null) {
    lecteur.addEventListener("loadedmetadata", () => {
      lecteur.currentTime = depart;
    });
  }
  return lecteur;
}

function rendreTexte(source: SourceAffichee): HTMLElement {
  const zone = document.createElement("div");
  zone.className = "texte-source";

  if (source.texte === null) {
    zone.append(avertissement(source.texte_absent_motif ?? "Texte canonique indisponible."));
    return zone;
  }

  const caracteres = [...source.texte];
  const offsets = source.offsets;
  if (offsets === null) {
    zone.textContent = source.texte;
    zone.prepend(
      avertissement(
        "Aucun offset n'accompagne cette citation : le texte est affiché sans surlignage. " +
          "La citation est à retrouver à l'œil, et le fait est signalé plutôt que masqué.",
      ),
    );
    return zone;
  }

  zone.append(
    document.createTextNode(caracteres.slice(0, offsets.debut).join("")),
    marque(caracteres.slice(offsets.debut, offsets.fin).join("")),
    document.createTextNode(caracteres.slice(offsets.fin).join("")),
  );
  return zone;
}

function marque(texte: string): HTMLElement {
  const balise = document.createElement("mark");
  balise.id = "citation-surlignee";
  balise.textContent = texte;
  return balise;
}

function avertissement(message: string): HTMLElement {
  const bloc = document.createElement("p");
  bloc.className = "alerte";
  bloc.textContent = message;
  return bloc;
}

function etatDe(vue: VueItem, source: SourceAffichee) {
  if (source.cle === "assertion") return vue.item.assertion;
  if (source.cle === "anterieur") return vue.item.obsolescence?.etat_anterieur ?? null;
  if (source.cle === "posterieur") return vue.item.obsolescence?.etat_posterieur ?? null;
  return null;
}

/* ----------------------------------------------------------------- WebVTT */

/**
 * Analyse d'un WebVTT, avec l'offset de chaque cue dans le texte canonique dérivé — les textes
 * des cues joints par un saut de ligne, exactement comme le fixe `docs/CONTRATS.md` §2. C'est
 * cette correspondance qui permet de placer le lecteur sur la citation sans que l'item ait à
 * stocker un horodatage par citation.
 */
export function parserVtt(contenu: string): readonly Cue[] {
  const cues: Cue[] = [];
  let offset = 0;
  for (const bloc of contenu.replace(/\r\n/g, "\n").split("\n\n")) {
    const lignes = bloc.split("\n").filter((ligne) => ligne.trim().length > 0);
    const indexTemps = lignes.findIndex((ligne) => ligne.includes("-->"));
    if (indexTemps < 0) continue;
    const bornes = (lignes[indexTemps] as string).split("-->");
    const texte = lignes.slice(indexTemps + 1).join("\n");
    cues.push({
      debut: secondes(bornes[0] as string),
      fin: secondes(bornes[1] as string),
      texte,
      offset,
    });
    offset += [...texte].length + 1; // +1 pour le saut de ligne de jonction
  }
  return cues;
}

export function secondes(horodatage: string): number {
  const parties = horodatage.trim().split(":").map(Number);
  if (parties.length === 3) {
    return (parties[0] as number) * 3600 + (parties[1] as number) * 60 + (parties[2] as number);
  }
  if (parties.length === 2) return (parties[0] as number) * 60 + (parties[1] as number);
  return parties[0] ?? 0;
}

export function secondesPourOffset(cues: readonly Cue[], offset: number | null): number | null {
  if (offset === null) return null;
  for (let index = cues.length - 1; index >= 0; index -= 1) {
    const cue = cues[index] as Cue;
    if (offset >= cue.offset) return cue.debut;
  }
  return null;
}
