"""Manifeste de collecte `staging/sources/<sha256>.json` (`schema/collecte.schema.json`).

Immuable une fois écrit : ni la recollecte d'un même contenu, ni un nouvel essai d'archivage ne le
réécrivent. L'ordre des clés est fixé ici par construction, et la sérialisation est déterministe :
le fichier doré de `tests/collecte/dore/` le vérifie octet pour octet.
"""

from __future__ import annotations

import json
from pathlib import PurePosixPath

from pipeline.collecte.politesse import Telechargement
from pipeline.collecte.sources import MENTION_SITE_PARTI, Source
from pipeline.collecte.wayback import SERVICE, ArchivageEchoue, ArchivageReussi, Resultat

REPERTOIRE_MANIFESTES = PurePosixPath("staging", "sources")


def chemin_manifeste(sha256: str) -> PurePosixPath:
    return REPERTOIRE_MANIFESTES / f"{sha256}.json"


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


def _bloc_archivage(archivage: Resultat) -> dict[str, object]:
    if isinstance(archivage, ArchivageReussi):
        return {"archive_url": archivage.archive_url}
    return {"echec_archivage": _bloc_echec(archivage)}


def _bloc_echec(echec: ArchivageEchoue) -> dict[str, object]:
    return {"service": SERVICE, "motif": echec.motif, "tentatives": echec.tentatives}


def construire_manifeste(
    source: Source,
    telechargement: Telechargement,
    sha256: str,
    chemin_local: PurePosixPath,
    date_collecte: str,
    archivage: Resultat,
) -> dict[str, object]:
    return {
        **_champs_de_la_source(source, telechargement.url_finale),
        "sha256": sha256,
        "chemin_local": str(chemin_local),
        "taille_octets": len(telechargement.corps),
        "type_contenu_recu": telechargement.type_contenu,
        "date_collecte": date_collecte,
        **_bloc_archivage(archivage),
    }


def serialiser(manifeste: dict[str, object]) -> bytes:
    return (json.dumps(manifeste, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
