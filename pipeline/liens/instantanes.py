"""Instantané Wayback existant le plus proche d'un instant, par l'API de disponibilité (D20, D21).

`GET https://archive.org/wayback/available?url=<lien>&timestamp=<AAAAMMJJhhmmss UTC>`. Pour un lien
`inaccessible` ou `non_testable`, on cherche, on ne crée jamais. Seule une URL d'instantané daté
`/web/<14 chiffres>/` renvoyée par le service peut devenir `archive_url` ; une réponse qui n'en
porte pas est une absence (le service le dit) ou un échec (la réponse n'a pas la forme attendue),
consigné, jamais comblé.

D21 : un instantané n'est retenu que si le statut renvoyé par l'API est exactement `"200"` ; sinon,
statut absent compris, il est écarté (`InstantaneEcarte`) et consigné avec son statut. Un instantané
retenu porte l'URL de sa version brute, `https://web.archive.org/web/<14 chiffres>id_/<url>`, que le
passage télécharge.
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
MOTIF_INSTANTANE = re.compile(r"https?://web\.archive\.org/web/([0-9]{14})/(.+)")
STATUT_RETENU = "200"
"""D21 : seul un instantané de ce statut, tel que l'API le renvoie (une chaîne), est retenu."""


@dataclass(frozen=True)
class InstantaneTrouve:
    """Instantané de statut 200 : sa version brute est à télécharger."""

    archive_url: str
    """L'URL d'instantané renvoyée par le service, telle quelle."""
    horodatage: str
    """Les 14 chiffres de l'URL d'instantané (UTC), tels que renvoyés."""
    url_brute: str
    """`https://web.archive.org/web/<horodatage>id_/<url>` : les octets archivés, sans bandeau."""


@dataclass(frozen=True)
class InstantaneEcarte:
    """Instantané dont le statut renvoyé n'est pas 200 (D21) : consigné, jamais retenu."""

    url_instantane: str
    horodatage: str
    statut: str | None
    """Le code capturé par la Wayback Machine, tel que renvoyé ; `None` s'il est absent."""


@dataclass(frozen=True)
class InstantaneAbsent:
    pass


@dataclass(frozen=True)
class RechercheEchouee:
    motif: str


Recherche = InstantaneTrouve | InstantaneEcarte | InstantaneAbsent | RechercheEchouee


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
    archive_url, horodatage, cible = correspondance.group(0), correspondance.group(1), correspondance.group(2)
    if statut != STATUT_RETENU:
        return InstantaneEcarte(url_instantane=archive_url, horodatage=horodatage, statut=statut)
    url_brute = f"https://web.archive.org/web/{horodatage}id_/{cible}"
    return InstantaneTrouve(archive_url=archive_url, horodatage=horodatage, url_brute=url_brute)


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
