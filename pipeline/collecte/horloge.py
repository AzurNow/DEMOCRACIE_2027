"""Horloge injectable : l'instant de collecte, le temps monotone de la cadence, le sommeil.

Injectée partout pour que les tests soient déterministes et n'attendent jamais pour de vrai.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Protocol


class Horloge(Protocol):
    def maintenant(self) -> datetime:
        """Instant courant, avec son décalage horaire."""
        ...

    def monotone(self) -> float:
        """Secondes d'une horloge monotone, pour mesurer des intervalles."""
        ...

    def dormir(self, secondes: float) -> None: ...


class HorlogeSysteme:
    def maintenant(self) -> datetime:
        return datetime.now().astimezone()

    def monotone(self) -> float:
        return time.monotonic()

    def dormir(self, secondes: float) -> None:
        time.sleep(secondes)


def instant_iso(instant: datetime) -> str:
    """ISO 8601 à la seconde, décalage explicite obligatoire (`commun#/$defs/instant`)."""
    if instant.utcoffset() is None:
        raise ValueError(f"instant sans décalage horaire : {instant!r}")
    return instant.isoformat(timespec="seconds")
