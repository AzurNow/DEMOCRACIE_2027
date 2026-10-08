"""Instantané Wayback existant le plus proche d'un instant, par l'API de disponibilité (D20).

`GET https://archive.org/wayback/available?url=<lien>&timestamp=<AAAAMMJJhhmmss UTC>`. Pour un lien
`inaccessible` ou `non_testable`, on cherche, on ne crée jamais. Seule une URL d'instantané daté
`/web/<14 chiffres>/` renvoyée par le service devient `archive_url` ; une réponse qui n'en porte
pas est une absence (le service le dit) ou un échec (la réponse n'a pas la forme attendue),
consigné, jamais comblé.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode

from pipeline.collecte.politesse import Cadence, hote
from pipeline.collecte.reseau import ErreurReseau, ReponseHttp, Transport
from pipeline.liens.sonde import AGENT_LIENS

BASE_DISPONIBILITE = "https://archive.org/wayback/available"
MOTIF_INSTANTANE = re.compile(r"https?://web\.archive\.org/web/([0-9]{14})/.+")


@dataclass(frozen=True)
class InstantaneTrouve:
    archive_url: str
    horodatage: str
    """Les 14 chiffres de l'URL d'instantané (UTC), tels que renvoyés."""
    statut: str | None
    """Le code HTTP capturé par la Wayback Machine, tel que renvoyé ; `None` s'il est absent."""


@dataclass(frozen=True)
class InstantaneAbsent:
    pass


@dataclass(frozen=True)
class RechercheEchouee:
    motif: str


Recherche = InstantaneTrouve | InstantaneAbsent | RechercheEchouee


def horodatage_wayback(instant: datetime) -> str:
    if instant.utcoffset() is None:
        raise ValueError(f"instant sans décalage horaire : {instant!r}")
    return instant.astimezone(UTC).strftime("%Y%m%d%H%M%S")


def _decoder(reponse: ReponseHttp) -> Any | RechercheEchouee:
    if reponse.statut != 200:
        return RechercheEchouee(f"HTTP {reponse.statut}")
    try:
        return json.loads(reponse.corps.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as erreur:
        return RechercheEchouee(f"réponse illisible : {erreur}")


def _plus_proche(contenu: Any) -> Recherche:
    instantanes = contenu.get("archived_snapshots") if isinstance(contenu, dict) else None
    if not isinstance(instantanes, dict):
        return RechercheEchouee("réponse sans archived_snapshots")
    if "closest" not in instantanes:
        return InstantaneAbsent()
    proche = instantanes["closest"]
    if not isinstance(proche, dict) or not isinstance(proche.get("available"), bool):
        return RechercheEchouee(f"closest de forme inattendue : {proche!r}")
    return _instantane(proche) if proche["available"] else InstantaneAbsent()


def _instantane(proche: dict[str, Any]) -> Recherche:
    url, statut = proche.get("url"), proche.get("status")
    correspondance = MOTIF_INSTANTANE.fullmatch(url) if isinstance(url, str) else None
    if correspondance is None:
        return RechercheEchouee(f"pas une URL d'instantané daté : {url!r}")
    if statut is not None and not isinstance(statut, str):
        return RechercheEchouee(f"status de forme inattendue : {statut!r}")
    return InstantaneTrouve(archive_url=correspondance.group(0), horodatage=correspondance.group(1), statut=statut)


class ChercheurInstantanes:
    def __init__(
        self,
        transport: Transport,
        cadence: Cadence,
        agent_utilisateur: str = AGENT_LIENS,
        base: str = BASE_DISPONIBILITE,
    ) -> None:
        self._transport = transport
        self._cadence = cadence
        self._agent = agent_utilisateur
        self._base = base

    def chercher(self, url: str, instant: datetime) -> Recherche:
        """Une seule demande ; un échec est consigné, il ne change pas le verdict du lien."""
        demande = f"{self._base}?{urlencode({'url': url, 'timestamp': horodatage_wayback(instant)})}"
        self._cadence.attendre(hote(demande))
        try:
            reponse = self._transport.envoyer(demande, {"User-Agent": self._agent})
        except ErreurReseau as erreur:
            return RechercheEchouee(str(erreur))
        contenu = _decoder(reponse)
        return contenu if isinstance(contenu, RechercheEchouee) else _plus_proche(contenu)
