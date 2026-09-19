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
import { decouperAuxOffsets } from "../domaine/decoupage.ts";
import { analyserVtt, horodatageDebut } from "../domaine/webvtt.ts";
import type { SourceAffichee, VueItem } from "./types.ts";

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

  const depart = calculerDepart(source);
  if (depart !== null) {
    lecteur.addEventListener("loadedmetadata", () => {
      lecteur.currentTime = depart;
    });
  }
  return lecteur;
}

/**
 * Horodatage de départ du lecteur, dérivé de la transcription et de l'offset de la citation.
 *
 * Un désaccord entre les deux (offset que la transcription ne couvre pas) ne doit pas priver
 * l'annotateur du surlignage — qui reste correct, lui, puisqu'il vient directement du texte
 * canonique déjà servi — pour la seule perte d'un positionnement automatique du lecteur. Ce cas
 * ne devrait jamais survenir tant que `.vtt` et texte canonique restent synchronisés ; s'il
 * survient, l'anomalie est journalisée en console plutôt qu'ignorée en silence.
 */
function calculerDepart(source: SourceAffichee): number | null {
  if (source.transcription === null || source.offsets === null) return null;
  try {
    return horodatageDebut(analyserVtt(source.transcription), source.offsets.debut);
  } catch (erreur) {
    console.error("Positionnement du lecteur impossible :", erreur);
    return null;
  }
}

function rendreTexte(source: SourceAffichee): HTMLElement {
  const zone = document.createElement("div");
  zone.className = "texte-source";

  if (source.texte === null) {
    zone.append(avertissement(source.texte_absent_motif ?? "Texte canonique indisponible."));
    return zone;
  }

  const decoupage = decouperAuxOffsets(source.texte, source.offsets);
  if (decoupage.surlignage === "absent") {
    zone.textContent = decoupage.texte;
    zone.prepend(
      avertissement(
        "Aucun offset n'accompagne cette citation : le texte est affiché sans surlignage. " +
          "La citation est à retrouver à l'œil, et le fait est signalé plutôt que masqué.",
      ),
    );
    return zone;
  }

  zone.append(
    document.createTextNode(decoupage.avant),
    marque(decoupage.citation),
    document.createTextNode(decoupage.apres),
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
