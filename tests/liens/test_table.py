"""La table résultat → verdict (D20), lue dans `config/test-liens.toml`, jamais écrite dans le code.

Cas limite 15 : une table ambiguë (un code dans deux verdicts), incomplète (clé manquante, version
absente) ou inconnue (clé, issue ou verdict que le code ne connaît pas) est refusée au chargement,
par une erreur nommée. Puis la table réelle est confrontée, ligne à ligne, au texte de D20.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pipeline.liens.constat import Constat
from pipeline.liens.table import (
    CHEMIN_TABLE,
    TableAmbigue,
    TableIllisible,
    TableIncomplete,
    TableInconnue,
    TableLiens,
    charger_table,
)

TABLE_MINIMALE = """
version = "table-liens-v9"

[tentatives]
maximum = 3
espacement_s = 60

[transitoire]
codes_http = [429]
classes_http = ["5xx"]
issues = ["delai_depasse"]

[verdicts.existe]
codes_http = []
classes_http = ["2xx"]
issues = []

[verdicts.mort]
codes_http = [404]
classes_http = []
issues = ["domaine_inexistant"]

[verdicts.inaccessible]
codes_http = []
classes_http = ["4xx", "5xx"]
issues = ["delai_depasse"]

[verdicts.non_testable]
codes_http = []
classes_http = []
issues = ["robots_interdit"]
"""


def _ecrire(tmp_path: Path, contenu: str) -> Path:
    chemin = tmp_path / "table.toml"
    chemin.write_text(contenu, encoding="utf-8")
    return chemin


def _http(code: int) -> Constat:
    return Constat(issue="reponse_http", code_http=code)


def test_la_table_minimale_se_charge(tmp_path: Path) -> None:
    table = charger_table(_ecrire(tmp_path, TABLE_MINIMALE))
    assert table.version == "table-liens-v9"
    assert table.verdict(_http(404)) == "mort"


def test_cas_15_code_present_dans_deux_verdicts_est_ambigu(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace("[verdicts.inaccessible]\ncodes_http = []", "[verdicts.inaccessible]\ncodes_http = [404]")
    with pytest.raises(TableAmbigue, match="404"):
        charger_table(_ecrire(tmp_path, contenu))


def test_cas_15_issue_presente_dans_deux_verdicts_est_ambigue(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace('issues = ["robots_interdit"]', 'issues = ["robots_interdit", "delai_depasse"]')
    with pytest.raises(TableAmbigue, match="delai_depasse"):
        charger_table(_ecrire(tmp_path, contenu))


def test_cas_15_classe_presente_dans_deux_verdicts_est_ambigue(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace('classes_http = ["2xx"]', 'classes_http = ["2xx", "5xx"]')
    with pytest.raises(TableAmbigue, match="5xx"):
        charger_table(_ecrire(tmp_path, contenu))


def test_cas_15_cle_manquante_est_une_table_incomplete(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace("espacement_s = 60\n", "")
    with pytest.raises(TableIncomplete, match="espacement_s"):
        charger_table(_ecrire(tmp_path, contenu))


def test_cas_15_verdict_manquant_est_une_table_incomplete(tmp_path: Path) -> None:
    debut = TABLE_MINIMALE.index("[verdicts.non_testable]")
    with pytest.raises(TableIncomplete, match="non_testable"):
        charger_table(_ecrire(tmp_path, TABLE_MINIMALE[:debut]))


def test_cas_15_version_absente_est_une_table_incomplete(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace('version = "table-liens-v9"\n', "")
    with pytest.raises(TableIncomplete, match="version"):
        charger_table(_ecrire(tmp_path, contenu))


@pytest.mark.parametrize(
    ("avant", "apres", "motif"),
    [
        ('version = "table-liens-v9"', 'version = "v9"', "version"),
        ('issues = ["robots_interdit"]', 'issues = ["robots_interdit", "lien_suspect"]', "lien_suspect"),
        ('classes_http = ["2xx"]', 'classes_http = ["2xx", "6xx"]', "6xx"),
        ("codes_http = [404]", "codes_http = [404, 999]", "999"),
        ("[verdicts.mort]", "[verdicts.perime]\ncodes_http = []\nclasses_http = []\nissues = []\n\n[verdicts.mort]", "perime"),
        ("[tentatives]", "agent = 'x'\n\n[tentatives]", "agent"),
    ],
)
def test_cas_15_table_inconnue(tmp_path: Path, avant: str, apres: str, motif: str) -> None:
    with pytest.raises(TableInconnue, match=motif):
        charger_table(_ecrire(tmp_path, TABLE_MINIMALE.replace(avant, apres, 1)))


def test_tentatives_nulles_refusees(tmp_path: Path) -> None:
    with pytest.raises(TableInconnue, match="maximum"):
        charger_table(_ecrire(tmp_path, TABLE_MINIMALE.replace("maximum = 3", "maximum = 0")))


def test_toml_illisible_est_nomme(tmp_path: Path) -> None:
    with pytest.raises(TableIllisible):
        charger_table(_ecrire(tmp_path, "version = "))


# --------------------------------------------------------------------- la table réelle, contre D20


@pytest.fixture
def table() -> TableLiens:
    return charger_table(CHEMIN_TABLE)


@pytest.mark.parametrize("code", [200, 201, 204, 206, 299])
def test_d20_2xx_existe(table: TableLiens, code: int) -> None:
    assert table.verdict(_http(code)) == "existe"


@pytest.mark.parametrize("code", [404, 410])
def test_d20_404_410_mort(table: TableLiens, code: int) -> None:
    assert table.verdict(_http(code)) == "mort"


@pytest.mark.parametrize("code", [400, 401, 403, 405, 418, 429, 451, 500, 502, 503, 599])
def test_d20_autres_4xx_et_5xx_inaccessible(table: TableLiens, code: int) -> None:
    assert table.verdict(_http(code)) == "inaccessible"


@pytest.mark.parametrize(
    ("issue", "verdict"),
    [
        ("domaine_inexistant", "mort"),
        ("delai_depasse", "inaccessible"),
        ("connexion_refusee", "inaccessible"),
        ("erreur_tls", "inaccessible"),
        ("robots_injoignable", "inaccessible"),
        ("robots_interdit", "non_testable"),
        ("schema_non_http", "non_testable"),
        ("url_malformee", "non_testable"),
        ("redirections_excessives", "non_testable"),
        ("boucle_redirection", "non_testable"),
    ],
)
def test_d20_issues(table: TableLiens, issue: str, verdict: str) -> None:
    assert table.verdict(Constat(issue=issue, code_http=None)) == verdict


@pytest.mark.parametrize(
    "constat",
    [
        Constat(issue="reponse_http", code_http=304),
        Constat(issue="reponse_http", code_http=100),
        Constat(issue="erreur_reseau", code_http=None),
        Constat(issue="redirection_sans_location", code_http=302),
        Constat(issue="url_non_ascii", code_http=None),
    ],
)
def test_d20_ne_dit_rien_de_ces_issues_donc_aucun_verdict(table: TableLiens, constat: Constat) -> None:
    """Jamais supposé : une issue que D20 ne classe pas n'a pas de verdict (question à l'auteur)."""
    assert table.verdict(constat) is None


def test_d20_tentatives_et_transitoires(table: TableLiens) -> None:
    assert table.version == "table-liens-v1"
    assert (table.tentatives_max, table.espacement_s) == (3, 60.0)
    transitoires = [_http(429), _http(500), _http(503), Constat(issue="delai_depasse", code_http=None),
                    Constat(issue="connexion_refusee", code_http=None)]
    definitifs = [_http(404), _http(410), _http(403), _http(200), Constat(issue="erreur_tls", code_http=None),
                  Constat(issue="domaine_inexistant", code_http=None)]
    assert all(table.est_transitoire(c) for c in transitoires)
    assert not any(table.est_transitoire(c) for c in definitifs)
