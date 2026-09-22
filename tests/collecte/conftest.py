"""Expose les fixtures de `doubles.py` à tous les tests de collecte."""

from tests.collecte.doubles import horloge, racine, serveur_local

__all__ = ["horloge", "racine", "serveur_local"]
