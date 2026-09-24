"""WebVTT d'une transcription (`docs/CONTRATS.md` §2) : écriture, analyse, texte dérivé, offset → cue.

Écriture. Chaque segment rendu par le modèle devient un cue `HH:MM:SS.mmm --> HH:MM:SS.mmm`, sans
identifiant ni réglage. Son texte perd ses espaces de début et de fin (Whisper préfixe chaque
segment d'une espace, artefact de sa tokenisation) et rien d'autre. Un segment dont le texte est
alors vide est exclu et compté, jamais écrit en cue vide. Un texte qui casserait le format (saut de
ligne, `-->`) ou qui y serait lu comme une balise ou une entité (`<`, `&`) est refusé : l'échapper
donnerait un texte dérivé différent de ce que le modèle a rendu. Segments hors d'ordre ou
chevauchants : refusés.

Analyse et dérivation. Reproduisent `validation/domaine/webvtt.ts`, qui relit les mêmes fichiers
dans l'interface de validation : blocs séparés par une ligne vide, en-tête `WEBVTT` (métadonnées
comprises) ignoré, blocs `NOTE`, `STYLE` et `REGION` ignorés, lignes avant la flèche (identifiant de
cue) ignorées, réglages après la borne de fin ignorés. Le texte d'un cue est sa charge utile, lignes
jointes par `\\n`, ramenée en NFC ; le texte dérivé joint les cues dans l'ordre par `\\n`. Ce module
est plus strict que l'interface là où elle laisserait passer un texte ambigu (balise, entité, cue
vide) : il refuse, il ne dérive jamais un texte que l'interface lirait autrement.

Horodatages en millisecondes entières : aucune somme de flottants ne décide d'une frontière.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass

EN_TETE = "WEBVTT"
FLECHE = "-->"
BLOCS_IGNORES = ("NOTE", "STYLE", "REGION")
CARACTERES_DE_BALISAGE = ("<", "&")
SEPARATEUR_CUES = "\n"
HORODATAGE = re.compile(r"(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})")
MS_PAR_HEURE = 3_600_000
MS_PAR_MINUTE = 60_000


class ErreurVtt(Exception):
    """Un fichier WebVTT qu'on ne sait pas lire sans supposer : aucun texte n'en est dérivé."""


class SegmentInvalide(Exception):
    """Un segment rendu par le modèle qui ne peut pas devenir un cue tel quel."""


class TranscriptionVide(Exception):
    """Aucun segment porteur de texte : aucun `.vtt` n'est écrit."""


@dataclass(frozen=True)
class SegmentTranscrit:
    debut_s: float
    fin_s: float
    texte: str


@dataclass(frozen=True)
class VttEcrit:
    contenu: str
    cues: int
    segments_exclus: int
    """Segments dont le texte était vide ou blanc : exclus, comptés dans la fiche de transcription."""


@dataclass(frozen=True)
class Cue:
    debut_ms: int
    fin_ms: int
    texte: str
    offset: int
    """Premier point de code de ce cue dans le texte dérivé."""


@dataclass(frozen=True)
class DocumentVtt:
    cues: tuple[Cue, ...]
    texte: str


# ----------------------------------------------------------------- écriture


def _millisecondes(secondes: float) -> int:
    if not math.isfinite(secondes) or secondes < 0:
        raise SegmentInvalide(f"horodatage impossible : {secondes!r} s")
    return round(secondes * 1000)


def _format_ms(ms: int) -> str:
    heures, reste = divmod(ms, MS_PAR_HEURE)
    minutes, reste = divmod(reste, MS_PAR_MINUTE)
    secondes, millis = divmod(reste, 1000)
    return f"{heures:02d}:{minutes:02d}:{secondes:02d}.{millis:03d}"


def formater_horodatage(secondes: float) -> str:
    """`HH:MM:SS.mmm`, millisecondes arrondies au plus proche ; au-delà de 99 h, plus de chiffres."""
    return _format_ms(_millisecondes(secondes))


def _verifier_texte(texte: str, numero: int) -> None:
    if "\n" in texte or "\r" in texte:
        raise SegmentInvalide(f"segment {numero} : saut de ligne dans le texte")
    if FLECHE in texte:
        raise SegmentInvalide(f"segment {numero} : « {FLECHE} » dans le texte casserait le cue")
    if any(caractere in texte for caractere in CARACTERES_DE_BALISAGE):
        raise SegmentInvalide(f"segment {numero} : balise ou entité WebVTT (< ou &) dans le texte : {texte!r}")


def _cue_ecrit(numero: int, segment: SegmentTranscrit, texte: str, fin_precedente_ms: int) -> tuple[str, int]:
    debut_ms, fin_ms = _millisecondes(segment.debut_s), _millisecondes(segment.fin_s)
    if fin_ms < debut_ms:
        raise SegmentInvalide(f"segment {numero} : finit avant de commencer ({segment.debut_s} → {segment.fin_s})")
    if debut_ms < fin_precedente_ms:
        raise SegmentInvalide(
            f"segment {numero} : commence avant la fin du précédent ({_format_ms(debut_ms)} < {_format_ms(fin_precedente_ms)})"
        )
    _verifier_texte(texte, numero)
    return f"{_format_ms(debut_ms)} {FLECHE} {_format_ms(fin_ms)}\n{texte}\n", fin_ms


def ecrire_vtt(segments: Sequence[SegmentTranscrit]) -> VttEcrit:
    blocs: list[str] = []
    exclus = 0
    fin_precedente_ms = 0
    for numero, segment in enumerate(segments, start=1):
        texte = segment.texte.strip()
        if not texte:
            exclus += 1
            continue
        bloc, fin_precedente_ms = _cue_ecrit(numero, segment, texte, fin_precedente_ms)
        blocs.append(bloc)
    if not blocs:
        raise TranscriptionVide(f"aucun segment porteur de texte ({len(segments)} segment(s) rendu(s))")
    return VttEcrit(f"{EN_TETE}\n\n" + "\n".join(blocs), len(blocs), exclus)


# ----------------------------------------------------------------- analyse


def _ms_de(horodatage: str) -> int:
    trouve = HORODATAGE.fullmatch(horodatage.strip())
    if trouve is None:
        raise ErreurVtt(f"horodatage illisible : {horodatage.strip()!r}")
    heures, minutes, secondes, millis = trouve.groups()
    return int(heures or 0) * MS_PAR_HEURE + int(minutes) * MS_PAR_MINUTE + int(secondes) * 1000 + int(millis)


def _bornes(ligne: str) -> tuple[int, int]:
    debut, fin = ligne.split(FLECHE, 1)
    reste = fin.split()
    if not reste:
        raise ErreurVtt(f"borne de fin absente après la flèche : {ligne!r}")
    return _ms_de(debut), _ms_de(reste[0])  # la suite de la ligne : réglages de cue, sans effet sur le temps


def _texte_du_cue(lignes: list[str], ligne_fleche: str) -> str:
    texte = unicodedata.normalize("NFC", "\n".join(lignes))
    if not texte:
        raise ErreurVtt(f"cue sans texte : {ligne_fleche!r}")
    if any(caractere in texte for caractere in CARACTERES_DE_BALISAGE):
        raise ErreurVtt(f"balise ou entité WebVTT dans un cue, non interprétée : {texte!r}")
    return texte


def _analyser_bloc(bloc: str, offset: int) -> Cue:
    lignes = bloc.split("\n")
    fleches = [index for index, ligne in enumerate(lignes) if FLECHE in ligne]
    if not fleches:
        raise ErreurVtt(f"bloc sans flèche d'horodatage : {lignes[0]!r}")
    index = fleches[0]
    debut_ms, fin_ms = _bornes(lignes[index])
    return Cue(debut_ms, fin_ms, _texte_du_cue(lignes[index + 1 :], lignes[index]), offset)


def _est_ignore(bloc: str) -> bool:
    return bloc.split("\n", 1)[0].strip().startswith(BLOCS_IGNORES)


def analyser_vtt(contenu: str) -> DocumentVtt:
    en_lf = contenu.replace("\r\n", "\n")
    if "\r" in en_lf:
        raise ErreurVtt("retour chariot isolé : fin de ligne que l'interface ne lirait pas comme telle")
    blocs = re.split(r"\n{2,}", en_lf.strip())
    if not re.match(rf"{EN_TETE}(?:[ \t]|$)", blocs[0].lstrip(), flags=re.MULTILINE):
        raise ErreurVtt("fichier sans en-tête WEBVTT")
    cues: list[Cue] = []
    offset = 0
    for bloc in blocs[1:]:
        if not bloc or _est_ignore(bloc):
            continue
        cue = _analyser_bloc(bloc, offset)
        cues.append(cue)
        offset += len(cue.texte) + len(SEPARATEUR_CUES)
    if not cues:
        raise ErreurVtt("aucun cue : rien à dériver")
    return DocumentVtt(tuple(cues), SEPARATEUR_CUES.join(cue.texte for cue in cues))


def texte_derive(contenu: str) -> str:
    """Texte canonique d'une source audio ou vidéo : les cues dans l'ordre, joints par `\\n`, NFC."""
    return analyser_vtt(contenu).texte


def cue_de(document: DocumentVtt, offset: int) -> Cue:
    """Cue qui couvre un offset du texte dérivé. Le saut de ligne qui joint deux cues appartient au
    premier, comme dans `horodatageDebut` côté TypeScript. Hors du texte : erreur, jamais le plus proche."""
    if not 0 <= offset < len(document.texte):
        raise ErreurVtt(f"offset {offset} hors du texte dérivé (longueur {len(document.texte)})")
    return [cue for cue in document.cues if cue.offset <= offset][-1]
