"""Les URL à archiver : arguments de la ligne de commande et fichier d'URL.

Format du fichier : une URL par ligne ; les lignes vides et celles qui commencent par `#` ne sont pas
des URL. Les lignes `#` qui précèdent une URL, sans ligne vide entre elles, sont son commentaire,
recopié au-dessus de son bloc ; une ligne vide les écarte (un en-tête de fichier ne s'attache à
aucune URL).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Demande:
    url: str
    """Exactement telle que donnée par l'auteur."""
    commentaire: tuple[str, ...] = ()


def _texte_du_commentaire(ligne: str) -> str:
    return ligne.removeprefix("#").removeprefix(" ").rstrip()


def lire_fichier(chemin: Path) -> list[Demande]:
    demandes: list[Demande] = []
    commentaire: list[str] = []
    for brute in chemin.read_text(encoding="utf-8").splitlines():
        ligne = brute.strip()
        if not ligne:
            commentaire = []
        elif ligne.startswith("#"):
            commentaire.append(_texte_du_commentaire(ligne))
        else:
            demandes.append(Demande(ligne, tuple(commentaire)))
            commentaire = []
    return demandes
