"""`source_de` : le bloc `commun#/$defs/source` assemblé depuis la fiche, le manifeste, le lien
d'archive effectif et la fiche d'extraction. Ferme le point 5 de docs/DETTE.md (C1) : une reprise
d'archivage est vue, parce que personne ne lit `archive_url` dans le manifeste."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from pipeline.collecte.collecte import collecter
from pipeline.collecte.source import PieceManquante, SourceSansArchive, source_de
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


def test_fiche_d_extraction_absente(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)

    with pytest.raises(PieceManquante, match="fiche d'extraction absente"):
        source_de(racine, CLE_A, SHA_PDF, "0" * 64)


def test_fiche_de_source_absente_pour_une_autre_cle(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    texte_sha = _extraire(racine, horloge)

    with pytest.raises(PieceManquante, match="fiche de source absente"):
        source_de(racine, cle("candidat-z", URL_PDF), SHA_PDF, texte_sha)
