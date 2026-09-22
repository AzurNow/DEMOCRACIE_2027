"""Lien d'archive effectif d'un contenu collecté : le seul endroit qui le résout.

Le manifeste de contenu est immuable. S'il porte `echec_archivage`, une collecte ultérieure peut
écrire `staging/archivages/<sha256>.json` (reprise réussie). Le lien effectif est donc
l'`archive_url` du manifeste s'il existe, sinon celui de la reprise, sinon rien. L'extraction (C2)
et tout ce qui affiche une source passent par `archive_url_de`, jamais par une lecture directe.

Aucun lien n'est jamais inventé. Un état contradictoire est une erreur nommée, pas un choix.
"""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.collecte.manifeste import chemin_manifeste, chemin_reprise


class ManifesteAbsent(Exception):
    """Aucun manifeste de contenu pour ce SHA-256 : le contenu n'a jamais été collecté ici."""


class ArchivageIncoherent(Exception):
    """Manifeste et reprise se contredisent, ou l'un d'eux n'a pas la forme de son schéma."""


def _lire(chemin: Path) -> dict[str, object]:
    contenu = json.loads(chemin.read_text(encoding="utf-8"))
    if not isinstance(contenu, dict):
        raise ArchivageIncoherent(f"{chemin} n'est pas un objet JSON")
    return contenu


def _lien(contenu: dict[str, object], chemin: Path) -> str:
    lien = contenu.get("archive_url")
    if not isinstance(lien, str):
        raise ArchivageIncoherent(f"{chemin} : archive_url n'est pas une chaîne : {lien!r}")
    return lien


def lien_du_manifeste(racine: Path, sha256: str) -> str | None:
    """`archive_url` du manifeste, ou `None` s'il porte `echec_archivage`. Exactement un des deux."""
    chemin = racine / chemin_manifeste(sha256)
    if not chemin.exists():
        raise ManifesteAbsent(f"aucun manifeste de contenu pour {sha256} ({chemin})")
    manifeste = _lire(chemin)
    if ("archive_url" in manifeste) == ("echec_archivage" in manifeste):
        raise ArchivageIncoherent(f"{chemin} doit porter exactement un de archive_url ou echec_archivage")
    return _lien(manifeste, chemin) if "archive_url" in manifeste else None


def lien_de_la_reprise(racine: Path, sha256: str) -> str | None:
    """`archive_url` du fichier de reprise, ou `None` s'il n'y en a pas."""
    chemin = racine / chemin_reprise(sha256)
    if not chemin.exists():
        return None
    reprise = _lire(chemin)
    if reprise.get("sha256") != sha256:
        raise ArchivageIncoherent(f"{chemin} porte le sha256 {reprise.get('sha256')!r} au lieu de {sha256}")
    return _lien(reprise, chemin)


def archive_url_de(racine: Path, sha256: str) -> str | None:
    """Lien d'archive effectif, ou `None` : l'appelant doit traiter l'absence (la source ne peut
    alors pas s'afficher, CLAUDE.md règle 2). Lève `ManifesteAbsent` pour un contenu inconnu et
    `ArchivageIncoherent` si le manifeste et une reprise portent tous deux un lien."""
    du_manifeste = lien_du_manifeste(racine, sha256)
    de_la_reprise = lien_de_la_reprise(racine, sha256)
    if du_manifeste is not None and de_la_reprise is not None:
        raise ArchivageIncoherent(
            f"{sha256} : le manifeste porte déjà archive_url, une reprise n'aurait jamais dû être écrite"
        )
    return du_manifeste if du_manifeste is not None else de_la_reprise
