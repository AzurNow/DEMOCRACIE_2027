"""Banc de collecte partagé par `test_collecte.py`, `test_reprise.py` et `test_dores.py`.

Un `Banc` assemble un vrai `ClientPoli` sur un `TransportFactice`, un `ArchiveurFactice` qui
enregistre chaque URL soumise, et une racine de dépôt jetable. Aucun test ne touche Internet.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from pipeline.collecte.collecte import Dependances
from pipeline.collecte.media import ExtracteurMedia, MediaTelecharge, telechargeurs_media
from pipeline.collecte.politesse import Cadence, ClientPoli
from pipeline.collecte.sources import Source
from pipeline.collecte.wayback import ArchivageReussi, Resultat
from tests.collecte.doubles import HorlogeFactice, Route, TransportFactice, reponse

ROBOTS = "https://example.org/robots.txt"
ROBOTS_OUVERT = reponse(200, b"User-agent: *\nAllow: /\n")
URL_PDF = "https://example.org/programme.pdf"
PDF = b"%PDF-1.7\r\n\xef\xbb\xbf contenu binaire \x00\x01\r\n%%EOF\r\n"
SHA_PDF = hashlib.sha256(PDF).hexdigest()
INSTANTANE = "https://web.archive.org/web/20260922123005/https://example.org/programme.pdf"


def source(url: str = URL_PDF, **champs: object) -> Source:
    valeurs: dict[str, object] = {
        "url": url,
        "candidat_id": "candidat-a",
        "tier": "T1",
        "type_document": "programme_pdf",
        "date_source": date(2026, 9, 1),
        "publication": "publique",
        "site_parti_tient_lieu_de_campagne": None,
    }
    valeurs.update(champs)
    return Source(**valeurs)  # type: ignore[arg-type]


def cle(candidat_id: str, url: str) -> str:
    """Recalculée ici, indépendamment du code : `sha256(candidat_id + "\\n" + url)`."""
    return hashlib.sha256(f"{candidat_id}\n{url}".encode()).hexdigest()


@dataclass
class ArchiveurFactice:
    resultats: list[Resultat]
    urls: list[str] = field(default_factory=list)

    def sauvegarder(self, url: str) -> Resultat:
        self.urls.append(url)
        if not self.resultats:
            raise AssertionError(f"sauvegarde Wayback non prévue par le test : {url}")
        return self.resultats.pop(0)


class YtDlpInattendu:
    def telecharger(self, url: str, genre: str, repertoire: Path) -> MediaTelecharge:
        raise AssertionError(f"téléchargement yt-dlp non prévu par le test : {url}")


@dataclass
class Banc:
    horloge: HorlogeFactice
    transport: TransportFactice
    archiveur: ArchiveurFactice
    racine: Path
    media: ExtracteurMedia = field(default_factory=YtDlpInattendu)

    def dependances(self) -> Dependances:
        client = ClientPoli(self.transport, Cadence(self.horloge, 1.0))
        return Dependances(
            client=client,
            archiveur=self.archiveur,
            horloge=self.horloge,
            racine=self.racine,
            medias=telechargeurs_media(client, self.media, self.racine),
        )

    def fichiers(self) -> list[str]:
        if not self.racine.exists():
            return []
        return sorted(
            chemin.relative_to(self.racine).as_posix() for chemin in self.racine.rglob("*") if chemin.is_file()
        )

    def instantane_des_octets(self) -> dict[str, bytes]:
        """Octets de chaque fichier écrit, pour prouver qu'un second passage n'a rien réécrit."""
        return {nom: (self.racine / nom).read_bytes() for nom in self.fichiers()}


def banc(
    racine: Path,
    horloge: HorlogeFactice,
    routes: dict[str, Route],
    archivages: list[Resultat] | None = None,
    media: ExtracteurMedia | None = None,
) -> Banc:
    resultats = archivages if archivages is not None else [ArchivageReussi(INSTANTANE)] * 5
    return Banc(
        horloge=horloge,
        transport=TransportFactice(horloge, {ROBOTS: ROBOTS_OUVERT, **routes}),
        archiveur=ArchiveurFactice(list(resultats)),
        racine=racine,
        media=media if media is not None else YtDlpInattendu(),
    )


def lire_json(chemin: Path) -> dict[str, object]:
    return json.loads(chemin.read_text("utf-8"))


def manifeste(racine: Path, sha: str) -> dict[str, object]:
    return lire_json(racine / "staging" / "sources" / f"{sha}.json")


def fiche(racine: Path, cle_source: str, sha: str) -> dict[str, object]:
    return lire_json(racine / "staging" / "sources" / "par-source" / cle_source / f"{sha}.json")
