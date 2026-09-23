"""Formes écrites par C2, reproduites octet pour octet (fichiers dorés de `tests/collecte/dore/`).

- `extraction-pdf.json` et `extraction-html.json` : fiches d'extraction, validées contre
  `schema/extraction-texte.schema.json` et copiées dans `schema/exemples/` (`dores.test.ts`) ;
- `sources/source-programme-pdf.json` : le bloc rendu par `source_de`, validé contre
  `commun#/$defs/source` par `dores.test.ts`. C'est la preuve que les quatre fichiers de la
  collecte et de l'extraction alimentent bien la source d'un item, champ pour champ.

Les versions d'outil sont figées par `banc_textes` : le PDF réel est exercé ailleurs.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from pipeline.collecte.collecte import collecter
from pipeline.collecte.source import source_de
from pipeline.collecte.textes.extraction import Extrait, extraire_tout
from tests.collecte.banc import PDF, SHA_PDF, URL_PDF, banc, cle, source
from tests.collecte.banc_textes import dependances
from tests.collecte.doubles import HorlogeFactice, reponse

DORE = Path(__file__).resolve().parent / "dore"
URL_PARTI = "https://example.org/parti"
PAGE = "<!DOCTYPE html>\r\n<p>Page d\u2019accueil — «\u00a0programme\u00a0»</p>\r\n".encode()


def _extraire_programme(racine: Path, horloge: HorlogeFactice) -> Extrait:
    b = banc(racine, horloge, {URL_PDF: reponse(200, PDF, content_type="application/pdf")})
    collecter([source()], b.dependances())
    horloge.instant = horloge.instant.replace(minute=45)
    [resultat] = extraire_tout(dependances(racine, horloge))
    assert isinstance(resultat, Extrait)
    return resultat


def _extraire_site_parti(racine: Path, horloge: HorlogeFactice) -> Extrait:
    b = banc(racine, horloge, {URL_PARTI: reponse(200, PAGE, content_type="text/html; charset=utf-8")})
    site = source(
        URL_PARTI,
        type_document="site_parti",
        site_parti_tient_lieu_de_campagne=True,
        candidat_id="candidat-b",
        date_source=date(2026, 8, 15),
    )
    collecter([site], b.dependances())
    [resultat] = extraire_tout(dependances(racine, horloge))
    assert isinstance(resultat, Extrait)
    return resultat


def _fiche(racine: Path, resultat: Extrait) -> bytes:
    return (racine / "staging" / "extractions" / resultat.sha256_source / f"{resultat.texte_sha256}.json").read_bytes()


def test_fiche_d_extraction_pdf_reproduite_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    resultat = _extraire_programme(racine, horloge)
    assert _fiche(racine, resultat) == (DORE / "extraction-pdf.json").read_bytes()


def test_fiche_d_extraction_html_reproduite_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    resultat = _extraire_site_parti(racine, horloge)
    assert _fiche(racine, resultat) == (DORE / "extraction-html.json").read_bytes()


def test_texte_html_du_site_parti(racine: Path, horloge: HorlogeFactice) -> None:
    resultat = _extraire_site_parti(racine, horloge)
    texte = (racine / "staging" / "textes" / f"{resultat.texte_sha256}.txt").read_bytes()
    assert texte == "Page d\u2019accueil — «\u00a0programme\u00a0»".encode()


def test_texte_pdf_reproduit_octet_pour_octet_et_offsets_en_points_de_code(
    racine: Path, horloge: HorlogeFactice
) -> None:
    """Le même fichier est relu par `dores.test.ts` avec `lireTexteCanonique` et `testerVerbatim` :
    les offsets trouvés ici sont ceux que TypeScript doit retrouver, emoji compris."""
    resultat = _extraire_programme(racine, horloge)
    octets = (racine / "staging" / "textes" / f"{resultat.texte_sha256}.txt").read_bytes()
    assert octets == (DORE / "textes" / f"{resultat.texte_sha256}.txt").read_bytes()
    texte = octets.decode("utf-8")
    assert texte.index("Page deux") == 40
    assert texte.index("\ufb01nancement") == 12


def test_source_d_un_programme_pdf_reproduite(racine: Path, horloge: HorlogeFactice) -> None:
    resultat = _extraire_programme(racine, horloge)
    produite = source_de(racine, cle("candidat-a", URL_PDF), SHA_PDF, resultat.texte_sha256, citation=(10, 21))
    serialisee = (json.dumps(produite, ensure_ascii=False, indent=2) + "\n").encode()
    assert serialisee == (DORE / "sources" / "source-programme-pdf.json").read_bytes()
