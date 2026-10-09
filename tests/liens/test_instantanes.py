"""Recherche de l'instantané Wayback existant le plus proche, sans jamais en créer (D20 cas 13, D21).

API de disponibilité : `GET https://archive.org/wayback/available?url=…&timestamp=AAAAMMJJhhmmss`.
Seule une URL d'instantané daté renvoyée par le service, de statut 200, est retenue ; rien n'est
fabriqué. D21 : un instantané de statut autre que 200 (ou sans statut) est écarté, avec son statut.
D22 : le chercheur reçoit l'URI déjà convertie (règle `conversion_iri` de la table) et construit la
version brute (`id_`) sur elle ; l'instantané réellement servi se lit dans l'URL finale du
téléchargement (`instantane_servi`).
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from pipeline.collecte.politesse import Cadence
from pipeline.collecte.reseau import DelaiDepasse
from pipeline.liens.instantanes import (
    ChercheurInstantanes,
    InstantaneAbsent,
    InstantaneEcarte,
    InstantaneTrouve,
    RechercheEchouee,
    instantane_servi,
)
from pipeline.liens.sonde import AGENT_LIENS
from tests.collecte.doubles import HorlogeFactice, Route, TransportFactice, reponse

LIEN = "https://example.org/page?a=1&b=2"
PARIS_HIVER = timezone(timedelta(hours=1))
INSTANT = datetime(2026, 12, 1, 7, 30, 5, tzinfo=PARIS_HIVER)
DEMANDE = (
    "https://archive.org/wayback/available?url=https%3A%2F%2Fexample.org%2Fpage%3Fa%3D1%26b%3D2"
    "&timestamp=20261201063005"
)
INSTANTANE = "http://web.archive.org/web/20261130101010/https://example.org/page?a=1&b=2"
BRUTE = "https://web.archive.org/web/20261130101010id_/https://example.org/page?a=1&b=2"


def _json(contenu: object) -> bytes:
    return json.dumps(contenu).encode("utf-8")


def _chercheur(horloge: HorlogeFactice, route: Route) -> tuple[ChercheurInstantanes, TransportFactice]:
    transport = TransportFactice(horloge, {DEMANDE: route})
    return ChercheurInstantanes(transport, Cadence(horloge, 1.0)), transport


def test_cas_13_demande_a_l_instant_de_reference_en_utc(horloge: HorlogeFactice) -> None:
    corps = _json({"archived_snapshots": {"closest": {"available": True, "url": INSTANTANE, "timestamp": "20261130101010", "status": "200"}}})
    chercheur, transport = _chercheur(horloge, reponse(200, corps))

    resultat = chercheur.chercher(LIEN, INSTANT)

    assert resultat == InstantaneTrouve(url_instantane=INSTANTANE, horodatage="20261130101010", url_brute=BRUTE)
    assert transport.urls() == [DEMANDE]
    assert transport.requetes[0][2] == {"User-Agent": AGENT_LIENS}


def test_cas_13_api_sans_instantane(horloge: HorlogeFactice) -> None:
    chercheur, _transport = _chercheur(horloge, reponse(200, _json({"url": LIEN, "archived_snapshots": {}})))
    assert chercheur.chercher(LIEN, INSTANT) == InstantaneAbsent()


def test_instantane_declare_indisponible(horloge: HorlogeFactice) -> None:
    corps = _json({"archived_snapshots": {"closest": {"available": False, "url": INSTANTANE}}})
    chercheur, _transport = _chercheur(horloge, reponse(200, corps))
    assert chercheur.chercher(LIEN, INSTANT) == InstantaneAbsent()


def test_cas_13_api_en_erreur_http(horloge: HorlogeFactice) -> None:
    chercheur, _transport = _chercheur(horloge, reponse(503, b"indisponible"))
    resultat = chercheur.chercher(LIEN, INSTANT)
    assert isinstance(resultat, RechercheEchouee)
    assert "503" in resultat.motif


def test_cas_13_api_en_erreur_reseau(horloge: HorlogeFactice) -> None:
    chercheur, _transport = _chercheur(horloge, DelaiDepasse("délai dépassé (30 s)"))
    assert chercheur.chercher(LIEN, INSTANT) == RechercheEchouee(motif="délai dépassé (30 s)")


def test_reponse_non_json_est_un_echec(horloge: HorlogeFactice) -> None:
    chercheur, _transport = _chercheur(horloge, reponse(200, b"<html>"))
    assert isinstance(chercheur.chercher(LIEN, INSTANT), RechercheEchouee)


def test_url_d_instantane_non_datee_n_est_jamais_retenue(horloge: HorlogeFactice) -> None:
    corps = _json({"archived_snapshots": {"closest": {"available": True, "url": "https://web.archive.org/save/x"}}})
    chercheur, _transport = _chercheur(horloge, reponse(200, corps))
    resultat = chercheur.chercher(LIEN, INSTANT)
    assert isinstance(resultat, RechercheEchouee)
    assert "instantané daté" in resultat.motif


def _proche(**champs: object) -> bytes:
    return _json({"archived_snapshots": {"closest": {"available": True, "url": INSTANTANE, **champs}}})


def test_d21_cas_8_instantane_404_ecarte_avec_son_statut(horloge: HorlogeFactice) -> None:
    chercheur, _transport = _chercheur(horloge, reponse(200, _proche(status="404")))
    assert chercheur.chercher(LIEN, INSTANT) == InstantaneEcarte(INSTANTANE, "20261130101010", "404")


@pytest.mark.parametrize("statut", ["301", "302", "500", "2OO"])
def test_d21_instantane_de_statut_autre_que_200_ecarte(horloge: HorlogeFactice, statut: str) -> None:
    chercheur, _transport = _chercheur(horloge, reponse(200, _proche(status=statut)))
    assert chercheur.chercher(LIEN, INSTANT) == InstantaneEcarte(INSTANTANE, "20261130101010", statut)


def test_d21_instantane_sans_statut_ecarte_statut_absent(horloge: HorlogeFactice) -> None:
    """D22, point 3 : le statut n'est pas 200 s'il n'est pas renvoyé : écarté, statut consigné comme absent."""
    chercheur, _transport = _chercheur(horloge, reponse(200, _proche()))
    assert chercheur.chercher(LIEN, INSTANT) == InstantaneEcarte(INSTANTANE, "20261130101010", None)


def test_d22_cas_4_statut_null_ecarte_comme_statut_absent(horloge: HorlogeFactice) -> None:
    """Un `status` présent mais `null` n'est pas `"200"` : écarté, statut consigné comme absent."""
    chercheur, _transport = _chercheur(horloge, reponse(200, _proche(status=None)))
    assert chercheur.chercher(LIEN, INSTANT) == InstantaneEcarte(INSTANTANE, "20261130101010", None)


def test_d21_url_brute_en_id_vers_https_meme_si_le_service_renvoie_http(horloge: HorlogeFactice) -> None:
    chercheur, _transport = _chercheur(horloge, reponse(200, _proche(status="200")))
    resultat = chercheur.chercher(LIEN, INSTANT)
    assert isinstance(resultat, InstantaneTrouve)
    assert resultat.url_instantane == INSTANTANE
    assert resultat.url_brute == BRUTE


# ------------------------------------------------------------------------------ D22


URI = "https://xn--bcher-kva.example/programme/%C3%A9ducation?p=%C3%A0"
DEMANDE_URI = (
    "https://archive.org/wayback/available?url=https%3A%2F%2Fxn--bcher-kva.example%2Fprogramme%2F%25C3%25A9ducation"
    "%3Fp%3D%25C3%25A0&timestamp=20261201063005"
)


def test_d22_cas_5_requete_et_url_id_construites_sur_l_uri_recue(horloge: HorlogeFactice) -> None:
    """Le chercheur reçoit l'URI convertie : il la demande telle quelle à l'API, et la version brute
    est construite sur elle, pas sur la cible que le service renvoie dans son URL d'instantané."""
    renvoyee = "http://web.archive.org/web/20261130101010/http://xn--bcher-kva.example:80/programme/%C3%A9ducation?p=%C3%A0"
    corps = _json({"archived_snapshots": {"closest": {"available": True, "url": renvoyee, "status": "200"}}})
    transport = TransportFactice(horloge, {DEMANDE_URI: reponse(200, corps)})

    resultat = ChercheurInstantanes(transport, Cadence(horloge, 1.0)).chercher(URI, INSTANT)

    assert transport.urls() == [DEMANDE_URI]
    assert resultat == InstantaneTrouve(
        url_instantane=renvoyee, horodatage="20261130101010", url_brute=f"https://web.archive.org/web/20261130101010id_/{URI}"
    )


def test_d22_cas_1_instantane_servi_lu_dans_l_url_finale_sans_id() -> None:
    finale = "https://web.archive.org/web/20261128093000id_/https://example.org/page?a=1&b=2"
    assert instantane_servi(finale) == "https://web.archive.org/web/20261128093000/https://example.org/page?a=1&b=2"


def test_d22_instantane_servi_garde_le_schema_de_l_url_finale() -> None:
    """Dérivé de l'URL finale, rien d'autre : servi en http, l'instantané public reste en http."""
    finale = "http://web.archive.org/web/20261128093000id_/https://example.org/page"
    assert instantane_servi(finale) == "http://web.archive.org/web/20261128093000/https://example.org/page"


def test_d22_cas_2_instantane_servi_a_la_date_demandee() -> None:
    assert instantane_servi(BRUTE) == "https://web.archive.org/web/20261130101010/https://example.org/page?a=1&b=2"


@pytest.mark.parametrize(
    "finale",
    [
        "https://web.archive.org/web/20261130101010/https://example.org/page",  # sans id_ : page avec bandeau
        "https://web.archive.org/web/2026113010101id_/https://example.org/page",  # 13 chiffres
        "https://web.archive.org/web/20261130101010im_/https://example.org/page",  # autre mode
        "https://web.archive.org/web/20261130101010id_/",  # sans URL archivée
        "https://web.archive.org/erreur/introuvable",  # page d'erreur du service
        "https://archive.org/web/20261130101010id_/https://example.org/page",  # autre hôte
        "https://web.archive.org.example/web/20261130101010id_/https://example.org/page",  # hôte imitant
        "https://example.org/page",  # renvoyé hors de la Wayback Machine
        "ftp://web.archive.org/web/20261130101010id_/https://example.org/page",  # autre schéma
    ],
)
def test_d22_cas_3_url_finale_hors_forme_aucun_instantane_servi(finale: str) -> None:
    assert instantane_servi(finale) is None
