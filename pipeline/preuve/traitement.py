"""Une URL : téléchargement poli, empreinte, copie locale, Save Page Now.

Toute la partie réseau est celle de la collecte (`ClientPoli`, `ArchiveurWayback`) ; ce module ne
fait que les enchaîner. Un échec ne fabrique rien : il lève `EchecPreuve` avec sa cause.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from pipeline.collecte.archivage import ecrire_atomiquement, empreinte, extension_pour
from pipeline.collecte.horloge import Horloge, instant_iso
from pipeline.collecte.politesse import SCHEMAS_ADMIS, ClientPoli, EchecCollecte
from pipeline.collecte.wayback import Archiveur, ArchivageEchoue
from pipeline.liens.iri import IriInconvertible, iri_vers_uri

STATUT_TELECHARGE = 200
"""`ClientPoli.telecharger` n'accepte que 200 : toute autre réponse est un `EchecCollecte`."""


class EchecPreuve(Exception):
    """Une URL dont la preuve n'a pas pu être établie ; le message dit pourquoi."""


@dataclass(frozen=True)
class Dependances:
    client: ClientPoli
    archiveur: Archiveur
    horloge: Horloge
    dossier: Path


@dataclass(frozen=True)
class Preuve:
    url: str
    sha256: str
    capture: str
    url_finale: str
    statut: int
    type_contenu: str | None
    copie: Path
    archive_url: str | None
    """`None` : Save Page Now a échoué ; `motif_archivage` dit pourquoi."""
    motif_archivage: str | None


def uri_a_envoyer(url: str) -> str:
    """L'URL telle qu'elle partira sur le réseau : http(s) seulement, sans blanc, IRI convertie."""
    if any(c.isspace() or ord(c) < 32 for c in url):
        raise EchecPreuve(f"URL avec espace ou caractère de contrôle : {url!r}")
    morceaux = urlsplit(url)
    if morceaux.scheme.lower() not in SCHEMAS_ADMIS or not morceaux.netloc:
        raise EchecPreuve(f"URL refusée, http ou https attendu : {url!r}")
    try:
        return iri_vers_uri(url)
    except IriInconvertible as erreur:
        raise EchecPreuve(f"IRI inconvertible en URI : {erreur}") from erreur


def conserver_copie(dossier: Path, sha256: str, extension: str, octets: bytes) -> Path:
    """Octets intacts sous un nom qui est leur empreinte. Un fichier déjà là doit être identique."""
    cible = dossier / f"{sha256}{extension}"
    try:
        if not cible.exists():
            ecrire_atomiquement(cible, octets)
        elif cible.read_bytes() != octets:
            raise EchecPreuve(f"{cible} existe déjà avec un autre contenu que son nom annonce")
    except OSError as erreur:
        raise EchecPreuve(f"copie locale impossible ({cible}) : {erreur}") from erreur
    return cible


def etablir(url: str, deps: Dependances) -> Preuve:
    uri = uri_a_envoyer(url)
    capture = instant_iso(deps.horloge.maintenant())
    try:
        page = deps.client.telecharger(uri)
    except EchecCollecte as echec:
        raise EchecPreuve(echec.motif) from echec
    sha256 = empreinte(page.corps)
    copie = conserver_copie(deps.dossier, sha256, extension_pour(page.type_contenu), page.corps)
    archivage = deps.archiveur.sauvegarder(uri)
    if isinstance(archivage, ArchivageEchoue):
        archive_url, motif = None, f"{archivage.motif} ({archivage.tentatives} tentatives)"
    else:
        archive_url, motif = archivage.archive_url, None
    return Preuve(
        url=url,
        sha256=sha256,
        capture=capture,
        url_finale=page.url_finale,
        statut=STATUT_TELECHARGE,
        type_contenu=page.type_contenu,
        copie=copie,
        archive_url=archive_url,
        motif_archivage=motif,
    )
