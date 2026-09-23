"""Forme canonique d'un texte extrait (`docs/CONTRATS.md` §1) : fins de ligne LF, puis NFC.

Ce sont les deux seules transformations admises. Rien d'autre n'est retiré ni corrigé : ni espace,
ni ligature, ni césure, ni saut de ligne final. L'ordre compte peu (NFC ne touche pas aux fins de
ligne) mais il est fixé ici, une fois.

L'unité des offsets est le point de code : `len()` d'une `str` Python les compte directement, comme
`Array.from(texte).length` côté TypeScript.
"""

from __future__ import annotations

import hashlib
import unicodedata
from dataclasses import dataclass


def canoniser(texte: str) -> str:
    """CRLF puis CR isolé deviennent LF ; le tout est ramené en NFC."""
    return unicodedata.normalize("NFC", texte.replace("\r\n", "\n").replace("\r", "\n"))


@dataclass(frozen=True)
class TexteCanonique:
    texte: str

    @property
    def octets(self) -> bytes:
        """UTF-8 sans BOM : les octets exacts du fichier `staging/textes/<texte_sha256>.txt`."""
        return self.texte.encode("utf-8")

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.octets).hexdigest()

    @property
    def longueur(self) -> int:
        """Nombre de points de code, l'unité des offsets."""
        return len(self.texte)
