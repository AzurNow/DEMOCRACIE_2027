"""Chemins et fiche d'une transcription (`docs/CONTRATS.md` §2.2), tous deux immuables.

- `staging/transcriptions/<sha256_source>.vtt` : la transcription minutée, rangée sous l'empreinte
  du média archivé, que l'interface de validation lit telle quelle ;
- `staging/transcriptions/<sha256_source>.json` (`schema/transcription.schema.json`) : ce qui l'a
  produite (modèle, dépôt, révision, empreintes des poids, versions, paramètres, date).

L'ordre des clés est fixé ici par construction ; la sérialisation est celle de `manifeste.serialiser`.
"""

from __future__ import annotations

from pathlib import PurePosixPath

from pipeline.collecte.archivage import type_media

REPERTOIRE_TRANSCRIPTIONS = PurePosixPath("staging", "transcriptions")
PREFIXES_MEDIA = ("audio/", "video/")


def est_media(type_contenu: str | None) -> bool:
    """Un contenu `audio/*` ou `video/*` : son texte canonique est dérivé de sa transcription."""
    return type_contenu is not None and type_media(type_contenu).startswith(PREFIXES_MEDIA)


def chemin_vtt(sha256_source: str) -> PurePosixPath:
    return REPERTOIRE_TRANSCRIPTIONS / f"{sha256_source}.vtt"


def chemin_fiche_transcription(sha256_source: str) -> PurePosixPath:
    return REPERTOIRE_TRANSCRIPTIONS / f"{sha256_source}.json"


def construire_fiche_transcription(
    sha256_source: str,
    vtt_sha256: str,
    date_transcription: str,
    duree_audio_s: float,
    cues: int,
    segments_exclus: int,
    description: dict[str, object],
) -> dict[str, object]:
    """`description` porte les blocs `modele`, `moteur` et `parametres`, dans cet ordre."""
    return {
        "sha256_source": sha256_source,
        "vtt_sha256": vtt_sha256,
        "date_transcription": date_transcription,
        "duree_audio_s": duree_audio_s,
        "cues": cues,
        "segments_exclus": segments_exclus,
        "modele": description["modele"],
        "moteur": description["moteur"],
        "parametres": description["parametres"],
    }
