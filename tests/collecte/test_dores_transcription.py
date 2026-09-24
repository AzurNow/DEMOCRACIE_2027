"""Formes écrites par C3, reproduites octet pour octet (fichiers dorés de `tests/collecte/dore/`).

- `manifeste-video.json`, `fiche-video.json`, `manifeste-audio.json`, `fiche-audio.json` : collecte
  d'un enregistrement par yt-dlp (cas limite 8), validés contre `collecte` et `fiche-source` ;
- `transcription.json` et `transcriptions/<sha256>.vtt` : fiche de transcription (cas limite 9),
  validée contre `schema/transcription.schema.json`, et le `.vtt` qu'elle décrit ;
- `extraction-vtt.json` et son texte `textes/<texte_sha256>.txt` : texte dérivé du `.vtt`.

`dores.test.ts` valide les fiches contre leur schéma, vérifie que les exemples valides de
`schema/exemples/` leur sont identiques, et relit le `.vtt` avec `validation/domaine/webvtt.ts` :
le texte que TypeScript dérive doit être celui que Python a écrit, au point de code près.

Les versions d'outil sont figées : le vrai modèle n'est jamais chargé, yt-dlp jamais appelé.
"""

from __future__ import annotations

import hashlib
from datetime import date
from pathlib import Path

from pipeline.collecte.collecte import collecter
from pipeline.collecte.textes.extraction import Extrait, extraire_tout
from pipeline.collecte.transcription.modele import description_modele
from pipeline.collecte.transcription.transcription import Dependances, Transcrite, transcrire_tout
from pipeline.collecte.transcription.webvtt import SegmentTranscrit
from pipeline.collecte.wayback import ArchivageReussi
from tests.collecte.banc import banc, cle, source
from tests.collecte.banc_textes import dependances
from tests.collecte.doubles import HorlogeFactice
from tests.collecte.test_media import AUDIO, PAGE_FINALE, URL_AUDIO, URL_VIDEO, VIDEO, YtDlpFactice
from tests.collecte.test_transcription import TranscripteurFactice

DORE = Path(__file__).resolve().parent / "dore"
SHA_VIDEO = hashlib.sha256(VIDEO).hexdigest()
SHA_AUDIO = hashlib.sha256(AUDIO).hexdigest()
SEGMENTS = (
    SegmentTranscrit(3598.24, 3601.5, " Premie\N{COMBINING GRAVE ACCENT}re phrase de l\N{RIGHT SINGLE QUOTATION MARK}extrait."),
    SegmentTranscrit(3601.5, 3602.0, " "),
    SegmentTranscrit(3602.0, 3605.75, " Seconde phrase \N{EARTH GLOBE EUROPE-AFRICA} fin."),
)
EMPREINTES_FACTICES = {
    "model.bin": "e76620f83d5f5b69efd3d87e3dc180c1bd21df9fbebacfd4335e5e1efcc018da",
    **{
        nom: hashlib.sha256(f"{nom} factice".encode()).hexdigest()
        for nom in ("config.json", "preprocessor_config.json", "tokenizer.json", "vocabulary.json")
    },
}


def _description() -> dict[str, object]:
    """Description réelle du modèle, versions du moteur figées pour ne pas suivre `uv.lock`."""
    return {**description_modele(EMPREINTES_FACTICES), "moteur": {"faster_whisper": "1.2.1", "ctranslate2": "4.8.2"}}


class TranscripteurFige(TranscripteurFactice):
    def description(self) -> dict[str, object]:
        return _description()


INSTANTANE_VIDEO = f"https://web.archive.org/web/20260922123005/{URL_VIDEO}"
INSTANTANE_AUDIO = f"https://web.archive.org/web/20260922123007/{URL_AUDIO}"
VIDEO_LISTEE = source(URL_VIDEO, tier="T2", type_document="enregistrement_video", date_source=date(2026, 9, 10))
AUDIO_LISTE = source(URL_AUDIO, tier="T2", type_document="enregistrement_audio", date_source=date(2026, 9, 12))


def _collecter_video(racine: Path, horloge: HorlogeFactice) -> None:
    b = banc(racine, horloge, {}, [ArchivageReussi(INSTANTANE_VIDEO)], media=YtDlpFactice())
    collecter([VIDEO_LISTEE], b.dependances())


def _collecter(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_video(racine, horloge)
    b = banc(racine, horloge, {}, [ArchivageReussi(INSTANTANE_AUDIO)], media=YtDlpFactice(octets=AUDIO, ext="m4a"))
    collecter([AUDIO_LISTE], b.dependances())


def _transcrire_video(racine: Path, horloge: HorlogeFactice) -> Transcrite:
    _collecter_video(racine, horloge)
    horloge.instant = horloge.instant.replace(hour=16, minute=2, second=41)
    [resultat] = transcrire_tout(Dependances(racine, horloge, lambda: TranscripteurFige(SEGMENTS, 3612.37)))
    assert isinstance(resultat, Transcrite)
    return resultat


def _extraire(racine: Path, horloge: HorlogeFactice) -> Extrait:
    _transcrire_video(racine, horloge)
    horloge.instant = horloge.instant.replace(hour=16, minute=10, second=0)
    [resultat] = extraire_tout(dependances(racine, horloge))
    assert isinstance(resultat, Extrait)
    return resultat


def _lire(racine: Path, *morceaux: str) -> bytes:
    return racine.joinpath("staging", *morceaux).read_bytes()


def test_manifeste_video_reproduit_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter(racine, horloge)
    assert _lire(racine, "sources", f"{SHA_VIDEO}.json") == (DORE / "manifeste-video.json").read_bytes()


def test_fiche_video_reproduite_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter(racine, horloge)
    produite = _lire(racine, "sources", "par-source", cle("candidat-a", URL_VIDEO), f"{SHA_VIDEO}.json")
    assert produite == (DORE / "fiche-video.json").read_bytes()


def test_manifeste_audio_reproduit_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter(racine, horloge)
    assert _lire(racine, "sources", f"{SHA_AUDIO}.json") == (DORE / "manifeste-audio.json").read_bytes()


def test_fiche_audio_reproduite_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter(racine, horloge)
    produite = _lire(racine, "sources", "par-source", cle("candidat-a", URL_AUDIO), f"{SHA_AUDIO}.json")
    assert produite == (DORE / "fiche-audio.json").read_bytes()


def test_fiche_video_porte_l_url_de_la_page_rendue_par_yt_dlp() -> None:
    assert b'"url_finale": "' + PAGE_FINALE.encode() + b'"' in (DORE / "fiche-video.json").read_bytes()


def test_vtt_et_fiche_de_transcription_reproduits_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    resultat = _transcrire_video(racine, horloge)
    assert _lire(racine, "transcriptions", f"{SHA_VIDEO}.vtt") == (DORE / "transcriptions" / f"{SHA_VIDEO}.vtt").read_bytes()
    assert _lire(racine, "transcriptions", f"{SHA_VIDEO}.json") == (DORE / "transcription.json").read_bytes()
    assert (resultat.cues, resultat.segments_exclus) == (2, 1)


def test_fiche_et_texte_derives_reproduits_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    resultat = _extraire(racine, horloge)
    fiche = _lire(racine, "extractions", SHA_VIDEO, f"{resultat.texte_sha256}.json")
    assert fiche == (DORE / "extraction-vtt.json").read_bytes()
    texte = _lire(racine, "textes", f"{resultat.texte_sha256}.txt")
    assert texte == (DORE / "textes" / f"{resultat.texte_sha256}.txt").read_bytes()


def test_texte_derive_en_nfc_et_offsets_en_points_de_code(racine: Path, horloge: HorlogeFactice) -> None:
    """Les offsets vérifiés ici sont ceux que `dores.test.ts` doit retrouver côté TypeScript."""
    resultat = _extraire(racine, horloge)
    texte = _lire(racine, "textes", f"{resultat.texte_sha256}.txt").decode("utf-8")
    assert texte == "Premi\N{LATIN SMALL LETTER E WITH GRAVE}re phrase de l\N{RIGHT SINGLE QUOTATION MARK}extrait.\nSeconde phrase \N{EARTH GLOBE EUROPE-AFRICA} fin."
    assert texte.index("Seconde") == 30
    assert texte.index("fin.") == 47
