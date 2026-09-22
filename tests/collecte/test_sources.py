"""Lecture et validation de la liste des sources (cas limites 1 et 2).

Un champ manquant ou hors énumération refuse **tout** le fichier, avant tout téléchargement, avec un
message qui nomme la source fautive. Aucune valeur par défaut.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from pipeline.collecte.sources import ListeSourcesInvalide, Source, analyser_sources, lire_sources

RACINE_DEPOT = Path(__file__).resolve().parents[2]

SOURCE_VALIDE = """
[[source]]
url = "https://example.org/programme.pdf"
candidat_id = "candidat-a"
tier = "T1"
type_document = "programme_pdf"
date_source = 2026-09-01
publication = "publique"
"""

SITE_PARTI_VALIDE = """
[[source]]
url = "https://example.org/parti"
candidat_id = "candidat-b"
tier = "T1"
type_document = "site_parti"
date_source = 2026-08-15
publication = "publique"
site_parti_tient_lieu_de_campagne = true
"""


def _sans_ligne(texte: str, prefixe: str) -> str:
    return "\n".join(ligne for ligne in texte.splitlines() if not ligne.startswith(prefixe))


def _refus(texte: str) -> list[str]:
    with pytest.raises(ListeSourcesInvalide) as refus:
        analyser_sources(texte)
    return refus.value.erreurs


def test_liste_valide_donne_chaque_champ_fourni() -> None:
    sources = analyser_sources(SOURCE_VALIDE + SITE_PARTI_VALIDE)

    assert sources == [
        Source(
            url="https://example.org/programme.pdf",
            candidat_id="candidat-a",
            tier="T1",
            type_document="programme_pdf",
            date_source=date(2026, 9, 1),
            publication="publique",
            site_parti_tient_lieu_de_campagne=None,
        ),
        Source(
            url="https://example.org/parti",
            candidat_id="candidat-b",
            tier="T1",
            type_document="site_parti",
            date_source=date(2026, 8, 15),
            publication="publique",
            site_parti_tient_lieu_de_campagne=True,
        ),
    ]


def test_l_exemple_du_depot_est_une_liste_valide() -> None:
    sources = lire_sources(RACINE_DEPOT / "pipeline/collecte/exemples/sources.exemple.toml")
    assert len(sources) >= 2
    assert all(source.url.startswith("https://example.org/") for source in sources)


@pytest.mark.parametrize(
    "champ", ["url", "candidat_id", "tier", "type_document", "date_source", "publication"]
)
def test_champ_obligatoire_manquant_refuse_tout_le_fichier(champ: str) -> None:
    texte = SITE_PARTI_VALIDE + _sans_ligne(SOURCE_VALIDE, f"{champ} =")

    erreurs = _refus(texte)

    assert len(erreurs) == 1
    assert "source n°2" in erreurs[0]
    assert "https://example.org/programme.pdf" in erreurs[0] or champ == "url"
    assert champ in erreurs[0]


def test_tier_hors_enumeration_refuse_tout_le_fichier() -> None:
    erreurs = _refus(SOURCE_VALIDE.replace('tier = "T1"', 'tier = "T4"'))

    assert len(erreurs) == 1
    assert "source n°1" in erreurs[0]
    assert "tier" in erreurs[0] and "T4" in erreurs[0]


def test_type_document_et_publication_hors_enumeration_sont_refuses() -> None:
    texte = SOURCE_VALIDE.replace('"programme_pdf"', '"blog"').replace('"publique"', '"privee"')

    erreurs = _refus(texte)

    assert len(erreurs) == 2
    assert any("type_document" in erreur and "blog" in erreur for erreur in erreurs)
    assert any("publication" in erreur and "privee" in erreur for erreur in erreurs)


def test_site_parti_sans_mention_de_tenir_lieu_de_campagne_est_refuse() -> None:
    erreurs = _refus(_sans_ligne(SITE_PARTI_VALIDE, "site_parti_tient_lieu_de_campagne"))

    assert len(erreurs) == 1
    assert "source n°1" in erreurs[0]
    assert "site_parti_tient_lieu_de_campagne" in erreurs[0]


def test_mention_site_parti_sur_un_autre_type_de_document_est_refusee() -> None:
    erreurs = _refus(SOURCE_VALIDE + "site_parti_tient_lieu_de_campagne = false\n")

    assert len(erreurs) == 1
    assert "site_parti_tient_lieu_de_campagne" in erreurs[0]


def test_mention_site_parti_non_booleenne_est_refusee() -> None:
    texte = SITE_PARTI_VALIDE.replace("= true", '= "oui"')
    assert "site_parti_tient_lieu_de_campagne" in _refus(texte)[0]


def test_champ_inconnu_est_refuse_plutot_qu_ignore() -> None:
    erreurs = _refus(SOURCE_VALIDE + 'tiers = "T1"\n')
    assert "tiers" in erreurs[0]


def test_date_source_entre_guillemets_est_refusee() -> None:
    erreurs = _refus(SOURCE_VALIDE.replace("2026-09-01", '"2026-09-01"'))
    assert "date_source" in erreurs[0]


def test_date_source_avec_heure_est_refusee() -> None:
    erreurs = _refus(SOURCE_VALIDE.replace("2026-09-01", "2026-09-01T10:00:00"))
    assert "date_source" in erreurs[0]


def test_url_hors_http_est_refusee() -> None:
    erreurs = _refus(SOURCE_VALIDE.replace("https://example.org", "ftp://example.org"))
    assert "url" in erreurs[0]


def test_candidat_id_hors_motif_est_refuse() -> None:
    erreurs = _refus(SOURCE_VALIDE.replace('"candidat-a"', '"Candidat A"'))
    assert "candidat_id" in erreurs[0]


def test_toutes_les_erreurs_sont_rapportees_ensemble() -> None:
    texte = SOURCE_VALIDE.replace('"T1"', '"T9"') + _sans_ligne(SITE_PARTI_VALIDE, "publication")

    erreurs = _refus(texte)

    assert [erreur.split(" ")[1] for erreur in erreurs] == ["n°1", "n°2"]


def test_liste_vide_est_refusee() -> None:
    assert _refus("") == ["aucune source : le fichier doit contenir au moins une table [[source]]"]


def test_cle_de_premier_niveau_inconnue_est_refusee() -> None:
    assert "sources" in _refus(SOURCE_VALIDE.replace("[[source]]", "[[sources]]"))[0]


def test_toml_mal_forme_est_refuse() -> None:
    assert "TOML" in _refus("[[source]\n")[0]
