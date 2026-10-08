"""Conversion IRI → URI pour l'envoi seulement (D21, point 2 ; RFC 3987 §3.1).

Les caractères non ASCII du chemin, de la requête et du fragment sont encodés en UTF-8 puis en
`%XX` ; l'hôte non ASCII passe par le codec `idna`. Tout caractère ASCII reste tel qu'écrit, `%XX`
déjà présents compris : une URL ASCII sort identique. Une IRI qu'on ne sait pas convertir lève
`IriInconvertible`, jamais une conversion approchée.
"""

from __future__ import annotations

import pytest

from pipeline.liens.iri import CONVERSIONS_IRI, IriInconvertible, iri_vers_uri


def test_accent_dans_le_chemin_encode_en_utf8() -> None:
    assert iri_vers_uri("https://fr.wikipedia.org/wiki/Éducation") == "https://fr.wikipedia.org/wiki/%C3%89ducation"


def test_requete_et_fragment_non_ascii_encodes() -> None:
    assert iri_vers_uri("https://example.org/r?q=élu&x=1#§2") == "https://example.org/r?q=%C3%A9lu&x=1#%C2%A72"


def test_hote_idn_en_xn() -> None:
    assert iri_vers_uri("https://bücher.example/") == "https://xn--bcher-kva.example/"


def test_hote_idn_avec_port_et_identifiants() -> None:
    assert iri_vers_uri("https://moi@bücher.example:8443/é") == "https://moi@xn--bcher-kva.example:8443/%C3%A9"


def test_pourcent_deja_encode_non_reencode() -> None:
    assert iri_vers_uri("https://example.org/%C3%89cole/é") == "https://example.org/%C3%89cole/%C3%A9"


def test_url_ascii_sort_identique_y_compris_caracteres_ascii_hors_norme() -> None:
    for url in ("https://Example.org/A|B{c}?x=%zz&y=[1]#f", "HTTPS://example.org", "https://example.org/a?"):
        assert iri_vers_uri(url) == url


def test_casse_de_l_hote_ascii_et_du_schema_conservee() -> None:
    assert iri_vers_uri("HTTPS://Exemple.ORG/é") == "HTTPS://Exemple.ORG/%C3%A9"


def test_etiquette_d_hote_trop_longue_inconvertible() -> None:
    with pytest.raises(IriInconvertible):
        iri_vers_uri("https://" + "ü" * 64 + ".example/")


def test_etiquette_d_hote_vide_inconvertible() -> None:
    with pytest.raises(IriInconvertible):
        iri_vers_uri("https://bücher..example/")


def test_ipv6_non_ascii_inconvertible() -> None:
    with pytest.raises(IriInconvertible):
        iri_vers_uri("https://[::é]/x")


def test_la_regle_declaree_par_la_table_est_enregistree() -> None:
    assert CONVERSIONS_IRI == {"rfc3987-3.1": iri_vers_uri}
