"""Refus d'extraction : un document dont on ne tire aucun texte sûr n'en reçoit aucun.

Un seul type d'exception, porteur d'un motif lisible : le rapport le nomme et le code de sortie
devient non nul. Aucun texte de substitution, aucun encodage deviné.
"""

from __future__ import annotations


class ExtractionRefusee(Exception):
    def __init__(self, motif: str) -> None:
        super().__init__(motif)
        self.motif = motif
