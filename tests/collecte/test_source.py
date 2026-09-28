"""`source_de` : le bloc `commun#/$defs/source` assemblé depuis la fiche, le manifeste, le lien
d'archive effectif et la fiche d'extraction. Ferme le point 5 de docs/DETTE.md (C1) : une reprise
d'archivage est vue, parce que personne ne lit `archive_url` dans le manifeste."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from pipeline.collecte.collecte import collecter
from pipeline.collecte.source import FormatIndecidable, PieceManquante, SourceSansArchive, format_de, source_de
from pipeline.collecte.textes.extraction import Extrait, extraire_tout
from pipeline.collecte.textes.pages import CitationSansPageUnique
from pipeline.collecte.wayback import ArchivageEchoue, ArchivageReussi
from tests.collecte.banc import INSTANTANE, PDF, SHA_PDF, URL_PDF, banc, cle, source
from tests.collecte.banc_textes import dependances
from tests.collecte.doubles import HorlogeFactice, reponse

ECHEC = ArchivageEchoue(motif="HTTP 520 sans instantané daté", tentatives=3)
INSTANTANE_REPRISE = "https://web.archive.org/web/20260923081500/https://example.org/programme.pdf"
URL_PARTI = "https://example.org/parti"
PAGE = "<p>Nos propositions</p>".encode()
CLE_A = cle("candidat-a", URL_PDF)


def _collecter_pdf(racine: Path, horloge: HorlogeFactice, archivages: list | None = None) -> None:
    b = banc(racine, horloge, {URL_PDF: [reponse(200, PDF, content_type="application/pdf")] * 2}, archivages)
    collecter([source()], b.dependances())


def _extraire(racine: Path, horloge: HorlogeFactice) -> str:
    [resultat] = extraire_tout(dependances(racine, horloge))
    assert isinstance(resultat, Extrait)
    return resultat.texte_sha256


def test_source_complete_d_un_programme_pdf_avec_page_de_la_citation(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    texte_sha = _extraire(racine, horloge)

    assert source_de(racine, CLE_A, SHA_PDF, texte_sha, citation=(40, 44)) == {
        "tier": "T1",
        "url": URL_PDF,
        "type_document": "programme_pdf",
        # Protocole 0.13 (n° 54) : le format est relevé par la collecte, jamais deviné de l'URL.
        "format": "pdf",
        "page": 2,
        "sha256": SHA_PDF,
        "texte_sha256": texte_sha,
        "archive_url": INSTANTANE,
        "date_source": "2026-09-01",
        "date_collecte": "2026-09-22T14:30:05+02:00",
        "chemin_local": f"archives/{SHA_PDF[:2]}/{SHA_PDF}.pdf",
        "publication": "publique",
    }


def test_sans_citation_pas_de_page(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    texte_sha = _extraire(racine, horloge)

    assert "page" not in source_de(racine, CLE_A, SHA_PDF, texte_sha)


def test_citation_a_cheval_sur_deux_pages_refusee(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    texte_sha = _extraire(racine, horloge)

    with pytest.raises(CitationSansPageUnique):
        source_de(racine, CLE_A, SHA_PDF, texte_sha, citation=(30, 42))


def test_reprise_d_archivage_visible_dans_la_source(racine: Path, horloge: HorlogeFactice) -> None:
    """Dette C1 n°5 : le manifeste porte echec_archivage, la reprise porte le lien."""
    b = banc(
        racine,
        horloge,
        {URL_PDF: [reponse(200, PDF, content_type="application/pdf")] * 2},
        [ECHEC, ArchivageReussi(INSTANTANE_REPRISE)],
    )
    collecter([source()], b.dependances())
    collecter([source()], b.dependances())
    texte_sha = _extraire(racine, horloge)

    assert source_de(racine, CLE_A, SHA_PDF, texte_sha)["archive_url"] == INSTANTANE_REPRISE


def test_archivage_en_echec_jamais_repris_pas_de_source(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge, [ECHEC])
    texte_sha = _extraire(racine, horloge)

    with pytest.raises(SourceSansArchive, match="jamais repris"):
        source_de(racine, CLE_A, SHA_PDF, texte_sha)


def test_site_parti_porte_sa_mention_et_une_citation_html_ne_donne_pas_de_page(
    racine: Path, horloge: HorlogeFactice
) -> None:
    b = banc(racine, horloge, {URL_PARTI: reponse(200, PAGE, content_type="text/html; charset=utf-8")})
    site = source(
        URL_PARTI,
        type_document="site_parti",
        site_parti_tient_lieu_de_campagne=False,
        candidat_id="candidat-b",
        date_source=date(2026, 8, 15),
    )
    collecter([site], b.dependances())
    [resultat] = extraire_tout(dependances(racine, horloge))
    assert isinstance(resultat, Extrait)

    produite = source_de(racine, cle("candidat-b", URL_PARTI), resultat.sha256_source, resultat.texte_sha256, (0, 3))

    assert produite["site_parti_tient_lieu_de_campagne"] is False
    assert list(produite)[:4] == ["tier", "url", "type_document", "site_parti_tient_lieu_de_campagne"]
    assert "page" not in produite
    # Protocole 0.13 (n° 54) : fiche d'extraction html.parser, donc une page web.
    assert produite["format"] == "html"


def test_fiche_d_extraction_absente(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)

    with pytest.raises(PieceManquante, match="fiche d'extraction absente"):
        source_de(racine, CLE_A, SHA_PDF, "0" * 64)


def test_fiche_de_source_absente_pour_une_autre_cle(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    texte_sha = _extraire(racine, horloge)

    with pytest.raises(PieceManquante, match="fiche de source absente"):
        source_de(racine, cle("candidat-z", URL_PDF), SHA_PDF, texte_sha)


# --------------------------------------------------------------------- format (protocole 0.13)
# « Chaque source déclare son format (PDF, page web, audio, vidéo), relevé par la collecte et non
# deviné » (§4, n° 54). Il se lit dans l'outil de la fiche d'extraction et, pour une transcription,
# dans le type de contenu que la collecte a reçu ; jamais dans l'URL.


def _extraction(outil: str) -> dict[str, object]:
    return {"extracteur": {"outil": outil, "version": "x", "options": {}}}


def _manifeste(type_contenu: str) -> dict[str, object]:
    return {"type_contenu_recu": type_contenu}


def test_format_pdf_d_une_fiche_pymupdf() -> None:
    assert format_de(_extraction("pymupdf"), _manifeste("application/pdf")) == "pdf"


def test_format_html_d_une_fiche_html_parser() -> None:
    assert format_de(_extraction("html.parser"), _manifeste("text/html; charset=utf-8")) == "html"


def test_format_video_d_une_transcription_d_un_contenu_video() -> None:
    assert format_de(_extraction("webvtt"), _manifeste("video/mp4")) == "video"


def test_format_audio_d_une_transcription_d_un_contenu_audio() -> None:
    assert format_de(_extraction("webvtt"), _manifeste("audio/mp4")) == "audio"


def test_transcription_d_un_contenu_ni_audio_ni_video_refusee() -> None:
    with pytest.raises(FormatIndecidable, match="application/pdf"):
        format_de(_extraction("webvtt"), _manifeste("application/pdf"))


def test_outil_d_extraction_inconnu_refuse() -> None:
    with pytest.raises(FormatIndecidable, match="tesseract"):
        format_de(_extraction("tesseract"), _manifeste("application/pdf"))


def test_source_d_un_pdf_sous_une_url_sans_extension_porte_le_format_pdf(racine: Path, horloge: HorlogeFactice) -> None:
    url = "https://example.org/telecharger?id=7"
    b = banc(racine, horloge, {url: [reponse(200, PDF, content_type="application/pdf")] * 2})
    collecter([source(url)], b.dependances())
    texte_sha = _extraire(racine, horloge)

    produite = source_de(racine, cle("candidat-a", url), SHA_PDF, texte_sha, citation=(40, 44))

    assert (produite["format"], produite["page"]) == ("pdf", 2)
