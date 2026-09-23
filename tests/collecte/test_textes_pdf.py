"""Texte d'un vrai PDF avec pymupdf (`docs/CONTRATS.md` §1.2). Les PDF sont fabriqués ici par
pymupdf lui-même : aucun fichier binaire au dépôt, aucun réseau."""

from __future__ import annotations

from importlib.metadata import version

import pymupdf
import pytest

from pipeline.collecte.textes.pages import Page
from pipeline.collecte.textes.pdf import DRAPEAUX, extraire_pdf, options
from pipeline.collecte.textes.refus import ExtractionRefusee


def _pdf(*pages: str) -> bytes:
    """Un PDF d'une page par argument ; une chaîne vide donne une page blanche."""
    document = pymupdf.open()
    for texte in pages:
        page = document.new_page()
        if texte:
            page.insert_text((72, 72), texte)
    octets = document.tobytes()
    document.close()
    return octets


def test_deux_pages_separees_par_saut_de_page_avec_intervalles() -> None:
    extraction = extraire_pdf(_pdf("Programme commun", "Page deux"))

    texte = extraction.texte.texte
    assert texte.count("\f") == 1
    premiere, seconde = texte.split("\f")
    assert "Programme commun" in premiere
    assert "Page deux" in seconde
    assert extraction.pages == (Page(1, 0, len(premiere)), Page(2, len(premiere) + 1, len(texte)))


def test_cesure_en_fin_de_ligne_conservee() -> None:
    texte = extraire_pdf(_pdf("financement des re-\ntraites")).texte.texte
    assert "re-\ntraites" in texte


def test_page_blanche_au_milieu_garde_un_intervalle_vide() -> None:
    extraction = extraire_pdf(_pdf("avant", "", "après"))
    assert extraction.pages is not None
    assert extraction.pages[1].debut == extraction.pages[1].fin


def test_pdf_sans_couche_texte_refuse() -> None:
    with pytest.raises(ExtractionRefusee, match="sans couche texte"):
        extraire_pdf(_pdf("", ""))


def test_octets_qui_ne_sont_pas_un_pdf_refuses() -> None:
    with pytest.raises(ExtractionRefusee, match="PDF illisible"):
        extraire_pdf(b"<html>pas un PDF</html>")


def test_pdf_protege_par_mot_de_passe_refuse() -> None:
    document = pymupdf.open()
    document.new_page().insert_text((72, 72), "secret")
    octets = document.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="u", owner_pw="o")
    document.close()

    with pytest.raises(ExtractionRefusee, match="mot de passe"):
        extraire_pdf(octets)


def test_drapeaux_fixes_ligatures_et_espaces_conserves_sans_suppression_de_cesure() -> None:
    assert DRAPEAUX == pymupdf.TEXT_PRESERVE_LIGATURES | pymupdf.TEXT_PRESERVE_WHITESPACE | pymupdf.TEXT_MEDIABOX_CLIP
    assert DRAPEAUX & pymupdf.TEXT_DEHYPHENATE == 0
    assert DRAPEAUX == 67  # valeur consignée dans les fichiers dorés : une nouvelle version qui la change doit se voir


def test_fiche_consigne_outil_version_et_options() -> None:
    extraction = extraire_pdf(_pdf("a"))
    assert extraction.outil == "pymupdf"
    assert extraction.version == version("pymupdf")
    assert extraction.options == options() == {"mode": "text", "drapeaux": 67, "separateur_pages": "\f"}
    assert extraction.encodage is None
