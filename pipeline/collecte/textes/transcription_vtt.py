"""Texte canonique d'un enregistrement audio ou vidéo : **dérivé** de sa transcription (`docs/CONTRATS.md` §2).

Jamais produit autrement. Les cues du `.vtt`, dans l'ordre, joints par `\\n`, chacun en NFC : la
règle de `pipeline/collecte/transcription/webvtt.py`, la même que celle de l'interface de validation
(`validation/domaine/webvtt.ts`). Un offset du texte retombe ainsi dans un cue, donc dans un
horodatage. La fiche d'extraction nomme le `.vtt` par son empreinte.
"""

from __future__ import annotations

import hashlib
import platform

from pipeline.collecte.textes.canonique import TexteCanonique
from pipeline.collecte.textes.fiche import Extraction
from pipeline.collecte.textes.refus import ExtractionRefusee
from pipeline.collecte.transcription.webvtt import ErreurVtt, texte_derive

OUTIL = "webvtt"
REGLE = "vtt-1"
"""Version de la règle de dérivation. Toute modification de l'analyse du `.vtt` (blocs ignorés,
jonction des lignes d'un cue ou des cues) l'incrémente : le texte produit change, la fiche doit le dire."""


def _decoder(octets: bytes) -> str:
    try:
        return octets.decode("utf-8")
    except UnicodeDecodeError as erreur:
        raise ExtractionRefusee(f"transcription illisible : octet non UTF-8 à la position {erreur.start}") from None


def extraire_vtt(octets: bytes) -> Extraction:
    """`platform.python_version()` en version : la NFC dépend de la table Unicode de Python."""
    try:
        texte = texte_derive(_decoder(octets))
    except ErreurVtt as erreur:
        raise ExtractionRefusee(f"transcription illisible : {erreur}") from None
    vtt_sha256 = hashlib.sha256(octets).hexdigest()
    return Extraction(TexteCanonique(texte), OUTIL, platform.python_version(), {"regle": REGLE}, vtt_sha256=vtt_sha256)
