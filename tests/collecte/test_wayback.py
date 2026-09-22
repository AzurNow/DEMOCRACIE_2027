"""Sauvegarde Wayback Machine par appel HTTP direct à Save Page Now (cas limites 9 et 10).

Aucun `archive_url` n'est jamais fabriqué : il n'est renseigné que si la réponse du service désigne
un instantané daté.
"""

from __future__ import annotations

from pipeline.collecte.politesse import AGENT_UTILISATEUR, Cadence
from pipeline.collecte.reseau import ErreurReseau, TransportUrllib
from pipeline.collecte.wayback import ArchivageEchoue, ArchivageReussi, ArchiveurWayback
from tests.collecte.doubles import (
    HorlogeFactice,
    Route,
    RouteLocale,
    ServeurLocal,
    TransportFactice,
    reponse,
)

BASE = "https://web.archive.org"
DOC = "https://example.org/programme.pdf"
SAVE = f"{BASE}/save/{DOC}"
INSTANTANE = f"{BASE}/web/20260922123005/{DOC}"


def _archiveur(horloge: HorlogeFactice, route: Route) -> tuple[ArchiveurWayback, TransportFactice]:
    transport = TransportFactice(horloge, {SAVE: route})
    archiveur = ArchiveurWayback(transport, Cadence(horloge, 1.0), horloge, base=BASE)
    return archiveur, transport


def test_wayback_en_succes_par_redirection_vers_l_instantane(horloge: HorlogeFactice) -> None:
    archiveur, transport = _archiveur(horloge, reponse(302, location=INSTANTANE))

    assert archiveur.sauvegarder(DOC) == ArchivageReussi(archive_url=INSTANTANE)
    assert transport.urls() == [SAVE]
    assert transport.requetes[0][2]["User-Agent"] == AGENT_UTILISATEUR


def test_wayback_en_succes_par_content_location_relatif(horloge: HorlogeFactice) -> None:
    route = reponse(200, b"<html>", content_location=f"/web/20260922123005/{DOC}")
    archiveur, _transport = _archiveur(horloge, route)

    assert archiveur.sauvegarder(DOC) == ArchivageReussi(archive_url=INSTANTANE)


def test_wayback_reussit_a_la_deuxieme_tentative(horloge: HorlogeFactice) -> None:
    archiveur, transport = _archiveur(
        horloge, [reponse(503), reponse(302, location=INSTANTANE)]
    )

    assert archiveur.sauvegarder(DOC) == ArchivageReussi(archive_url=INSTANTANE)
    assert len(transport.requetes) == 2


def test_wayback_en_echec_apres_trois_tentatives_espacees(horloge: HorlogeFactice) -> None:
    archiveur, transport = _archiveur(
        horloge,
        [reponse(503), ErreurReseau("délai dépassé (120 s)"), reponse(429, b"trop")],
    )

    resultat = archiveur.sauvegarder(DOC)

    assert resultat == ArchivageEchoue(motif="HTTP 429 sans instantané daté", tentatives=3)
    assert len(transport.requetes) == 3
    instants = [instant for _url, instant, _en_tetes in transport.requetes]
    assert instants[1] - instants[0] >= 10.0
    assert instants[2] - instants[1] >= 10.0


def test_wayback_n_invente_pas_d_instantane_depuis_une_redirection_quelconque(
    horloge: HorlogeFactice,
) -> None:
    archiveur, _transport = _archiveur(horloge, reponse(302, location=f"{BASE}/save/erreur"))

    resultat = archiveur.sauvegarder(DOC)

    assert isinstance(resultat, ArchivageEchoue)
    assert resultat.tentatives == 3


def test_wayback_refuse_un_instantane_non_date(horloge: HorlogeFactice) -> None:
    archiveur, _transport = _archiveur(horloge, reponse(302, location=f"{BASE}/web/*/{DOC}"))
    assert isinstance(archiveur.sauvegarder(DOC), ArchivageEchoue)


def test_wayback_par_le_vrai_transport_contre_un_serveur_local(
    serveur_local: ServeurLocal, horloge: HorlogeFactice
) -> None:
    serveur_local.routes[f"/save/{DOC}"] = RouteLocale(
        302, b"", (("Location", f"/web/20260922123005/{DOC}"),)
    )
    archiveur = ArchiveurWayback(
        TransportUrllib(delai_s=5), Cadence(horloge, 1.0), horloge, base=serveur_local.base
    )

    resultat = archiveur.sauvegarder(DOC)

    assert resultat == ArchivageReussi(
        archive_url=f"{serveur_local.base}/web/20260922123005/{DOC}"
    )
