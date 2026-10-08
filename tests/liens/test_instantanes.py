"""Recherche de l'instantané Wayback existant le plus proche, sans jamais en créer (D20 cas 13, D21).

API de disponibilité : `GET https://archive.org/wayback/available?url=…&timestamp=AAAAMMJJhhmmss`.
Seule une URL d'instantané daté renvoyée par le service, de statut 200, est retenue ; rien n'est
fabriqué. D21 : un instantané de statut autre que 200 (ou sans statut) est écarté, avec son statut.
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

    assert resultat == InstantaneTrouve(archive_url=INSTANTANE, horodatage="20261130101010", url_brute=BRUTE)
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
    """Le statut n'est pas 200 s'il n'est pas renvoyé : écarté, statut consigné comme absent."""
    chercheur, _transport = _chercheur(horloge, reponse(200, _proche()))
    assert chercheur.chercher(LIEN, INSTANT) == InstantaneEcarte(INSTANTANE, "20261130101010", None)


def test_d21_url_brute_en_id_vers_https_meme_si_le_service_renvoie_http(horloge: HorlogeFactice) -> None:
    chercheur, _transport = _chercheur(horloge, reponse(200, _proche(status="200")))
    resultat = chercheur.chercher(LIEN, INSTANT)
    assert isinstance(resultat, InstantaneTrouve)
    assert resultat.archive_url == INSTANTANE
    assert resultat.url_brute == BRUTE
