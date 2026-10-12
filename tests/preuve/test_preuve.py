"""`python -m pipeline.preuve` : blocs YAML, copie locale, échecs sans invention, codes de sortie.

Aucune requête réelle (`doubles_preuve.py`).
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from pipeline.collecte.reseau import ConnexionRefusee
from pipeline.preuve.__main__ import principal
from tests.collecte.doubles import reponse
from tests.preuve.doubles_preuve import HTML, PAGE, ROBOTS_LIBRE, banc, instantane, robots, routes_nominales

URL = "https://example.org/declaration"
AUTRE = "https://autre.example/sondage"
SHA = hashlib.sha256(PAGE).hexdigest()


def lancer(arguments: list[str], routes: dict, dossier: Path):
    b = banc(routes, dossier)
    code = principal([*arguments, "--dossier", str(dossier)], lambda _dossier: b.deps)
    return code, b


def test_url_nominale_bloc_complet_et_octets_copies(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code, b = lancer([URL], routes_nominales(URL), tmp_path)
    sortie = capsys.readouterr()
    assert code == 0
    assert sortie.err == ""
    assert f'url: "{URL}"' in sortie.out
    assert f'sha256: "{SHA}"' in sortie.out
    assert f'archive_url: "{instantane(URL)}"' in sortie.out
    assert "# capture : 2026-09-22T14:30:05+02:00" in sortie.out
    assert "# HTTP 200, type de contenu : text/html; charset=utf-8" in sortie.out
    assert "date_publication:  # à lire sur la page" in sortie.out
    assert "institut" not in sortie.out
    assert "url finale" not in sortie.out
    copie = tmp_path / f"{SHA}.html"
    assert copie.read_bytes() == PAGE
    assert b.transport.urls() == [robots(URL), URL, f"https://web.archive.org/save/{URL}"]


def test_redirection_url_d_origine_conservee_finale_en_commentaire(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    finale = "https://example.org/nouvelle-adresse"
    routes = routes_nominales(URL)
    routes[URL] = reponse(301, location=finale)
    routes[finale] = reponse(200, PAGE, content_type=HTML)
    code, _ = lancer([URL], routes, tmp_path)
    sortie = capsys.readouterr().out
    assert code == 0
    assert f'url: "{URL}"' in sortie
    assert f"# url finale après redirections : {finale}" in sortie
    assert f'url: "{finale}"' not in sortie


def test_robots_interdit_aucun_bloc_ni_sauvegarde(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    routes = routes_nominales(URL)
    routes[robots(URL)] = reponse(200, b"User-agent: *\nDisallow: /\n")
    code, b = lancer([URL], routes, tmp_path)
    sortie = capsys.readouterr()
    assert code == 1
    assert sortie.out == ""
    assert f"ÉCHEC {URL} : interdit par robots.txt" in sortie.err
    assert f"https://web.archive.org/save/{URL}" not in b.transport.urls()
    assert list(tmp_path.iterdir()) == []


def test_404_echec_sans_bloc(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    routes = routes_nominales(URL)
    routes[URL] = reponse(404, b"absent")
    code, b = lancer([URL], routes, tmp_path)
    sortie = capsys.readouterr()
    assert code == 1
    assert sortie.out == ""
    assert f"ÉCHEC {URL} : HTTP 404" in sortie.err
    assert f"https://web.archive.org/save/{URL}" not in b.transport.urls()


def test_erreur_reseau_cause_sur_stderr(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    routes = routes_nominales(URL)
    routes[URL] = ConnexionRefusee("erreur réseau : ConnectionRefusedError: refusé")
    code, _ = lancer([URL], routes, tmp_path)
    sortie = capsys.readouterr()
    assert code == 1
    assert sortie.out == ""
    assert "ConnectionRefusedError" in sortie.err


def test_wayback_en_echec_bloc_imprime_archive_url_vide(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    routes = routes_nominales(URL)
    routes[f"https://web.archive.org/save/{URL}"] = reponse(503)
    code, _ = lancer([URL], routes, tmp_path)
    sortie = capsys.readouterr()
    assert code == 1
    assert f'sha256: "{SHA}"' in sortie.out
    assert "# ARCHIVAGE WAYBACK EN ÉCHEC : HTTP 503 sans instantané daté (3 tentatives)" in sortie.out
    assert "\narchive_url:\n" in sortie.out
    assert 'archive_url: "' not in sortie.out
    assert "Save Page Now" in sortie.err
    assert (tmp_path / f"{SHA}.html").read_bytes() == PAGE


def test_deux_urls_dont_une_echoue(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    routes = routes_nominales(AUTRE)
    routes.update({robots(URL): ROBOTS_LIBRE, URL: reponse(500, b"panne")})
    code, _ = lancer([URL, AUTRE], routes, tmp_path)
    sortie = capsys.readouterr()
    assert code == 1
    assert f'url: "{AUTRE}"' in sortie.out
    assert f'url: "{URL}"' not in sortie.out
    assert f"ÉCHEC {URL} : HTTP 500" in sortie.err


def test_fichier_d_urls_commentaires_recopies(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    fichier = tmp_path / "urls.txt"
    fichier.write_text(
        "# En-tête du fichier, sans URL\n\n# Déclaration de candidature\n# (page de campagne)\n"
        f"{URL}\n\n   \n{AUTRE}\n",
        encoding="utf-8",
    )
    routes = routes_nominales(URL)
    routes.update(routes_nominales(AUTRE))
    code, _ = lancer(["--fichier", str(fichier)], routes, tmp_path / "copies")
    sortie = capsys.readouterr().out
    assert code == 0
    assert "# Déclaration de candidature\n# (page de campagne)\n# capture" in sortie
    assert "En-tête du fichier" not in sortie
    assert sortie.count("sha256:") == 2
    assert sortie.index(URL) < sortie.index(AUTRE)


def test_sondage_ajoute_institut_vide_et_cle_date_au_choix(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code, _ = lancer(["--sondage", "--cle-date", "date", URL], routes_nominales(URL), tmp_path)
    sortie = capsys.readouterr().out
    assert code == 0
    assert "institut:  # à lire sur la page\nurl:" in sortie
    assert "\ndate:  # à lire sur la page\n" in sortie
    assert "date_publication" not in sortie


@pytest.mark.parametrize("url", ["ftp://example.org/x", "file:///etc/passwd", "example.org/x", "https://example.org/a b"])
def test_url_non_http_refusee_sans_requete(url: str, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code, b = lancer([url], {}, tmp_path)
    sortie = capsys.readouterr()
    assert code == 1
    assert sortie.out == ""
    assert f"ÉCHEC {url}" in sortie.err
    assert b.transport.requetes == []


def test_url_non_ascii_envoyee_en_uri_et_imprimee_telle_quelle(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    iri = "https://example.org/éducation"
    uri = "https://example.org/%C3%A9ducation"
    code, b = lancer([iri], routes_nominales(uri), tmp_path)
    sortie = capsys.readouterr().out
    assert code == 0
    assert f'url: "{iri}"' in sortie
    assert uri in b.transport.urls()
    assert f"https://web.archive.org/save/{uri}" in b.transport.urls()


def test_iri_inconvertible_refusee(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code, b = lancer(["https://exa\u0080mple.org/é"], {}, tmp_path)
    sortie = capsys.readouterr()
    assert code == 1
    assert sortie.out == ""
    assert "IRI inconvertible" in sortie.err
    assert b.transport.requetes == []


def test_sans_url_refuse_avant_toute_requete(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code, b = lancer([], {}, tmp_path)
    assert code == 2
    assert "aucune URL" in capsys.readouterr().err
    assert b.transport.requetes == []


def test_fichier_d_urls_introuvable_refuse(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code, _ = lancer(["--fichier", str(tmp_path / "absent.txt")], {}, tmp_path)
    assert code == 2
    assert "refusé" in capsys.readouterr().err


def test_copie_existante_identique_reutilisee_et_differente_refusee(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / f"{SHA}.html").write_bytes(PAGE)
    code, _ = lancer([URL], routes_nominales(URL), tmp_path)
    assert code == 0
    (tmp_path / f"{SHA}.html").write_bytes(b"autre")
    code, _ = lancer([URL], routes_nominales(URL), tmp_path)
    assert code == 1
    assert "autre contenu que son nom annonce" in capsys.readouterr().err
