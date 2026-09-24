"""Transcription des contenus audio et vidéo collectés (C3, cas limites 4, 5, 6 et 9).

Le modèle est un double : il rend des segments fixes et compte ses appels. Aucun test ne télécharge
ni ne charge faster-whisper. La conformité de la fiche à `schema/transcription.schema.json` est
vérifiée par le fichier doré (`test_dores_transcription.py` et `dores.test.ts`).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from pipeline.collecte.transcription.__main__ import principal
from pipeline.collecte.transcription.modele import Transcription, charger_transcripteur
from pipeline.collecte.transcription.poids import EmpreintePoidsInvalide, PoidsAbsent
from pipeline.collecte.transcription.transcription import (
    Dependances,
    DejaTranscrite,
    Refusee,
    Transcrite,
    code_de_sortie,
    formater_rapport,
    transcrire_tout,
)
from pipeline.collecte.transcription.webvtt import SegmentTranscrit
from tests.collecte.banc_textes import deposer, fichiers
from tests.collecte.doubles import HorlogeFactice

SEGMENTS = (SegmentTranscrit(0.0, 2.5, " Bonjour à tous."), SegmentTranscrit(2.5, 4.0, " Merci."))
VTT = "WEBVTT\n\n00:00:00.000 --> 00:00:02.500\nBonjour à tous.\n\n00:00:02.500 --> 00:00:04.000\nMerci.\n"
VTT_SHA = hashlib.sha256(VTT.encode()).hexdigest()
DESCRIPTION: dict[str, object] = {
    "modele": {"alias": "large-v3-turbo", "depot": "d/m", "revision": "0" * 40, "fichiers": []},
    "moteur": {"faster_whisper": "1.2.1", "ctranslate2": "4.8.2"},
    "parametres": {"chargement": {}, "decodage": {}},
}


@dataclass
class TranscripteurFactice:
    segments: tuple[SegmentTranscrit, ...] = SEGMENTS
    duree_audio_s: float = 4.2
    chemins: list[Path] = field(default_factory=list)

    def transcrire(self, chemin: Path) -> Transcription:
        self.chemins.append(chemin)
        return Transcription(self.segments, self.duree_audio_s)

    def description(self) -> dict[str, object]:
        return DESCRIPTION


@dataclass
class Chargeur:
    transcripteur: TranscripteurFactice = field(default_factory=TranscripteurFactice)
    chargements: int = 0

    def __call__(self) -> TranscripteurFactice:
        self.chargements += 1
        return self.transcripteur


def deps(racine: Path, horloge: HorlogeFactice, chargeur: Chargeur) -> Dependances:
    return Dependances(racine, horloge, chargeur)


def _vtt(racine: Path, sha: str) -> Path:
    return racine / "staging" / "transcriptions" / f"{sha}.vtt"


def _fiche(racine: Path, sha: str) -> Path:
    return racine / "staging" / "transcriptions" / f"{sha}.json"


# --------------------------------------------------------------------------- cas nominal


def test_video_transcrite_vtt_puis_fiche(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, b"\x00\x00\x00\x18ftypmp42 video", "video/mp4", ".mp4")
    chargeur = Chargeur()

    resultats = transcrire_tout(deps(racine, horloge, chargeur))

    assert resultats == [Transcrite(sha, VTT_SHA, cues=2, segments_exclus=0)]
    assert _vtt(racine, sha).read_bytes() == VTT.encode()
    assert json.loads(_fiche(racine, sha).read_text("utf-8")) == {
        "sha256_source": sha,
        "vtt_sha256": VTT_SHA,
        "date_transcription": "2026-09-22T14:30:05+02:00",
        "duree_audio_s": 4.2,
        "cues": 2,
        "segments_exclus": 0,
        **DESCRIPTION,
    }
    assert chargeur.transcripteur.chemins == [racine / "archives" / sha[:2] / f"{sha}.mp4"]
    assert code_de_sortie(resultats) == 0


def test_audio_transcrit_et_segments_blancs_comptes(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, b"ID3 audio", "audio/mpeg", ".mp3")
    chargeur = Chargeur(TranscripteurFactice((*SEGMENTS, SegmentTranscrit(4.0, 5.0, "  "))))

    [resultat] = transcrire_tout(deps(racine, horloge, chargeur))

    assert resultat == Transcrite(sha, VTT_SHA, cues=2, segments_exclus=1)
    assert json.loads(_fiche(racine, sha).read_text("utf-8"))["segments_exclus"] == 1


def test_pdf_et_html_ignores_modele_jamais_charge(racine: Path, horloge: HorlogeFactice) -> None:
    deposer(racine, b"%PDF-1.7", "application/pdf")
    deposer(racine, b"<p>x</p>", "text/html; charset=utf-8")
    deposer(racine, b"?", None)
    chargeur = Chargeur()

    assert transcrire_tout(deps(racine, horloge, chargeur)) == []
    assert chargeur.chargements == 0


def test_modele_charge_une_seule_fois_pour_tout_le_lot(racine: Path, horloge: HorlogeFactice) -> None:
    deposer(racine, b"ID3 un", "audio/mpeg")
    deposer(racine, b"ID3 deux", "audio/mpeg")
    chargeur = Chargeur()

    transcrire_tout(deps(racine, horloge, chargeur))

    assert chargeur.chargements == 1
    assert len(chargeur.transcripteur.chemins) == 2


# --------------------------------------------------------------------------- cas 4 : vide


def test_transcription_vide_erreur_et_aucun_fichier_ecrit(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, b"ID3 silence", "audio/mpeg")
    avant = fichiers(racine)

    [resultat] = transcrire_tout(deps(racine, horloge, Chargeur(TranscripteurFactice(()))))

    assert isinstance(resultat, Refusee)
    assert resultat.sha256_source == sha
    assert resultat.motif.startswith("transcription vide")
    assert fichiers(racine) == avant


def test_segments_chevauchants_refus_et_aucun_fichier_ecrit(racine: Path, horloge: HorlogeFactice) -> None:
    deposer(racine, b"ID3 x", "audio/mpeg")
    avant = fichiers(racine)
    segments = (SegmentTranscrit(0.0, 2.0, "Un"), SegmentTranscrit(1.0, 3.0, "Deux"))

    [resultat] = transcrire_tout(deps(racine, horloge, Chargeur(TranscripteurFactice(segments))))

    assert isinstance(resultat, Refusee)
    assert "commence avant la fin" in resultat.motif
    assert fichiers(racine) == avant


# --------------------------------------------------------------------------- cas 5 : non-réécriture


def test_vtt_deja_present_jamais_reecrit_meme_si_la_transcription_differe(
    racine: Path, horloge: HorlogeFactice
) -> None:
    sha = deposer(racine, b"ID3 audio", "audio/mpeg")
    transcrire_tout(deps(racine, horloge, Chargeur()))
    avant = fichiers(racine)
    autre = Chargeur(TranscripteurFactice((SegmentTranscrit(0.0, 1.0, "Autre texte."),)))
    horloge.instant = horloge.instant.replace(day=25)

    resultats = transcrire_tout(deps(racine, horloge, autre))

    assert resultats == [DejaTranscrite(sha)]
    assert fichiers(racine) == avant
    assert autre.chargements == 0
    assert code_de_sortie(resultats) == 0
    assert formater_rapport(resultats).splitlines()[0].startswith("déjà transcrite")


def test_vtt_sans_fiche_refus_jamais_complete_apres_coup(racine: Path, horloge: HorlogeFactice) -> None:
    """Un `.vtt` dont on ignore le modèle et les paramètres ne reçoit pas une fiche inventée."""
    sha = deposer(racine, b"ID3 audio", "audio/mpeg")
    _vtt(racine, sha).parent.mkdir(parents=True)
    _vtt(racine, sha).write_text(VTT, encoding="utf-8")
    chargeur = Chargeur()

    [resultat] = transcrire_tout(deps(racine, horloge, chargeur))

    assert resultat == Refusee(sha, f"transcription sans fiche : staging/transcriptions/{sha}.json absente")
    assert not _fiche(racine, sha).exists()
    assert chargeur.chargements == 0


def test_fiche_sans_vtt_refus(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, b"ID3 audio", "audio/mpeg")
    _fiche(racine, sha).parent.mkdir(parents=True)
    _fiche(racine, sha).write_text("{}", encoding="utf-8")

    [resultat] = transcrire_tout(deps(racine, horloge, Chargeur()))

    assert resultat == Refusee(sha, f"fiche sans transcription : staging/transcriptions/{sha}.vtt absent")
    assert not _vtt(racine, sha).exists()


# --------------------------------------------------------------------------- copie locale


def test_copie_locale_absente_refus(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, b"ID3 audio", "audio/mpeg", ".mp3")
    (racine / "archives" / sha[:2] / f"{sha}.mp3").unlink()

    [resultat] = transcrire_tout(deps(racine, horloge, Chargeur()))

    assert resultat == Refusee(sha, f"copie locale absente : archives/{sha[:2]}/{sha}.mp3")


def test_copie_locale_alteree_refus_avant_transcription(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, b"ID3 audio", "audio/mpeg", ".mp3")
    (racine / "archives" / sha[:2] / f"{sha}.mp3").write_bytes(b"ID3 autre")
    chargeur = Chargeur()

    [resultat] = transcrire_tout(deps(racine, horloge, chargeur))

    assert isinstance(resultat, Refusee)
    assert resultat.motif.startswith("copie locale altérée")
    assert chargeur.transcripteur.chemins == []


def test_un_refus_n_arrete_pas_le_lot(racine: Path, horloge: HorlogeFactice) -> None:
    sha_absent = deposer(racine, b"ID3 un", "audio/mpeg", ".mp3")
    (racine / "archives" / sha_absent[:2] / f"{sha_absent}.mp3").unlink()
    deposer(racine, b"ID3 deux", "audio/mpeg")

    resultats = transcrire_tout(deps(racine, horloge, Chargeur()))

    assert sorted(type(r).__name__ for r in resultats) == ["Refusee", "Transcrite"]
    assert code_de_sortie(resultats) == 1


# --------------------------------------------------------------------------- cas 6 : poids


def test_poids_d_empreinte_fausse_refus_avant_chargement_rien_ecrit(racine: Path, horloge: HorlogeFactice) -> None:
    deposer(racine, b"ID3 audio", "audio/mpeg")
    avant = {nom for nom in fichiers(racine)}
    construits: list[Path] = []

    def telecharger(nom: str, repertoire: Path) -> None:
        repertoire.mkdir(parents=True, exist_ok=True)
        (repertoire / nom).write_bytes(b"faux")

    def construire(repertoire: Path, empreintes: dict[str, str]) -> TranscripteurFactice:
        construits.append(repertoire)
        return TranscripteurFactice()

    def charger() -> TranscripteurFactice:
        return charger_transcripteur(racine, telecharger, construire)  # type: ignore[return-value]

    with pytest.raises(EmpreintePoidsInvalide):
        transcrire_tout(Dependances(racine, horloge, charger))
    assert construits == []
    assert not (racine / "staging" / "transcriptions").exists()
    assert {nom for nom in fichiers(racine) if not nom.startswith("modeles/")} == avant


def test_poids_absents_apres_telechargement_erreur_nommee(racine: Path) -> None:
    with pytest.raises(PoidsAbsent, match="model.bin"):
        charger_transcripteur(racine, lambda nom, repertoire: None, lambda r, e: TranscripteurFactice())


# --------------------------------------------------------------------------- ligne de commande


def test_ligne_de_commande_poids_refuses_code_2(racine: Path, capsys: pytest.CaptureFixture[str]) -> None:
    deposer(racine, b"ID3 audio", "audio/mpeg")

    def charger(racine_depot: Path) -> TranscripteurFactice:
        raise EmpreintePoidsInvalide("model.bin : SHA-256 faux")

    code = principal(["--racine", str(racine)], charger)

    assert code == 2
    assert "model.bin : SHA-256 faux" in capsys.readouterr().err


def test_ligne_de_commande_rapport_et_code(racine: Path, capsys: pytest.CaptureFixture[str]) -> None:
    sha = deposer(racine, b"ID3 audio", "audio/mpeg")

    code = principal(["--racine", str(racine)], lambda racine_depot: TranscripteurFactice())

    assert code == 0
    sortie = capsys.readouterr().out
    assert f"transcrite       {sha}  → {VTT_SHA} (2 cues, 0 segment(s) exclu(s))" in sortie
    assert sortie.rstrip().endswith("bilan : 1 transcrite(s), 0 déjà transcrite(s), 0 refusée(s)")
