"""Recherche de l'instantané Wayback existant le plus proche, sans jamais en créer (D20, cas 13).

API de disponibilité : `GET https://archive.org/wayback/available?url=…&timestamp=AAAAMMJJhhmmss`.
Seule une URL d'instantané daté renvoyée par le service devient `archive_url` ; rien n'est fabriqué.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from pipeline.collecte.politesse import Cadence
from pipeline.collecte.reseau import DelaiDepasse
from pipeline.liens.instantanes import (
    ChercheurInstantanes,
    InstantaneAbsent,
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


def _json(contenu: object) -> bytes:
    return json.dumps(contenu).encode("utf-8")


def _chercheur(horloge: HorlogeFactice, route: Route) -> tuple[ChercheurInstantanes, TransportFactice]:
    transport = TransportFactice(horloge, {DEMANDE: route})
    return ChercheurInstantanes(transport, Cadence(horloge, 1.0)), transport


def test_cas_13_demande_a_l_instant_de_reference_en_utc(horloge: HorlogeFactice) -> None:
    corps = _json({"archived_snapshots": {"closest": {"available": True, "url": INSTANTANE, "timestamp": "20261130101010", "status": "200"}}})
    chercheur, transport = _chercheur(horloge, reponse(200, corps))

    resultat = chercheur.chercher(LIEN, INSTANT)

    assert resultat == InstantaneTrouve(archive_url=INSTANTANE, horodatage="20261130101010", statut="200")
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


def test_statut_absent_reste_absent(horloge: HorlogeFactice) -> None:
    corps = _json({"archived_snapshots": {"closest": {"available": True, "url": INSTANTANE}}})
    chercheur, _transport = _chercheur(horloge, reponse(200, corps))
    assert chercheur.chercher(LIEN, INSTANT) == InstantaneTrouve(INSTANTANE, "20261130101010", None)
