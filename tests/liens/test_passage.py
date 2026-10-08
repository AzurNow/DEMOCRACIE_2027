"""Le passage de bout en bout : tentatives, verdict lu dans la table, copie conservée, écriture unique.

Cas limites 1, 2, 5, 6, 7, 8, 9, 12, 13, 16 et 17 de la décision D20. La sonde réelle parle à
`TransportFactice` ; l'archiveur et le chercheur d'instantanés sont des doubles (`doubles_liens.py`).
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from pipeline.collecte.reseau import ConnexionRefusee, DelaiDepasse, NomIntrouvable
from pipeline.liens.entree import EntreeRefusee, liens_cites, lire_run
from pipeline.liens.instantanes import InstantaneAbsent, InstantaneTrouve, RechercheEchouee
from pipeline.liens.passage import code_de_sortie, formater_bilan, passer
from pipeline.liens.sortie import nom_resultat
from tests.collecte.doubles import Route, reponse
from tests.liens.doubles_liens import (
    ArchiveurFactice,
    Banc,
    ChercheurFactice,
    banc,
    ecrire_manquante,
    ecrire_reponse,
    ecrire_run,
    reussite,
)

ROBOTS = "https://example.org/robots.txt"
ROBOTS_OUVERT = reponse(200, b"User-agent: *\nAllow: /\n")
A = "https://example.org/a"
PARIS = timezone(timedelta(hours=2))
REFERENCE = datetime(2026, 9, 21, 10, 0, 0, tzinfo=PARIS)


def _passer(b: Banc, tmp_path: Path, *urls: str) -> tuple[list, Path]:
    repertoire = tmp_path / "liens"
    bilans = passer({url: REFERENCE for url in urls}, repertoire, b.deps)
    return bilans, repertoire


def _resultat(repertoire: Path, url: str) -> dict:
    return json.loads((repertoire / nom_resultat(url)).read_text(encoding="utf-8"))


# ------------------------------------------------------------------------------ existe


def test_cas_1_200_direct_existe_corps_stocke_sha256_exact_save_page_now(tmp_path: Path) -> None:
    corps = b"\xef\xbb\xbf<html>Programme\r\n</html>"
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(200, corps, content_type="text/html; charset=utf-8")},
             archiveur=ArchiveurFactice(reussite(A)))

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    sha256 = hashlib.sha256(corps).hexdigest()
    assert resultat["verdict_existence"] == "existe"
    assert resultat["sha256_contenu"] == sha256
    assert resultat["code_http"] == 200
    assert resultat["url_finale"] == A
    assert resultat["page"] == {"chemin": f"pages/{sha256}.html", "type_contenu_recu": "text/html; charset=utf-8", "taille_octets": len(corps)}
    assert (repertoire / "pages" / f"{sha256}.html").read_bytes() == corps
    assert b.archiveur.urls == [A]
    assert resultat["archive_url"] == reussite(A).archive_url
    assert resultat["wayback"] == {"operation": "wayback_save_page_now", "issue": "reussi", "archive_url": reussite(A).archive_url}
    assert b.chercheur.demandes == []
    assert [x.etat for x in bilans] == ["teste"]


def test_cas_1_save_page_now_en_echec_pas_d_archive_url(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(200, b"x")})

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "existe"
    assert "archive_url" not in resultat
    assert resultat["wayback"] == {"operation": "wayback_save_page_now", "issue": "echec", "motif": "HTTP 503 sans instantané daté", "tentatives": 3}
    assert resultat["page"]["type_contenu_recu"] is None
    assert resultat["page"]["chemin"].endswith(".bin")
    assert bilans[0].echec_wayback is not None
    assert code_de_sortie(bilans) == 0


def test_cas_2_soft_404_servie_en_200_existe(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(200, "<h1>Page introuvable</h1>".encode(), content_type="text/html")})
    _bilans, repertoire = _passer(b, tmp_path, A)
    assert _resultat(repertoire, A)["verdict_existence"] == "existe"


def test_cas_3_redirections_suivies_url_finale_derniere_cible(tmp_path: Path) -> None:
    b2, c = "https://example.org/b", "https://example.org/c"
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(301, location=b2), b2: reponse(302, location=c), c: reponse(200, b"ok")})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert (resultat["verdict_existence"], resultat["url_finale"], resultat["code_http"]) == ("existe", c, 200)
    assert b.archiveur.urls == [A]


def test_cas_4_six_redirections_et_boucle_non_testables(tmp_path: Path) -> None:
    routes: dict[str, Route] = {ROBOTS: ROBOTS_OUVERT}
    etapes = [f"https://example.org/{n}" for n in range(7)]
    for source, cible in zip(etapes, etapes[1:], strict=False):
        routes[source] = reponse(302, location=cible)
    boucle_a, boucle_b = "https://example.org/x", "https://example.org/y"
    routes[boucle_a] = reponse(301, location=boucle_b)
    routes[boucle_b] = reponse(301, location=boucle_a)
    b = banc(routes)

    _bilans, repertoire = _passer(b, tmp_path, etapes[0], boucle_a)

    assert _resultat(repertoire, etapes[0])["verdict_existence"] == "non_testable"
    assert _resultat(repertoire, etapes[0])["tentatives"][0]["issue"] == "redirections_excessives"
    assert _resultat(repertoire, boucle_a)["verdict_existence"] == "non_testable"
    assert _resultat(repertoire, boucle_a)["tentatives"][0]["issue"] == "boucle_redirection"


# ------------------------------------------------------------------------------ mort


@pytest.mark.parametrize("code", [404, 410])
def test_cas_5_404_et_410_morts_apres_une_seule_tentative(tmp_path: Path, code: int) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [reponse(code)]})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "mort"
    assert resultat["code_http"] == code
    assert len(resultat["tentatives"]) == 1
    assert b.horloge.sommeils == [1.0]  # la cadence entre robots.txt et l'URL ; aucune attente de 60 s
    assert resultat["wayback"] == {"operation": "aucune"}
    assert "archive_url" not in resultat and "sha256_contenu" not in resultat
    assert b.archiveur.urls == [] and b.chercheur.demandes == []


def test_cas_5_echec_dns_mort(tmp_path: Path) -> None:
    url = "https://inexistant.example/page"
    b = banc({"https://inexistant.example/robots.txt": NomIntrouvable("nodename nor servname provided")})

    _bilans, repertoire = _passer(b, tmp_path, url)

    resultat = _resultat(repertoire, url)
    assert (resultat["verdict_existence"], resultat["code_http"]) == ("mort", None)
    assert resultat["tentatives"][0]["issue"] == "domaine_inexistant"
    assert len(resultat["tentatives"]) == 1


# ------------------------------------------------------------------------------ transitoires


def test_cas_6_503_503_200_existe_a_la_troisieme_tentative(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [reponse(503), reponse(503), reponse(200, b"enfin")]})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "existe"
    assert b.horloge.sommeils == [1.0, 60.0, 60.0]  # cadence robots.txt → URL, puis deux espacements
    horodatages = [t["horodatage"] for t in resultat["tentatives"]]
    assert horodatages == ["2026-09-22T14:30:05+02:00", "2026-09-22T14:31:06+02:00", "2026-09-22T14:32:06+02:00"]
    assert resultat["date_test"] == horodatages[2]
    assert [(t["numero"], t["issue"], t["code_http"]) for t in resultat["tentatives"]] == [
        (1, "reponse_http", 503), (2, "reponse_http", 503), (3, "reponse_http", 200)]


def test_cas_7_503_trois_fois_inaccessible_instantane_cherche(tmp_path: Path) -> None:
    instantane = InstantaneTrouve(f"http://web.archive.org/web/20260920101010/{A}", "20260920101010", "200")
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [reponse(503), reponse(503), reponse(503)]}, chercheur=ChercheurFactice(instantane))

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert (resultat["verdict_existence"], resultat["code_http"]) == ("inaccessible", 503)
    assert len(resultat["tentatives"]) == 3
    assert b.chercheur.demandes == [(A, REFERENCE)]
    assert b.archiveur.urls == []
    assert resultat["archive_url"] == instantane.archive_url
    assert resultat["wayback"] == {
        "operation": "recherche_instantane", "instant_reference": "2026-09-21T10:00:00+02:00", "issue": "trouve",
        "archive_url": instantane.archive_url, "horodatage_instantane": "20260920101010", "statut_instantane": "200"}
    assert "sha256_contenu" not in resultat


def test_cas_8_delai_depasse_trois_fois_inaccessible_sans_code(tmp_path: Path) -> None:
    delai = DelaiDepasse("délai dépassé (30 s)")
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [delai, delai, delai]})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert (resultat["verdict_existence"], resultat["code_http"]) == ("inaccessible", None)
    assert "url_finale" not in resultat
    assert [t["issue"] for t in resultat["tentatives"]] == ["delai_depasse"] * 3
    assert resultat["tentatives"][0]["motif"] == "délai dépassé (30 s)"


def test_connexion_refusee_puis_200_existe(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [ConnexionRefusee("refusée"), reponse(200, b"ok")]})
    _bilans, repertoire = _passer(b, tmp_path, A)
    assert _resultat(repertoire, A)["verdict_existence"] == "existe"
    assert b.horloge.sommeils == [1.0, 60.0]


@pytest.mark.parametrize(("routes", "tentatives"), [
    ([reponse(403)], 1), ([reponse(401)], 1), ([reponse(429)] * 3, 3), ([reponse(451)], 1), ([reponse(400)], 1)])
def test_cas_9_4xx_inaccessibles(tmp_path: Path, routes: list, tentatives: int) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: list(routes)})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "inaccessible"
    assert len(resultat["tentatives"]) == tentatives


# ------------------------------------------------------------------------------ non testable


def test_cas_10_robots_interdit_non_testable_sans_requete_vers_l_url(tmp_path: Path) -> None:
    url = "https://example.org/prive/x"
    b = banc({ROBOTS: reponse(200, b"User-agent: *\nDisallow: /prive/\n")})

    _bilans, repertoire = _passer(b, tmp_path, url)

    resultat = _resultat(repertoire, url)
    assert (resultat["verdict_existence"], resultat["code_http"]) == ("non_testable", None)
    assert b.transport.urls() == [ROBOTS]
    assert b.chercheur.demandes == [(url, REFERENCE)]


def test_cas_10_robots_injoignable_inaccessible(tmp_path: Path) -> None:
    b = banc({ROBOTS: reponse(503)})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "inaccessible"
    assert resultat["tentatives"][0]["issue"] == "robots_injoignable"
    assert b.transport.urls() == [ROBOTS]


@pytest.mark.parametrize("url", ["ftp://example.org/f.pdf", "javascript:alert(1)", "pas une url"])
def test_cas_11_schema_non_http_ou_chaine_non_url_non_testable_sans_requete(tmp_path: Path, url: str) -> None:
    b = banc({})

    _bilans, repertoire = _passer(b, tmp_path, url)

    resultat = _resultat(repertoire, url)
    assert resultat["verdict_existence"] == "non_testable"
    assert "url_finale" not in resultat
    assert b.transport.urls() == []


def test_cas_14_redirection_vers_schema_non_http_non_testable(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(302, location="javascript:void(0)")})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert (resultat["verdict_existence"], resultat["code_http"]) == ("non_testable", 302)
    assert resultat["tentatives"][0]["issue"] == "schema_non_http"


# ------------------------------------------------------------------------------ Wayback


def test_cas_13_api_sans_instantane_pas_d_archive_url(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(403)}, chercheur=ChercheurFactice(InstantaneAbsent()))

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert "archive_url" not in resultat
    assert resultat["wayback"]["issue"] == "absent"
    assert bilans[0].echec_wayback is None


def test_cas_13_api_en_erreur_consignee_verdict_inchange(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(403)}, chercheur=ChercheurFactice(RechercheEchouee("HTTP 503")))

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "inaccessible"
    assert "archive_url" not in resultat
    assert resultat["wayback"] == {"operation": "recherche_instantane", "instant_reference": "2026-09-21T10:00:00+02:00", "issue": "echec", "motif": "HTTP 503"}
    assert bilans[0].echec_wayback == "recherche_instantane : HTTP 503"
    assert code_de_sortie(bilans) == 0


def test_cas_13_instant_de_reference_est_la_reponse_la_plus_ancienne(tmp_path: Path) -> None:
    run = tmp_path / "run"
    ecrire_run(run)
    ecrire_reponse(run, "01JD0000000000000000000001", [A], "2026-09-21T12:00:00+02:00")
    ecrire_reponse(run, "01JD0000000000000000000002", [A], "2026-09-20T23:30:00+00:00")
    ecrire_reponse(run, "01JD0000000000000000000003", [A], "2026-09-21T01:00:00+02:00")

    liens = liens_cites(run, lire_run(run))

    # 01:00 à +02:00 est 23:00 UTC, plus ancien que 23:30 UTC alors que sa chaîne trie après :
    # la comparaison porte sur les instants, jamais sur les chaînes.
    assert liens == {A: datetime(2026, 9, 21, 1, 0, tzinfo=PARIS)}


# ------------------------------------------------------------------------------ entrée


def test_cas_12_meme_url_citee_par_trois_reponses_testee_une_fois(tmp_path: Path) -> None:
    run = tmp_path / "run"
    ecrire_run(run)
    for n in range(3):
        ecrire_reponse(run, f"01JD000000000000000000000{n}", [A, A], "2026-09-21T12:00:00+02:00")
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [reponse(200, b"ok")]})

    passer(liens_cites(run, lire_run(run)), run / "volume" / "liens", b.deps)

    assert b.transport.urls() == [ROBOTS, A]


def test_cas_12_casse_et_barre_finale_donnent_deux_tests(tmp_path: Path) -> None:
    run = tmp_path / "run"
    ecrire_run(run)
    variantes = ["https://example.org/Page", "https://example.org/page", "https://example.org/page/"]
    ecrire_reponse(run, "01JD0000000000000000000001", variantes, "2026-09-21T12:00:00+02:00")
    b = banc({ROBOTS: ROBOTS_OUVERT, **{v: reponse(200, v.encode()) for v in variantes}})

    passer(liens_cites(run, lire_run(run)), run / "volume" / "liens", b.deps)

    assert b.transport.urls() == [ROBOTS, *sorted(variantes)]
    assert len(list((run / "volume" / "liens").glob("*.json"))) == 3


def test_cas_16_refus_api_et_reponse_manquante_rien_a_tester(tmp_path: Path) -> None:
    run = tmp_path / "run"
    ecrire_run(run)
    ecrire_reponse(run, "01JD0000000000000000000001", [], "2026-09-21T12:00:00+02:00", refus_api=True)
    ecrire_manquante(run, "01JD0000000000000000000002")
    b = banc({})

    liens = liens_cites(run, lire_run(run))
    bilans = passer(liens, run / "volume" / "liens", b.deps)

    assert liens == {}
    assert bilans == []
    assert code_de_sortie(bilans) == 0
    assert b.transport.urls() == []


def test_reponse_d_un_autre_run_refusee(tmp_path: Path) -> None:
    run = tmp_path / "run"
    ecrire_run(run)
    chemin = run / "volume" / "reponses" / "x.json"
    chemin.write_text(json.dumps({"run_id": "01JDAUTRE00000000000000000", "statut_reponse": "manquante"}), encoding="utf-8")
    with pytest.raises(EntreeRefusee, match="run_id"):
        liens_cites(run, lire_run(run))


def test_fichier_etranger_parmi_les_reponses_refuse(tmp_path: Path) -> None:
    run = tmp_path / "run"
    ecrire_run(run)
    (run / "volume" / "reponses" / "notes.txt").write_text("x", encoding="utf-8")
    with pytest.raises(EntreeRefusee, match="notes.txt"):
        liens_cites(run, lire_run(run))


# ------------------------------------------------------------------------------ relance, sans verdict


def test_cas_17_relance_resultat_present_ni_reteste_ni_reecrit(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [reponse(404)]})
    _bilans, repertoire = _passer(b, tmp_path, A)
    chemin = repertoire / nom_resultat(A)
    avant = (chemin.read_bytes(), chemin.stat().st_mtime_ns)

    relance = banc({})
    bilans, _repertoire = _passer(relance, tmp_path, A)

    assert relance.transport.urls() == []
    assert (chemin.read_bytes(), chemin.stat().st_mtime_ns) == avant
    assert [(x.etat, x.verdict) for x in bilans] == [("repris", "mort")]
    assert code_de_sortie(bilans) == 0


def test_cas_17_resultat_present_mais_incoherent_refuse(tmp_path: Path) -> None:
    repertoire = tmp_path / "liens"
    repertoire.mkdir()
    (repertoire / nom_resultat(A)).write_text(json.dumps({"url_citee": "https://autre.example/"}), encoding="utf-8")
    b = banc({})

    bilans = passer({A: REFERENCE}, repertoire, b.deps)

    assert bilans[0].etat == "refuse"
    assert code_de_sortie(bilans) == 1
    assert b.transport.urls() == []


def test_resultat_hors_table_sans_verdict_aucun_fichier_code_1(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(304)})

    bilans, repertoire = _passer(b, tmp_path, A)

    assert bilans[0].etat == "sans_verdict"
    assert "304" in (bilans[0].motif or "")
    assert not (repertoire / nom_resultat(A)).exists()
    assert code_de_sortie(bilans) == 1
    assert "Sans verdict (en attente du test des liens) : 1" in formater_bilan(bilans, "table-liens-v1")


def test_bilan_compte_par_verdict(tmp_path: Path) -> None:
    b2 = "https://example.org/b"
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(404), b2: reponse(200, b"x")})
    bilans, _repertoire = _passer(b, tmp_path, A, b2)

    texte = formater_bilan(bilans, "table-liens-v1")

    assert "teste : 2 (existe 1, mort 1)" in texte
    assert "Échecs Wayback (consignés, verdict inchangé) : 1" in texte
