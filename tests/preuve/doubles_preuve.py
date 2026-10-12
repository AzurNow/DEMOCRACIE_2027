"""Doubles de la commande `preuve` : un seul `TransportFactice` sert la page, robots.txt et Save Page Now.

Aucune requête réelle : une URL absente des routes fait échouer le test.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from pipeline.collecte.politesse import Cadence, ClientPoli
from pipeline.collecte.wayback import ArchiveurWayback
from pipeline.preuve.traitement import Dependances
from tests.collecte.doubles import INSTANT_FIXE, HorlogeFactice, Route, TransportFactice, reponse

PAGE = "<!DOCTYPE html>\r\n<p>Déclaration — « candidature »</p>\r\n".encode()
HTML = "text/html; charset=utf-8"
ROBOTS_LIBRE = reponse(404)


@dataclass
class Banc:
    transport: TransportFactice
    deps: Dependances


def instantane(url: str) -> str:
    return f"https://web.archive.org/web/20261009101500/{url}"


def robots(url: str) -> str:
    morceaux = url.split("/", 3)
    return f"{morceaux[0]}//{morceaux[2]}/robots.txt"


def routes_nominales(url: str, corps: bytes = PAGE) -> dict[str, Route]:
    """Robots.txt absent (tout permis), page en 200, Save Page Now qui renvoie son instantané."""
    return {
        robots(url): ROBOTS_LIBRE,
        url: reponse(200, corps, content_type=HTML),
        f"https://web.archive.org/save/{url}": reponse(302, location=instantane(url)),
    }


def banc(routes: dict[str, Route], dossier: Path) -> Banc:
    horloge = HorlogeFactice(instant=INSTANT_FIXE)
    transport = TransportFactice(horloge, routes)
    cadence = Cadence(horloge, intervalle_s=1.0)
    deps = Dependances(
        client=ClientPoli(transport, cadence),
        archiveur=ArchiveurWayback(transport, cadence, horloge),
        horloge=horloge,
        dossier=dossier,
    )
    return Banc(transport, deps)
