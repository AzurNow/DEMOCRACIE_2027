"""Collecte de bout en bout : archive, manifeste, rapport et code de sortie.

Cas limites 1, 3, 7, 8, 9, 10, 11, 12, 13, 14 et 15 (fichiers dorés), plus le refus d'un fichier
de sources invalide par la ligne de commande avant tout téléchargement.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import pytest

from pipeline.collecte.__main__ import principal
from pipeline.collecte.collecte import (
    ArchivageManque,
    Collectee,
    DejaCollectee,
    Dependances,
    Refusee,
    code_de_sortie,
    collecter,
    formater_rapport,
)
from pipeline.collecte.politesse import Cadence, ClientPoli
from pipeline.collecte.sources import Source
from pipeline.collecte.wayback import ArchivageEchoue, ArchivageReussi, Resultat
from tests.collecte.doubles import HorlogeFactice, Route, TransportFactice, reponse

ICI = Path(__file__).resolve().parent
DORE_ARCHIVE = ICI / "dore" / "manifeste-archive.json"
DORE_ECHEC = ICI / "dore" / "manifeste-echec-archivage.json"

ROBOTS = "https://example.org/robots.txt"
ROBOTS_OUVERT = reponse(200, b"User-agent: *\nAllow: /\n")
PDF = b"%PDF-1.7\r\n\xef\xbb\xbf contenu binaire \x00\x01\r\n%%EOF\r\n"
SHA_PDF = hashlib.sha256(PDF).hexdigest()
INSTANTANE = "https://web.archive.org/web/20260922123005/https://example.org/programme.pdf"


def _source(url: str = "https://example.org/programme.pdf", **champs: object) -> Source:
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


@dataclass
class ArchiveurFactice:
    resultats: list[Resultat]
    urls: list[str] = field(default_factory=list)

    def sauvegarder(self, url: str) -> Resultat:
        self.urls.append(url)
        return self.resultats.pop(0)


@dataclass
class Banc:
    horloge: HorlogeFactice
    transport: TransportFactice
    archiveur: ArchiveurFactice
    racine: Path

    def dependances(self) -> Dependances:
        client = ClientPoli(self.transport, Cadence(self.horloge, 1.0))
        return Dependances(
            client=client, archiveur=self.archiveur, horloge=self.horloge, racine=self.racine
        )

    def fichiers(self) -> list[str]:
        if not self.racine.exists():
            return []
        return sorted(
            str(chemin.relative_to(self.racine)) for chemin in self.racine.rglob("*") if chemin.is_file()
        )


def _banc(
    racine: Path,
    horloge: HorlogeFactice,
    routes: dict[str, Route],
    archivages: list[Resultat] | None = None,
) -> Banc:
    resultats = archivages if archivages is not None else [ArchivageReussi(INSTANTANE)] * 5
    return Banc(
        horloge=horloge,
        transport=TransportFactice(horloge, {ROBOTS: ROBOTS_OUVERT, **routes}),
        archiveur=ArchiveurFactice(list(resultats)),
        racine=racine,
    )


def _manifeste(racine: Path, sha: str) -> dict[str, object]:
    return json.loads((racine / "staging" / "sources" / f"{sha}.json").read_text("utf-8"))


# --------------------------------------------------------------------------- cas nominal


def test_manifeste_reprend_chaque_champ_fourni_et_ajoute_la_collecte(
    racine: Path, horloge: HorlogeFactice
) -> None:
    banc = _banc(
        racine,
        horloge,
        {"https://example.org/programme.pdf": reponse(200, PDF, content_type="application/pdf")},
    )

    resultats = collecter([_source()], banc.dependances())

    chemin_local = f"archives/{SHA_PDF[:2]}/{SHA_PDF}.pdf"
    assert resultats == [
        Collectee(
            url="https://example.org/programme.pdf",
            sha256=SHA_PDF,
            chemin_local=chemin_local,
            archive_url=INSTANTANE,
        )
    ]
    assert _manifeste(racine, SHA_PDF) == {
        "url": "https://example.org/programme.pdf",
        "url_finale": "https://example.org/programme.pdf",
        "candidat_id": "candidat-a",
        "tier": "T1",
        "type_document": "programme_pdf",
        "date_source": "2026-09-01",
        "publication": "publique",
        "sha256": SHA_PDF,
        "chemin_local": chemin_local,
        "taille_octets": len(PDF),
        "type_contenu_recu": "application/pdf",
        "date_collecte": "2026-09-22T14:30:05+02:00",
        "archive_url": INSTANTANE,
    }
    assert banc.fichiers() == [chemin_local, f"staging/sources/{SHA_PDF}.json"]
    assert code_de_sortie(resultats) == 0


def test_archive_contient_les_octets_exacts_avec_bom_et_crlf(
    racine: Path, horloge: HorlogeFactice
) -> None:
    banc = _banc(racine, horloge, {"https://example.org/programme.pdf": reponse(200, PDF)})

    collecter([_source()], banc.dependances())

    archive = racine / "archives" / SHA_PDF[:2] / f"{SHA_PDF}.bin"
    assert archive.read_bytes() == PDF
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == _manifeste(racine, SHA_PDF)["sha256"]


def test_site_parti_reporte_sa_mention_au_manifeste(racine: Path, horloge: HorlogeFactice) -> None:
    banc = _banc(racine, horloge, {"https://example.org/parti": reponse(200, b"<html>")})
    source = _source(
        "https://example.org/parti",
        type_document="site_parti",
        site_parti_tient_lieu_de_campagne=False,
    )

    collecter([source], banc.dependances())

    sha = hashlib.sha256(b"<html>").hexdigest()
    assert _manifeste(racine, sha)["site_parti_tient_lieu_de_campagne"] is False


def test_redirection_consigne_url_finale_a_cote_de_url(racine: Path, horloge: HorlogeFactice) -> None:
    banc = _banc(
        racine,
        horloge,
        {
            "https://example.org/programme.pdf": reponse(301, location="/2026/programme.pdf"),
            "https://example.org/2026/programme.pdf": reponse(200, PDF),
        },
    )

    collecter([_source()], banc.dependances())

    manifeste = _manifeste(racine, SHA_PDF)
    assert manifeste["url"] == "https://example.org/programme.pdf"
    assert manifeste["url_finale"] == "https://example.org/2026/programme.pdf"


def test_content_type_inconnu_donne_bin_et_consigne_le_type_recu(
    racine: Path, horloge: HorlogeFactice
) -> None:
    banc = _banc(
        racine,
        horloge,
        {"https://example.org/programme.pdf": reponse(200, PDF, content_type="application/x-maison")},
    )

    collecter([_source()], banc.dependances())

    manifeste = _manifeste(racine, SHA_PDF)
    assert manifeste["chemin_local"] == f"archives/{SHA_PDF[:2]}/{SHA_PDF}.bin"
    assert manifeste["type_contenu_recu"] == "application/x-maison"


def test_content_type_absent_est_consigne_comme_absent(racine: Path, horloge: HorlogeFactice) -> None:
    banc = _banc(racine, horloge, {"https://example.org/programme.pdf": reponse(200, PDF)})

    collecter([_source()], banc.dependances())

    assert _manifeste(racine, SHA_PDF)["type_contenu_recu"] is None


# --------------------------------------------------------------------------- immuabilité


def test_meme_contenu_collecte_deux_fois_n_est_pas_reecrit(
    racine: Path, horloge: HorlogeFactice
) -> None:
    banc = _banc(
        racine,
        horloge,
        {"https://example.org/programme.pdf": [reponse(200, PDF), reponse(200, PDF)]},
    )
    collecter([_source()], banc.dependances())
    manifeste = racine / "staging" / "sources" / f"{SHA_PDF}.json"
    octets_avant = manifeste.read_bytes()
    mtime_avant = manifeste.stat().st_mtime_ns
    horloge.instant = horloge.instant.replace(day=23)

    resultats = collecter([_source()], banc.dependances())

    assert resultats == [DejaCollectee(url="https://example.org/programme.pdf", sha256=SHA_PDF)]
    assert manifeste.read_bytes() == octets_avant
    assert manifeste.stat().st_mtime_ns == mtime_avant
    assert banc.archiveur.urls == ["https://example.org/programme.pdf"]
    assert "déjà collecté" in formater_rapport(resultats)
    assert code_de_sortie(resultats) == 0


def test_meme_url_contenu_change_donne_deux_manifestes_et_deux_archives(
    racine: Path, horloge: HorlogeFactice
) -> None:
    autre = PDF + b"version 2\r\n"
    sha_autre = hashlib.sha256(autre).hexdigest()
    banc = _banc(
        racine,
        horloge,
        {"https://example.org/programme.pdf": [reponse(200, PDF), reponse(200, autre)]},
    )

    collecter([_source()], banc.dependances())
    collecter([_source()], banc.dependances())

    assert banc.fichiers() == sorted(
        [
            f"archives/{SHA_PDF[:2]}/{SHA_PDF}.bin",
            f"archives/{sha_autre[:2]}/{sha_autre}.bin",
            f"staging/sources/{SHA_PDF}.json",
            f"staging/sources/{sha_autre}.json",
        ]
    )


# --------------------------------------------------------------------------- Wayback


def test_wayback_en_succes_renseigne_archive_url(racine: Path, horloge: HorlogeFactice) -> None:
    banc = _banc(racine, horloge, {"https://example.org/programme.pdf": reponse(200, PDF)})

    collecter([_source()], banc.dependances())

    assert _manifeste(racine, SHA_PDF)["archive_url"] == INSTANTANE
    assert "echec_archivage" not in _manifeste(racine, SHA_PDF)


def test_wayback_en_echec_ecrit_le_manifeste_sans_archive_url_et_sort_en_erreur(
    racine: Path, horloge: HorlogeFactice
) -> None:
    echec = ArchivageEchoue(motif="HTTP 503 sans instantané daté", tentatives=3)
    banc = _banc(racine, horloge, {"https://example.org/programme.pdf": reponse(200, PDF)}, [echec])

    resultats = collecter([_source()], banc.dependances())

    manifeste = _manifeste(racine, SHA_PDF)
    assert "archive_url" not in manifeste
    assert manifeste["echec_archivage"] == {
        "service": "wayback_save_page_now",
        "motif": "HTTP 503 sans instantané daté",
        "tentatives": 3,
    }
    assert resultats == [
        ArchivageManque(
            url="https://example.org/programme.pdf",
            sha256=SHA_PDF,
            chemin_local=f"archives/{SHA_PDF[:2]}/{SHA_PDF}.bin",
            motif="HTTP 503 sans instantané daté",
        )
    ]
    assert code_de_sortie(resultats) != 0
    assert "HTTP 503 sans instantané daté" in formater_rapport(resultats)


# --------------------------------------------------------------------------- échecs


def test_http_404_ne_laisse_ni_archive_ni_manifeste(racine: Path, horloge: HorlogeFactice) -> None:
    banc = _banc(racine, horloge, {"https://example.org/programme.pdf": reponse(404, b"absent")})

    resultats = collecter([_source()], banc.dependances())

    assert resultats == [Refusee(url="https://example.org/programme.pdf", motif="HTTP 404")]
    assert banc.fichiers() == []
    assert banc.archiveur.urls == []
    assert code_de_sortie(resultats) != 0
    assert "https://example.org/programme.pdf" in formater_rapport(resultats)
    assert "HTTP 404" in formater_rapport(resultats)


def test_reponse_de_zero_octet_ne_laisse_ni_archive_ni_manifeste(
    racine: Path, horloge: HorlogeFactice
) -> None:
    banc = _banc(racine, horloge, {"https://example.org/programme.pdf": reponse(200, b"")})

    resultats = collecter([_source()], banc.dependances())

    assert isinstance(resultats[0], Refusee)
    assert "vide" in resultats[0].motif
    assert banc.fichiers() == []
    assert code_de_sortie(resultats) != 0


def test_un_echec_n_arrete_pas_le_lot(racine: Path, horloge: HorlogeFactice) -> None:
    banc = _banc(
        racine,
        horloge,
        {
            "https://example.org/absent": reponse(404),
            "https://example.org/programme.pdf": reponse(200, PDF),
        },
    )

    resultats = collecter([_source("https://example.org/absent"), _source()], banc.dependances())

    assert [type(resultat) for resultat in resultats] == [Refusee, Collectee]
    assert code_de_sortie(resultats) != 0


# --------------------------------------------------------------------------- fichiers dorés


def _produire_dore_archive(racine: Path, horloge: HorlogeFactice) -> bytes:
    banc = _banc(
        racine,
        horloge,
        {"https://example.org/programme.pdf": reponse(200, PDF, content_type="application/pdf")},
    )
    collecter([_source()], banc.dependances())
    return (racine / "staging" / "sources" / f"{SHA_PDF}.json").read_bytes()


def _produire_dore_echec(racine: Path, horloge: HorlogeFactice) -> bytes:
    page = "<!DOCTYPE html>\r\n<p>Page d’accueil — « programme »</p>\r\n".encode()
    banc = _banc(
        racine,
        horloge,
        {
            "https://example.org/parti": reponse(302, location="https://example.org/parti/"),
            "https://example.org/parti/": reponse(
                200, page, content_type="text/html; charset=utf-8"
            ),
        },
        [ArchivageEchoue(motif="HTTP 520 sans instantané daté", tentatives=3)],
    )
    source = _source(
        "https://example.org/parti",
        type_document="site_parti",
        site_parti_tient_lieu_de_campagne=True,
        candidat_id="candidat-b",
        date_source=date(2026, 8, 15),
    )
    collecter([source], banc.dependances())
    sha = hashlib.sha256(page).hexdigest()
    return (racine / "staging" / "sources" / f"{sha}.json").read_bytes()


def test_le_code_reproduit_le_manifeste_dore_avec_archive_octet_pour_octet(
    racine: Path, horloge: HorlogeFactice
) -> None:
    assert _produire_dore_archive(racine, horloge) == DORE_ARCHIVE.read_bytes()


def test_le_code_reproduit_le_manifeste_dore_en_echec_d_archivage_octet_pour_octet(
    racine: Path, horloge: HorlogeFactice
) -> None:
    assert _produire_dore_echec(racine, horloge) == DORE_ECHEC.read_bytes()


# --------------------------------------------------------------------------- ligne de commande


def test_fichier_de_sources_invalide_est_refuse_avant_tout_telechargement(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    liste = tmp_path / "sources.toml"
    liste.write_text(
        '[[source]]\nurl = "https://example.org/a"\ncandidat_id = "candidat-a"\n'
        'tier = "T4"\ntype_document = "programme_pdf"\ndate_source = 2026-09-01\n'
        'publication = "publique"\n',
        encoding="utf-8",
    )

    def construction_interdite(_racine: Path) -> Dependances:
        raise AssertionError("aucune dépendance réseau ne doit être construite")

    code = principal([str(liste), "--racine", str(tmp_path)], construction_interdite)

    assert code == 2
    erreur = capsys.readouterr().err
    assert "source n°1" in erreur and "T4" in erreur
    assert not (tmp_path / "archives").exists()
    assert not (tmp_path / "staging").exists()


def test_ligne_de_commande_collecte_et_rend_le_code_du_lot(
    tmp_path: Path, horloge: HorlogeFactice, capsys: pytest.CaptureFixture[str]
) -> None:
    liste = tmp_path / "sources.toml"
    liste.write_text(
        '[[source]]\nurl = "https://example.org/programme.pdf"\ncandidat_id = "candidat-a"\n'
        'tier = "T1"\ntype_document = "programme_pdf"\ndate_source = 2026-09-01\n'
        'publication = "publique"\n',
        encoding="utf-8",
    )
    banc = _banc(tmp_path, horloge, {"https://example.org/programme.pdf": reponse(200, PDF)})

    code = principal([str(liste), "--racine", str(tmp_path)], lambda _racine: banc.dependances())

    assert code == 0
    assert SHA_PDF in capsys.readouterr().out
