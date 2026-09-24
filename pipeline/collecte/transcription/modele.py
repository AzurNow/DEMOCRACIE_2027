"""faster-whisper en local : paramètres fixés ici, écrits tels quels dans chaque fiche de transcription.

Chargement : CPU, `int8`. Le CPU parce qu'aucun GPU n'est requis (décision du 2026-09-24) ; `int8`
parce que c'est le type de calcul que CTranslate2 exécute nativement sur CPU pour ce modèle, quatre
fois plus léger en mémoire que `float32`, sans raison ici de s'en écarter. Nombre de fils fixé,
pour que deux transcriptions sur la même machine suivent le même ordre de calcul.

Décodage : langue `fr`, tâche `transcribe`, température 0 **seule** (aucun repli vers une température
plus haute : le décodage est une recherche en faisceau, sans tirage aléatoire). Sans repli,
conditionner un segment sur le texte du précédent propage une boucle de répétition jusqu'à la fin de
l'enregistrement ; `condition_on_previous_text` est donc désactivé. VAD désactivée : faster-whisper
importe onnxruntime quoi qu'il arrive, mais filtrer les silences retirerait des passages avant même
la transcription, sans trace dans le `.vtt`. Aucun prompt initial, aucun mot favorisé. Les autres
valeurs sont celles de faster-whisper 1.2.1, écrites explicitement pour qu'une montée de version ne
les change pas en silence.

La transcription n'est pas reproductible à l'octet d'une machine à l'autre : d'où la règle de
non-réécriture du `.vtt` (`transcription.py`) et la fiche qui trace tout ce qui l'a produit.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path
from typing import Protocol

from pipeline.collecte.transcription.poids import (
    ALIAS,
    DEPOT,
    REVISION,
    Telecharger,
    preparer_poids,
    repertoire_modele,
    telecharger_depuis_hugging_face,
)
from pipeline.collecte.transcription.webvtt import SegmentTranscrit

CHARGEMENT: dict[str, object] = {
    "device": "cpu",
    "compute_type": "int8",
    "cpu_threads": 4,
    "num_workers": 1,
}

DECODAGE: dict[str, object] = {
    "language": "fr",
    "task": "transcribe",
    "temperature": 0.0,
    "beam_size": 5,
    "best_of": 1,
    "patience": 1.0,
    "length_penalty": 1.0,
    "repetition_penalty": 1.0,
    "no_repeat_ngram_size": 0,
    "compression_ratio_threshold": 2.4,
    "log_prob_threshold": -1.0,
    "no_speech_threshold": 0.6,
    "condition_on_previous_text": False,
    "prompt_reset_on_temperature": 0.5,
    "initial_prompt": None,
    "prefix": None,
    "suppress_blank": True,
    "suppress_tokens": [-1],
    "without_timestamps": False,
    "max_initial_timestamp": 1.0,
    "word_timestamps": False,
    "multilingual": False,
    "vad_filter": False,
    "max_new_tokens": None,
    "chunk_length": None,
    "clip_timestamps": "0",
    "hallucination_silence_threshold": None,
    "hotwords": None,
}


@dataclass(frozen=True)
class Transcription:
    segments: tuple[SegmentTranscrit, ...]
    duree_audio_s: float


class Transcripteur(Protocol):
    def transcrire(self, chemin: Path) -> Transcription: ...

    def description(self) -> dict[str, object]:
        """Blocs `modele`, `moteur` et `parametres` de la fiche de transcription."""
        ...


def description_modele(empreintes: dict[str, str]) -> dict[str, object]:
    return {
        "modele": {
            "alias": ALIAS,
            "depot": DEPOT,
            "revision": REVISION,
            "fichiers": [{"nom": nom, "sha256": sha256} for nom, sha256 in empreintes.items()],
        },
        "moteur": {"faster_whisper": version("faster-whisper"), "ctranslate2": version("ctranslate2")},
        "parametres": {"chargement": dict(CHARGEMENT), "decodage": dict(DECODAGE)},
    }


class TranscripteurWhisper:
    """Le vrai modèle, chargé depuis un répertoire local déjà vérifié. Jamais instancié par les tests."""

    def __init__(self, repertoire: Path, empreintes: dict[str, str]) -> None:
        from faster_whisper import WhisperModel

        self._modele = WhisperModel(str(repertoire), local_files_only=True, **CHARGEMENT)
        self._description = description_modele(empreintes)

    def transcrire(self, chemin: Path) -> Transcription:
        segments, info = self._modele.transcribe(str(chemin), **DECODAGE)
        rendus = tuple(SegmentTranscrit(segment.start, segment.end, segment.text) for segment in segments)
        return Transcription(rendus, info.duration)

    def description(self) -> dict[str, object]:
        return self._description


Construire = Callable[[Path, dict[str, str]], Transcripteur]


def charger_transcripteur(
    racine: Path,
    telecharger: Telecharger = telecharger_depuis_hugging_face,
    construire: Construire = TranscripteurWhisper,
) -> Transcripteur:
    """Poids préparés et **vérifiés** d'abord ; le modèle n'est construit qu'ensuite."""
    repertoire = repertoire_modele(racine)
    empreintes = preparer_poids(repertoire, telecharger)
    return construire(repertoire, empreintes)
