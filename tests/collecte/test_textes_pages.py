"""Pages d'un texte de PDF et page d'une citation (`docs/CONTRATS.md` §1.1 et §1.2), sans pymupdf."""

from __future__ import annotations

import pytest

from pipeline.collecte.textes.pages import CitationSansPageUnique, Page, joindre_pages, page_de
from pipeline.collecte.textes.refus import ExtractionRefusee


def test_deux_pages_jointes_par_saut_de_page_avec_intervalles_exacts() -> None:
    resultat = joindre_pages(["Page un\n", "Page deux\n"])

    assert resultat.texte.texte == "Page un\n\fPage deux\n"
    assert resultat.pages == (Page(1, 0, 8), Page(2, 9, 19))
    texte = resultat.texte.texte
    assert [texte[p.debut : p.fin] for p in resultat.pages] == ["Page un\n", "Page deux\n"]
    assert resultat.pages[-1].fin == resultat.texte.longueur


def test_ni_separateur_avant_la_premiere_page_ni_apres_la_derniere() -> None:
    texte = joindre_pages(["a", "b", "c"]).texte.texte
    assert texte == "a\fb\fc"


def test_page_blanche_au_milieu_garde_un_intervalle_vide() -> None:
    resultat = joindre_pages(["avant", "", "après"])

    assert resultat.texte.texte == "avant\f\faprès"
    assert resultat.pages == (Page(1, 0, 5), Page(2, 6, 6), Page(3, 7, 12))


def test_intervalles_en_points_de_code_apres_nfc() -> None:
    resultat = joindre_pages(["e\u0301te\u0301 😀", "suite"])

    assert resultat.texte.texte == "été 😀\fsuite"
    assert resultat.pages == (Page(1, 0, 5), Page(2, 6, 11))


def test_crlf_d_une_page_converti_avant_le_calcul_des_intervalles() -> None:
    resultat = joindre_pages(["a\r\nb", "c"])
    assert resultat.pages == (Page(1, 0, 3), Page(2, 4, 5))


def test_toutes_les_pages_blanches_sans_couche_texte_refus() -> None:
    with pytest.raises(ExtractionRefusee, match="sans couche texte"):
        joindre_pages(["", " \n ", "\u00a0"])


def test_document_sans_aucune_page_refus() -> None:
    with pytest.raises(ExtractionRefusee, match="sans couche texte"):
        joindre_pages([])


def test_page_contenant_deja_un_saut_de_page_refus() -> None:
    with pytest.raises(ExtractionRefusee, match="page 2 contient déjà le séparateur"):
        joindre_pages(["a", "b\fc"])


PAGES = (Page(1, 0, 8), Page(2, 9, 19))


def test_page_d_une_citation_contenue_dans_une_page() -> None:
    assert page_de(PAGES, 0, 4) == 1
    assert page_de(PAGES, 9, 19) == 2


def test_citation_jusqu_a_la_derniere_lettre_d_une_page_reste_sur_cette_page() -> None:
    assert page_de(PAGES, 5, 8) == 1


@pytest.mark.parametrize(
    ("debut", "fin"),
    [
        (5, 12),  # à cheval sur deux pages
        (8, 9),  # le séparateur seul
        (7, 9),  # déborde sur le séparateur
        (15, 25),  # sort du texte
        (3, 3),  # intervalle vide
    ],
)
def test_citation_sans_page_unique_erreur(debut: int, fin: int) -> None:
    with pytest.raises(CitationSansPageUnique):
        page_de(PAGES, debut, fin)
