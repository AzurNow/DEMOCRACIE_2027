"""Reprise d'un archivage Wayback en échec et résolution du lien d'archive effectif.

Cas limites 5 à 10 de C1-bis. La reprise n'a lieu que si le contenu téléchargé aujourd'hui a le même
SHA-256 qu'un manifeste en échec sans fichier de reprise : c'est la seule condition où un instantané
pris maintenant correspond au document archivé. Le manifeste n'est jamais réécrit.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from pipeline.collecte.collecte import (
    ArchivageManque,
    ArchivageRepris,
    Collectee,
    DejaCollectee,
    RepriseManquee,
    code_de_sortie,
    collecter,
    formater_rapport,
)
from pipeline.collecte.lien_archive import ArchivageIncoherent, ManifesteAbsent, archive_url_de
from pipeline.collecte.wayback import ArchivageEchoue, ArchivageReussi
from tests.collecte.banc import INSTANTANE, PDF, SHA_PDF, URL_PDF, banc, lire_json, manifeste, source
from tests.collecte.doubles import HorlogeFactice, reponse

ECHEC = ArchivageEchoue(motif="HTTP 520 sans instantané daté", tentatives=3)
INSTANTANE_REPRISE = "https://web.archive.org/web/20260923081500/https://example.org/programme.pdf"


def _reprise(racine: Path, sha: str) -> Path:
    return racine / "staging" / "archivages" / f"{sha}.json"


def _manifeste_brut(racine: Path, sha: str) -> Path:
    return racine / "staging" / "sources" / f"{sha}.json"


def _deux_passages_meme_contenu(racine: Path, horloge: HorlogeFactice, second: list) -> tuple:
    """Premier passage en échec d'archivage, puis second passage de la même source, mêmes octets."""
    b = banc(racine, horloge, {URL_PDF: [reponse(200, PDF), reponse(200, PDF), reponse(200, PDF)]}, [ECHEC, *second])
    premiers = collecter([source()], b.dependances())
    assert premiers == [ArchivageManque(URL_PDF, SHA_PDF, f"archives/{SHA_PDF[:2]}/{SHA_PDF}.bin", ECHEC.motif)]
    return b, _manifeste_brut(racine, SHA_PDF).read_bytes()


# --------------------------------------------------------------------------- reprise


def test_cas_5_reprise_reussie_ecrit_le_fichier_de_reprise_sans_toucher_au_manifeste(
    racine: Path, horloge: HorlogeFactice
) -> None:
    b, manifeste_avant = _deux_passages_meme_contenu(racine, horloge, [ArchivageReussi(INSTANTANE_REPRISE)])
    horloge.instant = horloge.instant.replace(day=23, hour=10, minute=15, second=0)

    resultats = collecter([source()], b.dependances())

    assert resultats == [
        ArchivageRepris(url=URL_PDF, sha256=SHA_PDF, archive_url=INSTANTANE_REPRISE, fiche_ajoutee=False)
    ]
    assert lire_json(_reprise(racine, SHA_PDF)) == {
        "sha256": SHA_PDF,
        "date_reprise": "2026-09-23T10:15:00+02:00",
        "url_soumise": URL_PDF,
        "archive_url": INSTANTANE_REPRISE,
    }
    assert _manifeste_brut(racine, SHA_PDF).read_bytes() == manifeste_avant
    assert archive_url_de(racine, SHA_PDF) == INSTANTANE_REPRISE
    assert b.archiveur.urls == [URL_PDF, URL_PDF]
    assert "archivage repris" in formater_rapport(resultats)
    assert code_de_sortie(resultats) == 0


def test_cas_6_reprise_en_echec_n_ecrit_rien_nomme_l_echec_et_sort_en_erreur(
    racine: Path, horloge: HorlogeFactice
) -> None:
    nouvel_echec = ArchivageEchoue(motif="délai dépassé (120 s)", tentatives=3)
    b, _manifeste_avant = _deux_passages_meme_contenu(racine, horloge, [nouvel_echec])
    avant = b.instantane_des_octets()

    resultats = collecter([source()], b.dependances())

    assert resultats == [
        RepriseManquee(url=URL_PDF, sha256=SHA_PDF, motif="délai dépassé (120 s)", fiche_ajoutee=False)
    ]
    assert b.instantane_des_octets() == avant
    assert not _reprise(racine, SHA_PDF).exists()
    rapport = formater_rapport(resultats)
    assert "REPRISE D'ARCHIVAGE EN ÉCHEC" in rapport and "délai dépassé (120 s)" in rapport
    assert code_de_sortie(resultats) != 0
    assert archive_url_de(racine, SHA_PDF) is None


def test_cas_7_reprise_deja_faite_aucune_nouvelle_tentative_wayback(
    racine: Path, horloge: HorlogeFactice
) -> None:
    b, _manifeste_avant = _deux_passages_meme_contenu(racine, horloge, [ArchivageReussi(INSTANTANE_REPRISE)])
    collecter([source()], b.dependances())
    avant = b.instantane_des_octets()
    appels_avant = list(b.archiveur.urls)

    resultats = collecter([source()], b.dependances())

    assert b.archiveur.urls == appels_avant
    assert resultats == [DejaCollectee(url=URL_PDF, sha256=SHA_PDF)]
    assert b.instantane_des_octets() == avant
    assert code_de_sortie(resultats) == 0


def test_cas_8_manifeste_deja_archive_aucune_tentative_wayback_au_second_passage(
    racine: Path, horloge: HorlogeFactice
) -> None:
    miroir = "https://example.org/miroir/programme.pdf"
    b = banc(racine, horloge, {URL_PDF: [reponse(200, PDF), reponse(200, PDF)], miroir: reponse(200, PDF)})
    collecter([source()], b.dependances())

    resultats = collecter([source(), source(miroir)], b.dependances())

    assert b.archiveur.urls == [URL_PDF]
    assert not (racine / "staging" / "archivages").exists()
    assert code_de_sortie(resultats) == 0


def test_cas_9_contenu_change_ancien_en_echec_pas_de_reprise_nouveau_archive_normalement(
    racine: Path, horloge: HorlogeFactice
) -> None:
    autre = PDF + b"version 2\r\n"
    sha_autre = hashlib.sha256(autre).hexdigest()
    b = banc(racine, horloge, {URL_PDF: [reponse(200, PDF), reponse(200, autre)]}, [ECHEC, ArchivageReussi(INSTANTANE)])
    collecter([source()], b.dependances())
    manifeste_ancien = _manifeste_brut(racine, SHA_PDF).read_bytes()

    resultats = collecter([source()], b.dependances())

    assert resultats == [
        Collectee(url=URL_PDF, sha256=sha_autre, chemin_local=f"archives/{sha_autre[:2]}/{sha_autre}.bin", archive_url=INSTANTANE)
    ]
    assert b.archiveur.urls == [URL_PDF, URL_PDF]
    assert not (racine / "staging" / "archivages").exists()
    assert _manifeste_brut(racine, SHA_PDF).read_bytes() == manifeste_ancien
    assert manifeste(racine, sha_autre)["archive_url"] == INSTANTANE
    assert archive_url_de(racine, SHA_PDF) is None


def test_reprise_declenchee_par_une_autre_source_au_meme_contenu_ajoute_aussi_sa_fiche(
    racine: Path, horloge: HorlogeFactice
) -> None:
    miroir = "https://example.org/miroir/programme.pdf"
    b = banc(
        racine,
        horloge,
        {URL_PDF: reponse(200, PDF), miroir: reponse(200, PDF)},
        [ECHEC, ArchivageReussi(INSTANTANE_REPRISE)],
    )
    collecter([source()], b.dependances())

    resultats = collecter([source(miroir)], b.dependances())

    assert resultats == [
        ArchivageRepris(url=miroir, sha256=SHA_PDF, archive_url=INSTANTANE_REPRISE, fiche_ajoutee=True)
    ]
    assert b.archiveur.urls == [URL_PDF, miroir]
    assert lire_json(_reprise(racine, SHA_PDF))["url_soumise"] == miroir
    assert "fiche ajoutée" in formater_rapport(resultats)


# --------------------------------------------------------------------------- archive_url_de


def _ecrire(chemin: Path, contenu: dict[str, object]) -> None:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(json.dumps(contenu), encoding="utf-8")


def _manifeste_fictif(archivage: dict[str, object]) -> dict[str, object]:
    return {
        "sha256": SHA_PDF,
        "chemin_local": f"archives/{SHA_PDF[:2]}/{SHA_PDF}.pdf",
        "taille_octets": 41,
        "type_contenu_recu": "application/pdf",
        "date_premiere_collecte": "2026-09-22T14:30:05+02:00",
        "url_soumise": URL_PDF,
        **archivage,
    }


def _reprise_fictive() -> dict[str, object]:
    return {
        "sha256": SHA_PDF,
        "date_reprise": "2026-09-23T10:15:00+02:00",
        "url_soumise": URL_PDF,
        "archive_url": INSTANTANE_REPRISE,
    }


def test_cas_10a_archive_url_de_renvoie_le_lien_du_manifeste(racine: Path) -> None:
    _ecrire(_manifeste_brut(racine, SHA_PDF), _manifeste_fictif({"archive_url": INSTANTANE}))

    assert archive_url_de(racine, SHA_PDF) == INSTANTANE


def test_cas_10b_archive_url_de_renvoie_le_lien_de_la_reprise(racine: Path) -> None:
    _ecrire(_manifeste_brut(racine, SHA_PDF), _manifeste_fictif({"echec_archivage": {"service": "wayback_save_page_now", "motif": "x", "tentatives": 3}}))
    _ecrire(_reprise(racine, SHA_PDF), _reprise_fictive())

    assert archive_url_de(racine, SHA_PDF) == INSTANTANE_REPRISE


def test_cas_10c_archive_url_de_renvoie_none_sans_aucun_lien(racine: Path) -> None:
    _ecrire(_manifeste_brut(racine, SHA_PDF), _manifeste_fictif({"echec_archivage": {"service": "wayback_save_page_now", "motif": "x", "tentatives": 3}}))

    assert archive_url_de(racine, SHA_PDF) is None


def test_cas_10d_archive_url_de_leve_une_erreur_si_manifeste_et_reprise_portent_un_lien(racine: Path) -> None:
    _ecrire(_manifeste_brut(racine, SHA_PDF), _manifeste_fictif({"archive_url": INSTANTANE}))
    _ecrire(_reprise(racine, SHA_PDF), _reprise_fictive())

    with pytest.raises(ArchivageIncoherent, match=SHA_PDF):
        archive_url_de(racine, SHA_PDF)


def test_archive_url_de_leve_une_erreur_si_la_reprise_ne_porte_pas_le_meme_sha256(racine: Path) -> None:
    _ecrire(_manifeste_brut(racine, SHA_PDF), _manifeste_fictif({"echec_archivage": {"service": "wayback_save_page_now", "motif": "x", "tentatives": 3}}))
    _ecrire(_reprise(racine, SHA_PDF), {**_reprise_fictive(), "sha256": "0" * 64})

    with pytest.raises(ArchivageIncoherent, match="0" * 64):
        archive_url_de(racine, SHA_PDF)


def test_archive_url_de_leve_une_erreur_si_le_manifeste_est_absent(racine: Path) -> None:
    with pytest.raises(ManifesteAbsent, match=SHA_PDF):
        archive_url_de(racine, SHA_PDF)


def test_deux_sources_memes_octets_dans_un_meme_lot_la_seconde_reprend_l_archivage_de_la_premiere(
    racine: Path, horloge: HorlogeFactice
) -> None:
    miroir = "https://example.org/miroir/programme.pdf"
    b = banc(
        racine,
        horloge,
        {URL_PDF: reponse(200, PDF), miroir: reponse(200, PDF)},
        [ECHEC, ArchivageReussi(INSTANTANE_REPRISE)],
    )

    resultats = collecter([source(), source(miroir)], b.dependances())

    assert [type(resultat) for resultat in resultats] == [ArchivageManque, ArchivageRepris]
    assert b.archiveur.urls == [URL_PDF, miroir]
    assert archive_url_de(racine, SHA_PDF) == INSTANTANE_REPRISE
    assert code_de_sortie(resultats) != 0
