"""Doubles partagés des tests de collecte (fixtures exposées par `conftest.py`).

Aucun test ne touche Internet : les échanges HTTP passent soit par `TransportFactice` (double
injecté, qui enregistre chaque requête et l'instant où elle part), soit par `serveur_local`
(`http.server` sur 127.0.0.1, port libre), qui exerce le vrai `TransportUrllib`.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from pipeline.collecte.reseau import ErreurReseau, ReponseHttp

PARIS_ETE = timezone(timedelta(hours=2))
INSTANT_FIXE = datetime(2026, 9, 22, 14, 30, 5, tzinfo=PARIS_ETE)


@dataclass
class HorlogeFactice:
    """Horloge et sommeil injectés : `dormir` avance le temps monotone sans jamais attendre."""

    instant: datetime = INSTANT_FIXE
    temps: float = 1000.0
    sommeils: list[float] = field(default_factory=list)

    def maintenant(self) -> datetime:
        return self.instant

    def monotone(self) -> float:
        return self.temps

    def dormir(self, secondes: float) -> None:
        self.sommeils.append(secondes)
        self.temps += secondes


Route = ReponseHttp | ErreurReseau | list[ReponseHttp | ErreurReseau]


@dataclass
class TransportFactice:
    """Répond depuis une table `url -> réponse`. Une liste est consommée dans l'ordre."""

    horloge: HorlogeFactice
    routes: dict[str, Route]
    requetes: list[tuple[str, float, dict[str, str]]] = field(default_factory=list)

    def envoyer(self, url: str, en_tetes: dict[str, str]) -> ReponseHttp:
        self.requetes.append((url, self.horloge.monotone(), dict(en_tetes)))
        if url not in self.routes:
            raise AssertionError(f"requête non prévue par le test : {url}")
        route = self.routes[url]
        if isinstance(route, list):
            route = route.pop(0)
        if isinstance(route, ErreurReseau):
            raise route
        return route

    def urls(self) -> list[str]:
        return [url for url, _instant, _en_tetes in self.requetes]


def reponse(statut: int = 200, corps: bytes = b"", **en_tetes: str) -> ReponseHttp:
    """Fabrique : `content_type="..."` devient l'en-tête `content-type`."""
    return ReponseHttp(
        statut=statut,
        en_tetes={cle.replace("_", "-"): valeur for cle, valeur in en_tetes.items()},
        corps=corps,
    )


# --------------------------------------------------------------------------- serveur local


@dataclass(frozen=True)
class RouteLocale:
    statut: int
    corps: bytes = b""
    en_tetes: tuple[tuple[str, str], ...] = ()
    attente_s: float = 0.0


def _fabriquer_gestionnaire(
    routes: dict[str, RouteLocale], vus: list[str], agents: list[str | None]
) -> type:
    class Gestionnaire(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            vus.append(self.path)
            agents.append(self.headers.get("User-Agent"))
            route = routes.get(self.path, RouteLocale(404, b"absent"))
            if route.attente_s:
                time.sleep(route.attente_s)
            self.send_response(route.statut)
            for cle, valeur in route.en_tetes:
                self.send_header(cle, valeur)
            self.send_header("Content-Length", str(len(route.corps)))
            self.end_headers()
            self.wfile.write(route.corps)

        def log_message(self, *args: object) -> None:
            return None

    return Gestionnaire


@dataclass
class ServeurLocal:
    base: str
    routes: dict[str, RouteLocale]
    vus: list[str]
    agents: list[str | None]


@pytest.fixture
def serveur_local() -> Iterator[ServeurLocal]:
    routes: dict[str, RouteLocale] = {}
    vus: list[str] = []
    agents: list[str | None] = []
    gestionnaire = _fabriquer_gestionnaire(routes, vus, agents)
    serveur = ThreadingHTTPServer(("127.0.0.1", 0), gestionnaire)
    serveur.daemon_threads = True
    fil = threading.Thread(target=serveur.serve_forever, daemon=True)
    fil.start()
    hote, port = serveur.server_address[0], serveur.server_address[1]
    try:
        yield ServeurLocal(base=f"http://{hote}:{port}", routes=routes, vus=vus, agents=agents)
    finally:
        serveur.shutdown()
        serveur.server_close()


@pytest.fixture
def horloge() -> HorlogeFactice:
    return HorlogeFactice()


@pytest.fixture
def racine(tmp_path: Path) -> Path:
    return tmp_path / "depot"

