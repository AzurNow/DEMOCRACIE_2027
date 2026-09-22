"""Orchestration d'un lot : chaque source est téléchargée, archivée, sauvegardée sur la Wayback
Machine et consignée dans un manifeste. Un échec n'arrête pas le lot ; il est nommé dans le rapport
et rend le code de sortie non nul.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from pipeline.collecte.archivage import chemin_archive, ecrire_atomiquement, empreinte, extension_pour
from pipeline.collecte.horloge import Horloge, instant_iso
from pipeline.collecte.manifeste import chemin_manifeste, construire_manifeste, serialiser
from pipeline.collecte.politesse import EchecCollecte, Telechargement
from pipeline.collecte.sources import Source
from pipeline.collecte.wayback import ArchivageReussi, Archiveur, Resultat


class Telechargeur(Protocol):
    def telecharger(self, url: str) -> Telechargement: ...


@dataclass(frozen=True)
class Dependances:
    client: Telechargeur
    archiveur: Archiveur
    horloge: Horloge
    racine: Path
    """Racine du dépôt : `archives/` et `staging/sources/` s'y trouvent, `chemin_local` y est relatif."""


@dataclass(frozen=True)
class Collectee:
    url: str
    sha256: str
    chemin_local: str
    archive_url: str


@dataclass(frozen=True)
class ArchivageManque:
    """Archive locale et manifeste écrits, mais sans `archive_url` : la source ne pourra pas
    s'afficher (CLAUDE.md règle 2), et c'est voulu."""

    url: str
    sha256: str
    chemin_local: str
    motif: str


@dataclass(frozen=True)
class DejaCollectee:
    url: str
    sha256: str


@dataclass(frozen=True)
class Refusee:
    """Ni archive ni manifeste."""

    url: str
    motif: str


ResultatSource = Collectee | ArchivageManque | DejaCollectee | Refusee


def _resultat_ecrit(source: Source, sha256: str, chemin_local: str, archivage: Resultat) -> ResultatSource:
    if isinstance(archivage, ArchivageReussi):
        return Collectee(source.url, sha256, chemin_local, archivage.archive_url)
    return ArchivageManque(source.url, sha256, chemin_local, archivage.motif)


def _consigner(source: Source, telechargement: Telechargement, date_collecte: str, deps: Dependances) -> ResultatSource:
    sha256 = empreinte(telechargement.corps)
    cible_manifeste = deps.racine / chemin_manifeste(sha256)
    if cible_manifeste.exists():
        return DejaCollectee(source.url, sha256)
    chemin_local = chemin_archive(sha256, extension_pour(telechargement.type_contenu))
    # Archive déjà présente sans manifeste (lot interrompu) : mêmes octets par construction.
    if not (deps.racine / chemin_local).exists():
        ecrire_atomiquement(deps.racine / chemin_local, telechargement.corps)
    archivage = deps.archiveur.sauvegarder(source.url)
    manifeste = construire_manifeste(source, telechargement, sha256, chemin_local, date_collecte, archivage)
    ecrire_atomiquement(cible_manifeste, serialiser(manifeste))
    return _resultat_ecrit(source, sha256, str(chemin_local), archivage)


def collecter_source(source: Source, deps: Dependances) -> ResultatSource:
    try:
        telechargement = deps.client.telecharger(source.url)
    except EchecCollecte as echec:
        return Refusee(source.url, echec.motif)
    date_collecte = instant_iso(deps.horloge.maintenant())
    return _consigner(source, telechargement, date_collecte, deps)


def collecter(sources: Sequence[Source], deps: Dependances) -> list[ResultatSource]:
    return [collecter_source(source, deps) for source in sources]


def code_de_sortie(resultats: Sequence[ResultatSource]) -> int:
    reussis = all(isinstance(resultat, (Collectee, DejaCollectee)) for resultat in resultats)
    return 0 if reussis else 1


# ----------------------------------------------------------------- rapport


def _ligne_collectee(resultat: Collectee) -> str:
    return f"collecté            {resultat.sha256}  {resultat.url}  → {resultat.archive_url}"


def _ligne_manque(resultat: ArchivageManque) -> str:
    return f"ARCHIVAGE EN ÉCHEC  {resultat.sha256}  {resultat.url} : {resultat.motif}"


def _ligne_deja(resultat: DejaCollectee) -> str:
    return f"déjà collecté       {resultat.sha256}  {resultat.url}"


def _ligne_refusee(resultat: Refusee) -> str:
    return f"ÉCHEC               {resultat.url} : {resultat.motif}"


LIGNES: dict[type, Callable[..., str]] = {
    Collectee: _ligne_collectee,
    ArchivageManque: _ligne_manque,
    DejaCollectee: _ligne_deja,
    Refusee: _ligne_refusee,
}

LIBELLES_BILAN: dict[type, str] = {
    Collectee: "collecté(s)",
    DejaCollectee: "déjà collecté(s)",
    ArchivageManque: "sans archive Wayback",
    Refusee: "échec(s)",
}


def formater_rapport(resultats: Sequence[ResultatSource]) -> str:
    lignes = [LIGNES[type(resultat)](resultat) for resultat in resultats]
    comptes = [
        f"{sum(isinstance(resultat, genre) for resultat in resultats)} {libelle}"
        for genre, libelle in LIBELLES_BILAN.items()
    ]
    return "\n".join([*lignes, f"bilan : {', '.join(comptes)}"])
