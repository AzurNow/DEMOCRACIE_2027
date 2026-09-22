"""Les trois fichiers écrits par la collecte (`docs/CONTRATS.md` §5), tous immuables une fois écrits.

- Manifeste de contenu `staging/sources/<sha256>.json` (`schema/collecte.schema.json`) : les faits
  du document archivé une seule fois, quelle que soit la source qui l'a servi.
- Fiche de source `staging/sources/par-source/<cle_source>/<sha256>.json`
  (`schema/fiche-source.schema.json`) : une par entrée de la liste et par contenu obtenu. Elle
  porte les métadonnées de la liste et pointe le contenu par son `sha256`.
- Reprise d'archivage `staging/archivages/<sha256>.json` (`schema/reprise-archivage.schema.json`) :
  écrite seulement quand une nouvelle sauvegarde Wayback réussit pour un contenu dont le manifeste
  porte `echec_archivage`. Le manifeste n'est jamais réécrit.

L'ordre des clés est fixé ici par construction, et la sérialisation est déterministe : les fichiers
dorés de `tests/collecte/dore/` le vérifient octet pour octet.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import PurePosixPath

from pipeline.collecte.politesse import Telechargement
from pipeline.collecte.sources import MENTION_SITE_PARTI, Source
from pipeline.collecte.wayback import SERVICE, ArchivageEchoue, ArchivageReussi, Resultat

REPERTOIRE_MANIFESTES = PurePosixPath("staging", "sources")
REPERTOIRE_FICHES = REPERTOIRE_MANIFESTES / "par-source"
REPERTOIRE_REPRISES = PurePosixPath("staging", "archivages")


def cle_source(candidat_id: str, url: str) -> str:
    """SHA-256 de `candidat_id + "\\n" + url` : la même URL listée pour deux candidats donne deux
    sources, parce qu'un programme commun appartient aux deux."""
    return hashlib.sha256(f"{candidat_id}\n{url}".encode()).hexdigest()


def chemin_manifeste(sha256: str) -> PurePosixPath:
    return REPERTOIRE_MANIFESTES / f"{sha256}.json"


def chemin_fiche(source: Source, sha256: str) -> PurePosixPath:
    return REPERTOIRE_FICHES / cle_source(source.candidat_id, source.url) / f"{sha256}.json"


def chemin_reprise(sha256: str) -> PurePosixPath:
    return REPERTOIRE_REPRISES / f"{sha256}.json"


# ----------------------------------------------------------------- manifeste de contenu


def _bloc_archivage(archivage: Resultat) -> dict[str, object]:
    if isinstance(archivage, ArchivageReussi):
        return {"archive_url": archivage.archive_url}
    return {"echec_archivage": _bloc_echec(archivage)}


def _bloc_echec(echec: ArchivageEchoue) -> dict[str, object]:
    return {"service": SERVICE, "motif": echec.motif, "tentatives": echec.tentatives}


def construire_manifeste(
    telechargement: Telechargement,
    sha256: str,
    chemin_local: PurePosixPath,
    date_collecte: str,
    url_soumise: str,
    archivage: Resultat,
) -> dict[str, object]:
    return {
        "sha256": sha256,
        "chemin_local": str(chemin_local),
        "taille_octets": len(telechargement.corps),
        "type_contenu_recu": telechargement.type_contenu,
        "date_premiere_collecte": date_collecte,
        "url_soumise": url_soumise,
        **_bloc_archivage(archivage),
    }


# ----------------------------------------------------------------- fiche de source


def _champs_de_la_source(source: Source, url_finale: str) -> dict[str, object]:
    champs: dict[str, object] = {
        "url": source.url,
        "url_finale": url_finale,
        "candidat_id": source.candidat_id,
        "tier": source.tier,
        "type_document": source.type_document,
    }
    if source.site_parti_tient_lieu_de_campagne is not None:
        champs[MENTION_SITE_PARTI] = source.site_parti_tient_lieu_de_campagne
    champs["date_source"] = source.date_source.isoformat()
    champs["publication"] = source.publication
    return champs


def construire_fiche(source: Source, url_finale: str, sha256: str, date_collecte: str) -> dict[str, object]:
    return {**_champs_de_la_source(source, url_finale), "sha256": sha256, "date_collecte": date_collecte}


# ----------------------------------------------------------------- reprise d'archivage


def construire_reprise(sha256: str, date_reprise: str, url_soumise: str, archivage: ArchivageReussi) -> dict[str, object]:
    return {
        "sha256": sha256,
        "date_reprise": date_reprise,
        "url_soumise": url_soumise,
        "archive_url": archivage.archive_url,
    }


def serialiser(contenu: dict[str, object]) -> bytes:
    return (json.dumps(contenu, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
