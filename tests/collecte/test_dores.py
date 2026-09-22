"""Cas limite 11 de C1-bis : chaque forme écrite par la collecte est reproduite octet pour octet.

Trois formes, cinq fichiers dorés dans `tests/collecte/dore/` : le manifeste de contenu (archivé et
en échec), la fiche de source (programme PDF et site de parti redirigé), le fichier de reprise.
`tests/collecte/dores.test.ts` les valide contre leur schéma et vérifie que les exemples valides
de `schema/exemples/` leur sont identiques.
"""

from __future__ import annotations

import hashlib
from datetime import date
from pathlib import Path

from pipeline.collecte.collecte import collecter
from pipeline.collecte.wayback import ArchivageEchoue, ArchivageReussi
from tests.collecte.banc import PDF, SHA_PDF, URL_PDF, banc, cle, source
from tests.collecte.doubles import HorlogeFactice, reponse

DORE = Path(__file__).resolve().parent / "dore"
URL_PARTI = "https://example.org/parti"
PAGE = "<!DOCTYPE html>\r\n<p>Page d’accueil — « programme »</p>\r\n".encode()
SHA_PAGE = hashlib.sha256(PAGE).hexdigest()
INSTANTANE_PARTI = "https://web.archive.org/web/20260923081500/https://example.org/parti"


def _collecter_programme(racine: Path, horloge: HorlogeFactice) -> None:
    b = banc(racine, horloge, {URL_PDF: reponse(200, PDF, content_type="application/pdf")})
    collecter([source()], b.dependances())


def _site_parti() -> object:
    return source(
        URL_PARTI,
        type_document="site_parti",
        site_parti_tient_lieu_de_campagne=True,
        candidat_id="candidat-b",
        date_source=date(2026, 8, 15),
    )


def _collecter_site_parti_deux_fois(racine: Path, horloge: HorlogeFactice) -> None:
    """Premier passage : Wayback en échec. Second passage le lendemain, mêmes octets : reprise."""
    page = reponse(200, PAGE, content_type="text/html; charset=utf-8")
    b = banc(
        racine,
        horloge,
        {
            URL_PARTI: reponse(302, location="https://example.org/parti/"),
            "https://example.org/parti/": [page, page],
        },
        [ArchivageEchoue(motif="HTTP 520 sans instantané daté", tentatives=3), ArchivageReussi(INSTANTANE_PARTI)],
    )
    collecter([_site_parti()], b.dependances())  # type: ignore[list-item]
    horloge.instant = horloge.instant.replace(day=23, hour=10, minute=15, second=0)
    collecter([_site_parti()], b.dependances())  # type: ignore[list-item]


def _lire(racine: Path, *morceaux: str) -> bytes:
    return racine.joinpath("staging", *morceaux).read_bytes()


def test_manifeste_de_contenu_archive_reproduit_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_programme(racine, horloge)

    assert _lire(racine, "sources", f"{SHA_PDF}.json") == (DORE / "manifeste-archive.json").read_bytes()


def test_fiche_de_source_programme_reproduite_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_programme(racine, horloge)

    produite = _lire(racine, "sources", "par-source", cle("candidat-a", URL_PDF), f"{SHA_PDF}.json")
    assert produite == (DORE / "fiche-programme-pdf.json").read_bytes()


def test_manifeste_de_contenu_en_echec_reproduit_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_site_parti_deux_fois(racine, horloge)

    assert _lire(racine, "sources", f"{SHA_PAGE}.json") == (DORE / "manifeste-echec-archivage.json").read_bytes()


def test_fiche_de_source_site_parti_reproduite_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_site_parti_deux_fois(racine, horloge)

    produite = _lire(racine, "sources", "par-source", cle("candidat-b", URL_PARTI), f"{SHA_PAGE}.json")
    assert produite == (DORE / "fiche-site-parti.json").read_bytes()


def test_fichier_de_reprise_reproduit_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_site_parti_deux_fois(racine, horloge)

    assert _lire(racine, "archivages", f"{SHA_PAGE}.json") == (DORE / "reprise-archivage.json").read_bytes()
