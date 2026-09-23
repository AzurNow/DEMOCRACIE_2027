"""Orchestration de C2 : un texte et une fiche par contenu, jamais réécrits ; refus nommés."""

from __future__ import annotations

import hashlib
from pathlib import Path

from pipeline.collecte.textes.extraction import (
    AttendC3,
    DejaExtrait,
    Extrait,
    Refuse,
    code_de_sortie,
    extraire_tout,
    formater_rapport,
)
from tests.collecte.banc_textes import (
    VERSION_PYTHON_FIGEE,
    dependances,
    deposer,
    fiche_extraction,
    fichiers,
    texte_ecrit,
)
from tests.collecte.doubles import HorlogeFactice

HTML = "<p>Première ligne</p><p>e\u0301te\u0301</p>".encode()
TEXTE_HTML = "Première ligne\nété"
SHA_TEXTE_HTML = hashlib.sha256(TEXTE_HTML.encode()).hexdigest()
UTF8 = "text/html; charset=utf-8"


def test_page_html_texte_puis_fiche_ecrits(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, HTML, UTF8, ".html")

    resultats = extraire_tout(dependances(racine, horloge))

    assert resultats == [Extrait(sha, SHA_TEXTE_HTML, "html.parser")]
    assert texte_ecrit(racine, SHA_TEXTE_HTML) == TEXTE_HTML.encode()
    assert fiche_extraction(racine, sha, SHA_TEXTE_HTML) == {
        "sha256_source": sha,
        "texte_sha256": SHA_TEXTE_HTML,
        "longueur": len(TEXTE_HTML),
        "date_extraction": "2026-09-22T14:30:05+02:00",
        "extracteur": {"outil": "html.parser", "version": VERSION_PYTHON_FIGEE, "options": {"regle": "blocs-1"}},
        "encodage": {"nom": "utf-8", "origine": "content-type"},
    }
    assert code_de_sortie(resultats) == 0


def test_second_passage_n_ecrit_rien(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, HTML, UTF8)
    extraire_tout(dependances(racine, horloge))
    avant = fichiers(racine)
    horloge.instant = horloge.instant.replace(day=23)

    resultats = extraire_tout(dependances(racine, horloge))

    assert resultats == [DejaExtrait(sha, SHA_TEXTE_HTML)]
    assert fichiers(racine) == avant
    assert code_de_sortie(resultats) == 0


def test_pdf_passe_par_l_extracteur_pdf_avec_ses_pages(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, b"%PDF-1.7 factice", "application/pdf", ".pdf")

    [resultat] = extraire_tout(dependances(racine, horloge))

    assert isinstance(resultat, Extrait)
    assert resultat.outil == "pymupdf"
    fiche = fiche_extraction(racine, sha, resultat.texte_sha256)
    assert fiche["pages"] == [{"numero": 1, "debut": 0, "fin": 39}, {"numero": 2, "debut": 40, "fin": 50}]  # emoji et ligature : un point de code chacun
    assert "encodage" not in fiche
    assert texte_ecrit(racine, resultat.texte_sha256).decode().split("\f")[1] == "Page deux\n"


def test_deux_documents_de_meme_texte_un_texte_deux_fiches(racine: Path, horloge: HorlogeFactice) -> None:
    sha_a = deposer(racine, HTML, UTF8)
    sha_b = deposer(racine, b"<div>" + HTML + b"</div>", UTF8)

    resultats = extraire_tout(dependances(racine, horloge))

    assert sorted(resultats, key=lambda r: r.sha256_source) == sorted(
        [Extrait(sha_a, SHA_TEXTE_HTML, "html.parser"), Extrait(sha_b, SHA_TEXTE_HTML, "html.parser")],
        key=lambda r: r.sha256_source,
    )
    textes = [nom for nom in fichiers(racine) if nom.startswith("staging/textes/")]
    assert textes == [f"staging/textes/{SHA_TEXTE_HTML}.txt"]
    assert fiche_extraction(racine, sha_a, SHA_TEXTE_HTML)["sha256_source"] == sha_a
    assert fiche_extraction(racine, sha_b, SHA_TEXTE_HTML)["sha256_source"] == sha_b


def test_texte_present_sans_fiche_la_fiche_est_ajoutee(racine: Path, horloge: HorlogeFactice) -> None:
    """Lot interrompu entre l'écriture du texte et celle de la fiche."""
    sha = deposer(racine, HTML, UTF8)
    chemin = racine / "staging" / "textes" / f"{SHA_TEXTE_HTML}.txt"
    chemin.parent.mkdir(parents=True)
    chemin.write_bytes(TEXTE_HTML.encode())

    assert extraire_tout(dependances(racine, horloge)) == [Extrait(sha, SHA_TEXTE_HTML, "html.parser")]


def test_audio_et_video_attendent_c3_sans_echec(racine: Path, horloge: HorlogeFactice) -> None:
    sha_audio = deposer(racine, b"ID3 audio", "audio/mpeg")
    sha_video = deposer(racine, b"\x00\x00video", "video/mp4")

    resultats = extraire_tout(dependances(racine, horloge))

    assert sorted(resultats, key=lambda r: r.sha256_source) == sorted(
        [AttendC3(sha_audio, "audio/mpeg"), AttendC3(sha_video, "video/mp4")], key=lambda r: r.sha256_source
    )
    assert code_de_sortie(resultats) == 0
    assert not (racine / "staging" / "textes").exists()


def test_sans_content_type_refus_jamais_devine(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, b"%PDF-1.7 sans en-tete", None)

    resultats = extraire_tout(dependances(racine, horloge))

    assert resultats == [Refuse(sha, "aucun Content-Type reçu : type inconnu, jamais deviné")]
    assert code_de_sortie(resultats) == 1


def test_type_non_pris_en_charge_refus(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, b"%PDF-1.7", "application/octet-stream")

    assert extraire_tout(dependances(racine, horloge)) == [
        Refuse(sha, "type de contenu non pris en charge : application/octet-stream")
    ]


def test_copie_locale_absente_refus(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, HTML, UTF8, ".html")
    (racine / "archives" / sha[:2] / f"{sha}.html").unlink()

    [resultat] = extraire_tout(dependances(racine, horloge))

    assert resultat == Refuse(sha, f"copie locale absente : archives/{sha[:2]}/{sha}.html")


def test_copie_locale_alteree_refus(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, HTML, UTF8, ".html")
    (racine / "archives" / sha[:2] / f"{sha}.html").write_bytes(HTML + b" ")

    [resultat] = extraire_tout(dependances(racine, horloge))

    assert isinstance(resultat, Refuse)
    assert resultat.motif.startswith("copie locale altérée")
    assert not (racine / "staging" / "textes").exists()


def test_texte_existant_altere_refus_sans_reecriture(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, HTML, UTF8)
    chemin = racine / "staging" / "textes" / f"{SHA_TEXTE_HTML}.txt"
    chemin.parent.mkdir(parents=True)
    chemin.write_bytes(b"autre chose")

    [resultat] = extraire_tout(dependances(racine, horloge))

    assert resultat == Refuse(sha, f"texte existant altéré : staging/textes/{SHA_TEXTE_HTML}.txt")
    assert chemin.read_bytes() == b"autre chose"
    assert not (racine / "staging" / "extractions").exists()


def test_refus_d_extraction_nomme_et_rien_ecrit(racine: Path, horloge: HorlogeFactice) -> None:
    sha = deposer(racine, "<p>été</p>".encode(), "text/html")

    [resultat] = extraire_tout(dependances(racine, horloge))

    assert isinstance(resultat, Refuse)
    assert "aucun encodage déclaré" in resultat.motif
    assert not (racine / "staging" / "textes").exists()


def test_un_refus_n_arrete_pas_le_lot(racine: Path, horloge: HorlogeFactice) -> None:
    deposer(racine, b"x", None)
    deposer(racine, HTML, UTF8)

    resultats = extraire_tout(dependances(racine, horloge))

    assert sorted(type(r).__name__ for r in resultats) == ["Extrait", "Refuse"]
    assert code_de_sortie(resultats) == 1


def test_les_fiches_de_source_ne_sont_pas_prises_pour_des_manifestes(racine: Path, horloge: HorlogeFactice) -> None:
    deposer(racine, HTML, UTF8)
    fiche = racine / "staging" / "sources" / "par-source" / "cle" / "sha.json"
    fiche.parent.mkdir(parents=True)
    fiche.write_text("{}", encoding="utf-8")

    assert len(extraire_tout(dependances(racine, horloge))) == 1


def test_rien_de_collecte_rien_a_faire(racine: Path, horloge: HorlogeFactice) -> None:
    resultats = extraire_tout(dependances(racine, horloge))
    assert resultats == []
    assert code_de_sortie(resultats) == 0


def test_rapport_une_ligne_par_contenu_et_bilan() -> None:
    rapport = formater_rapport(
        [
            Extrait("a" * 64, "b" * 64, "pymupdf"),
            DejaExtrait("c" * 64, "d" * 64),
            AttendC3("e" * 64, "audio/mpeg"),
            Refuse("f" * 64, "PDF sans couche texte"),
        ]
    )
    lignes = rapport.splitlines()
    assert lignes[0] == f"extrait         {'a' * 64}  → {'b' * 64} (pymupdf)"
    assert lignes[3] == f"REFUSÉ          {'f' * 64}  PDF sans couche texte"
    assert lignes[-1] == "bilan : 1 extrait(s), 1 déjà extrait(s), 1 en attente de C3, 1 refusé(s)"
