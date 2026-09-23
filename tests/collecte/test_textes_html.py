"""Texte canonique d'une page HTML (`docs/CONTRATS.md` §1.3) : encodage déclaré ou refus, rendu en lignes."""

from __future__ import annotations

import codecs

import pytest

from pipeline.collecte.textes.fiche import Encodage
from pipeline.collecte.textes.page_html import REGLE, decoder, extraire_html, rendre
from pipeline.collecte.textes.refus import ExtractionRefusee

UTF8 = "text/html; charset=utf-8"

# ----------------------------------------------------------------- encodage


def test_charset_du_content_type() -> None:
    texte, encodage = decoder("<p>été</p>".encode(), "text/html; charset=UTF-8")
    assert texte == "<p>été</p>"
    assert encodage == Encodage("utf-8", "content-type")


def test_charset_entre_guillemets_dans_le_content_type() -> None:
    _, encodage = decoder(b"<p>a</p>", 'text/html; charset="utf-8"')
    assert encodage == Encodage("utf-8", "content-type")


def test_meta_charset_sans_content_type() -> None:
    octets = '<html><head><meta charset="utf-8"></head><p>été</p>'.encode()
    texte, encodage = decoder(octets, "text/html")
    assert "été" in texte
    assert encodage == Encodage("utf-8", "meta")


def test_meta_http_equiv() -> None:
    octets = '<meta http-equiv="Content-Type" content="text/html; charset=windows-1252"><p>\x92</p>'.encode("latin-1")
    texte, encodage = decoder(octets, None)
    assert "\u2019" in texte
    assert encodage == Encodage("cp1252", "meta")


def test_bom_utf8_prime_sur_un_content_type_contraire_et_n_entre_pas_dans_le_texte() -> None:
    octets = codecs.BOM_UTF8 + "<p>été</p>".encode()
    texte, encodage = decoder(octets, "text/html; charset=iso-8859-1")
    assert texte == "<p>été</p>"
    assert encodage == Encodage("utf-8", "bom")


def test_bom_utf16_le() -> None:
    octets = codecs.BOM_UTF16_LE + "<p>été</p>".encode("utf-16-le")
    texte, encodage = decoder(octets, None)
    assert texte == "<p>été</p>"
    assert encodage == Encodage("utf-16-le", "bom")


def test_content_type_prime_sur_meta() -> None:
    octets = '<meta charset="iso-8859-15"><p>été</p>'.encode()
    _, encodage = decoder(octets, UTF8)
    assert encodage == Encodage("utf-8", "content-type")


def test_meta_au_dela_des_1024_premiers_octets_ignore() -> None:
    octets = b"<!--" + b"x" * 1100 + b'--><meta charset="utf-8"><p>a</p>'
    with pytest.raises(ExtractionRefusee, match="aucun encodage déclaré"):
        decoder(octets, "text/html")


@pytest.mark.parametrize("etiquette", ["iso-8859-1", "ISO-8859-1", "latin1", "us-ascii", "ascii"])
def test_latin1_et_ascii_lus_en_cp1252_comme_un_navigateur(etiquette: str) -> None:
    texte, encodage = decoder(b"<p>l\x92\xe9t\xe9</p>", f"text/html; charset={etiquette}")
    assert texte == "<p>l\u2019été</p>"
    assert encodage == Encodage("cp1252", "content-type")


def test_aucun_encodage_declare_refus_jamais_suppose() -> None:
    with pytest.raises(ExtractionRefusee, match="aucun encodage déclaré"):
        decoder("<p>été</p>".encode(), "text/html")


def test_aucun_content_type_et_aucune_meta_refus() -> None:
    with pytest.raises(ExtractionRefusee, match="aucun encodage déclaré"):
        decoder(b"<p>a</p>", None)


def test_encodage_inconnu_refus() -> None:
    with pytest.raises(ExtractionRefusee, match="encodage inconnu 'klingon-8' déclaré par content-type"):
        decoder(b"<p>a</p>", "text/html; charset=klingon-8")


def test_octet_invalide_pour_l_encodage_declare_refus() -> None:
    with pytest.raises(ExtractionRefusee, match="octet invalide pour utf-8"):
        decoder(b"<p>\xe9t\xe9</p>", UTF8)


# ----------------------------------------------------------------- rendu


def test_script_style_noscript_template_et_commentaires_ignores() -> None:
    document = (
        "<head><style>p{color:red}</style><script>var a = '<p>faux</p>';</script></head>"
        "<body><!-- note --><noscript>Activez JS</noscript>"
        "<template><p>gabarit <template>imbriqué</template> encore</p></template><p>Vrai</p></body>"
    )
    assert rendre(document) == "Vrai"


def test_balise_fermante_orpheline_d_un_element_ignore_ne_bloque_pas_la_suite() -> None:
    assert rendre("</script><p>Texte</p>") == "Texte"


def test_blocs_imbriques_coupent_les_lignes_sans_ligne_vide() -> None:
    document = "<div><h1>Titre</h1><div><p>Un</p><ul><li>deux</li><li>trois</li></ul></div></div>"
    assert rendre(document) == "Titre\nUn\ndeux\ntrois"


def test_elements_en_ligne_ne_coupent_pas() -> None:
    assert rendre("<p>Pro<b>gramme</b> <a href='#'>commun</a><span>.</span></p>") == "Programme commun."


def test_suites_d_espaces_ascii_ramenees_a_une_espace_et_bords_retires() -> None:
    assert rendre("<p>  Une\n\t phrase\r\n   longue  </p>") == "Une phrase longue"


def test_br_coupe_la_ligne() -> None:
    assert rendre("<p>ligne un<br>ligne deux<br/>ligne trois</p>") == "ligne un\nligne deux\nligne trois"


def test_entites_decodees_et_espace_insecable_conserve() -> None:
    assert rendre("<p>&laquo;&nbsp;Oui&nbsp;&raquo; &amp; l&#8217;autre</p>") == "«\u00a0Oui\u00a0» & l\u2019autre"


def test_espace_insecable_en_bord_de_ligne_conserve() -> None:
    assert rendre("<p>\u00a0retrait</p>") == "\u00a0retrait"


def test_trait_d_union_conditionnel_et_coquille_conserves() -> None:
    assert rendre("<p>re&shy;traite programe</p>") == "re\u00adtraite programe"


def test_pre_suit_la_regle_des_autres_blocs() -> None:
    assert rendre("<pre>a\n\n   b</pre>") == "a b"


def test_texte_hors_de_tout_bloc() -> None:
    assert rendre("Bonjour <b>à</b> tous") == "Bonjour à tous"


# ----------------------------------------------------------------- extraction complète


def test_extraction_complete_nfc_encodage_et_regle() -> None:
    octets = "<p>e\u0301te\u0301</p>\r\n<p>fin</p>".encode()
    extraction = extraire_html(octets, UTF8)

    assert extraction.texte.texte == "été\nfin"
    assert extraction.outil == "html.parser"
    assert extraction.options == {"regle": REGLE}
    assert extraction.encodage == Encodage("utf-8", "content-type")
    assert extraction.pages is None


def test_page_sans_texte_refus() -> None:
    with pytest.raises(ExtractionRefusee, match="page HTML sans texte"):
        extraire_html(b"<html><script>seul</script><p>  </p></html>", UTF8)
