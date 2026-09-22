"""Transport HTTP : une requête GET, une réponse, sans suivre les redirections.

Les redirections sont suivies plus haut (`politesse.py`), une étape à la fois, pour que chaque étape
passe par la cadence et par robots.txt, et que le schéma de chaque cible soit vérifié.
"""

from __future__ import annotations

import http.client
import socket
import urllib.error
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ReponseHttp:
    statut: int
    en_tetes: Mapping[str, str]
    """Noms d'en-têtes en minuscules. Un en-tête absent est absent, jamais remplacé."""
    corps: bytes


class ErreurReseau(Exception):
    """Aucune réponse HTTP exploitable : délai dépassé, connexion refusée, corps tronqué."""


class Transport(Protocol):
    def envoyer(self, url: str, en_tetes: dict[str, str]) -> ReponseHttp: ...


class _SansRedirection(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: object, **kwargs: object) -> None:
        return None


def _en_tetes(message: http.client.HTTPMessage) -> dict[str, str]:
    return {cle.lower(): valeur for cle, valeur in message.items()}


class TransportUrllib:
    """Transport réel, bibliothèque standard seulement (décision D2)."""

    def __init__(self, delai_s: float) -> None:
        self._delai_s = delai_s
        self._ouvreur = urllib.request.build_opener(_SansRedirection)

    def envoyer(self, url: str, en_tetes: dict[str, str]) -> ReponseHttp:
        requete = urllib.request.Request(url, headers=en_tetes, method="GET")
        try:
            with self._ouvreur.open(requete, timeout=self._delai_s) as flux:
                return ReponseHttp(flux.status, _en_tetes(flux.headers), flux.read())
        except urllib.error.HTTPError as erreur:
            return self._reponse_d_erreur(erreur)
        except (TimeoutError, socket.timeout) as erreur:
            raise ErreurReseau(f"délai dépassé ({self._delai_s:g} s)") from erreur
        except (OSError, http.client.HTTPException) as erreur:
            raise ErreurReseau(_motif_reseau(erreur, self._delai_s)) from erreur

    def _reponse_d_erreur(self, erreur: urllib.error.HTTPError) -> ReponseHttp:
        """4xx, 5xx et 3xx non suivis : ce sont des réponses, pas des pannes du réseau."""
        try:
            corps = erreur.read()
        except (OSError, http.client.HTTPException) as lecture:
            raise ErreurReseau(f"HTTP {erreur.code}, corps illisible : {lecture}") from lecture
        return ReponseHttp(erreur.code, _en_tetes(erreur.headers), corps)


def _motif_reseau(erreur: BaseException, delai_s: float) -> str:
    """`URLError` enveloppe la cause dans `reason` ; les autres erreurs sont leur propre cause."""
    raison = erreur.reason if isinstance(erreur, urllib.error.URLError) else None
    if isinstance(raison, (TimeoutError, socket.timeout)):
        return f"délai dépassé ({delai_s:g} s)"
    detail = raison if raison is not None else erreur
    return f"erreur réseau : {type(detail).__name__}: {detail}"
