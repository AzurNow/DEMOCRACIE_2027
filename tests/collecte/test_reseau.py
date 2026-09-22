"""Le vrai transport urllib, exercé contre un serveur local sur 127.0.0.1."""

from __future__ import annotations

import pytest

from pipeline.collecte.reseau import ErreurReseau, TransportUrllib
from tests.collecte.doubles import RouteLocale, ServeurLocal

BOM_CRLF = b"\xef\xbb\xbfLigne une\r\nLigne deux\r\n"


def test_transport_rend_les_octets_recus_sans_les_toucher(serveur_local: ServeurLocal) -> None:
    serveur_local.routes["/doc"] = RouteLocale(200, BOM_CRLF, (("Content-Type", "text/plain"),))

    reponse = TransportUrllib(delai_s=5).envoyer(f"{serveur_local.base}/doc", {})

    assert reponse.statut == 200
    assert reponse.corps == BOM_CRLF
    assert reponse.en_tetes["content-type"] == "text/plain"


def test_transport_ne_suit_pas_les_redirections_lui_meme(serveur_local: ServeurLocal) -> None:
    serveur_local.routes["/ancien"] = RouteLocale(301, b"", (("Location", "/nouveau"),))

    reponse = TransportUrllib(delai_s=5).envoyer(f"{serveur_local.base}/ancien", {})

    assert reponse.statut == 301
    assert reponse.en_tetes["location"] == "/nouveau"
    assert serveur_local.vus == ["/ancien"]


def test_transport_rend_un_404_comme_une_reponse(serveur_local: ServeurLocal) -> None:
    reponse = TransportUrllib(delai_s=5).envoyer(f"{serveur_local.base}/absent", {})
    assert reponse.statut == 404


def test_transport_envoie_les_en_tetes_demandes(serveur_local: ServeurLocal) -> None:
    serveur_local.routes["/doc"] = RouteLocale(200, b"x")
    TransportUrllib(delai_s=5).envoyer(f"{serveur_local.base}/doc", {"User-Agent": "Essai/1"})
    assert serveur_local.agents == ["Essai/1"]


def test_delai_depasse_leve_une_erreur_reseau(serveur_local: ServeurLocal) -> None:
    serveur_local.routes["/lent"] = RouteLocale(200, b"x", attente_s=1.0)

    with pytest.raises(ErreurReseau, match="délai"):
        TransportUrllib(delai_s=0.2).envoyer(f"{serveur_local.base}/lent", {})


def test_hote_injoignable_leve_une_erreur_reseau() -> None:
    with pytest.raises(ErreurReseau):
        TransportUrllib(delai_s=1).envoyer("http://127.0.0.1:1/rien", {})
