"""Sauvegarde Wayback Machine par appel HTTP direct à Save Page Now (décision D2).

`GET https://web.archive.org/save/<url>`. Le service répond, en cas de succès, par une redirection
(`Location`) ou un en-tête `Content-Location` vers l'instantané daté `/web/<AAAAMMJJhhmmss>/<url>`.
Seule une telle URL, renvoyée par le service, devient `archive_url` : aucun lien d'archive n'est
jamais fabriqué. Sans elle, l'archivage est en échec, consigné comme tel dans le manifeste.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urljoin

from pipeline.collecte.horloge import Horloge
from pipeline.collecte.politesse import AGENT_UTILISATEUR, Cadence, hote
from pipeline.collecte.reseau import ErreurReseau, ReponseHttp, Transport

BASE_WAYBACK = "https://web.archive.org"
SERVICE = "wayback_save_page_now"
TENTATIVES = 3
ESPACEMENT_S = 10.0
EN_TETES_INSTANTANE = ("location", "content-location")


@dataclass(frozen=True)
class ArchivageReussi:
    archive_url: str


@dataclass(frozen=True)
class ArchivageEchoue:
    motif: str
    """Motif de la dernière tentative."""
    tentatives: int


Resultat = ArchivageReussi | ArchivageEchoue


class Archiveur(Protocol):
    def sauvegarder(self, url: str) -> Resultat: ...


class ArchiveurWayback:
    def __init__(
        self,
        transport: Transport,
        cadence: Cadence,
        horloge: Horloge,
        base: str = BASE_WAYBACK,
        tentatives: int = TENTATIVES,
        espacement_s: float = ESPACEMENT_S,
    ) -> None:
        if tentatives < 1:
            raise ValueError("au moins une tentative")
        self._transport = transport
        self._cadence = cadence
        self._horloge = horloge
        self._base = base.rstrip("/")
        self._tentatives = tentatives
        self._espacement_s = espacement_s
        self._motif_instantane = re.compile(rf"{re.escape(self._base)}/web/[0-9]{{14}}/.+")

    def sauvegarder(self, url: str) -> Resultat:
        motifs: list[str] = []
        for numero in range(1, self._tentatives + 1):
            if numero > 1:
                self._horloge.dormir(self._espacement_s)
            resultat = self._tenter(url)
            if isinstance(resultat, ArchivageReussi):
                return resultat
            motifs.append(resultat)
        return ArchivageEchoue(motif=motifs[-1], tentatives=len(motifs))

    def _tenter(self, url: str) -> ArchivageReussi | str:
        demande = f"{self._base}/save/{url}"
        self._cadence.attendre(hote(demande))
        try:
            reponse = self._transport.envoyer(demande, {"User-Agent": AGENT_UTILISATEUR})
        except ErreurReseau as erreur:
            return str(erreur)
        instantane = self._instantane(reponse)
        if instantane is None:
            return f"HTTP {reponse.statut} sans instantané daté"
        return ArchivageReussi(archive_url=instantane)

    def _instantane(self, reponse: ReponseHttp) -> str | None:
        for en_tete in EN_TETES_INSTANTANE:
            if en_tete not in reponse.en_tetes:
                continue
            cible = urljoin(f"{self._base}/", reponse.en_tetes[en_tete])
            if self._motif_instantane.fullmatch(cible):
                return cible
        return None
