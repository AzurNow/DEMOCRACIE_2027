"""Lecture et validation de la liste explicite des sources (`config/sources.toml`).

Format : `docs/CONTRATS.md` §5. Un seul champ manquant, inconnu ou hors énumération refuse **tout**
le fichier, avant le moindre téléchargement, avec un message par problème qui nomme la source
fautive. Aucune valeur par défaut.

Les énumérations (tier, type_document, publication), le motif d'identifiant et la table
type de document → tier (§4, conformité n° 11) sont lus dans `schema/commun.schema.json`, où ils
vivent une seule fois : ce module n'en recopie aucun.
"""

from __future__ import annotations

import json
import re
import tomllib
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

RACINE_DEPOT = Path(__file__).resolve().parents[2]
SCHEMA_COMMUN = RACINE_DEPOT / "schema" / "commun.schema.json"

OBLIGATOIRES = ("url", "candidat_id", "tier", "type_document", "date_source", "publication")
MENTION_SITE_PARTI = "site_parti_tient_lieu_de_campagne"
AUTORISES = frozenset((*OBLIGATOIRES, MENTION_SITE_PARTI))


@dataclass(frozen=True)
class Source:
    url: str
    candidat_id: str
    tier: str
    type_document: str
    date_source: date
    publication: str
    site_parti_tient_lieu_de_campagne: bool | None
    """Présent si et seulement si `type_document` vaut `site_parti` ; `None` pour tout autre type."""


class ListeSourcesInvalide(Exception):
    def __init__(self, erreurs: Sequence[str]) -> None:
        super().__init__("\n".join(erreurs))
        self.erreurs = list(erreurs)


CleTable = tuple[str, bool | None]
"""(type_document, mention de site de parti) ; la mention vaut `None` pour tout autre type."""


@dataclass(frozen=True)
class _Referentiel:
    tier: tuple[str, ...]
    type_document: tuple[str, ...]
    publication: tuple[str, ...]
    motif_identifiant: re.Pattern[str]
    tier_par_type: dict[CleTable, str]


class TableTierIllisible(Exception):
    """La table du schéma n'a pas la forme stricte que ce lecteur sait lire : on s'arrête, on ne devine pas."""


def _valeurs(contrainte: dict[str, Any]) -> list[Any]:
    if "const" in contrainte:
        return [contrainte["const"]]
    if isinstance(contrainte.get("enum"), list):
        return list(contrainte["enum"])
    raise TableTierIllisible(f"contrainte ni const ni enum : {contrainte!r}")


def _entrees_de_la_table(conditionnelle: dict[str, Any]) -> dict[CleTable, str]:
    """Une conditionnelle `if type_document [et mention] → then tier` en entrées de la table."""
    si: dict[str, Any] = conditionnelle["if"]["properties"]
    alors = str(conditionnelle["then"]["properties"]["tier"]["const"])
    if set(si) - {"type_document", MENTION_SITE_PARTI}:
        raise TableTierIllisible(f"condition inattendue dans la table des tiers : {sorted(si)}")
    mentions = _valeurs(si[MENTION_SITE_PARTI]) if MENTION_SITE_PARTI in si else [None]
    return {
        (str(type_document), mention): alors
        for type_document in _valeurs(si["type_document"])
        for mention in mentions
    }


def _lire_table(definitions: dict[str, Any]) -> dict[CleTable, str]:
    table: dict[CleTable, str] = {}
    for conditionnelle in definitions["tier_selon_type_document"]["allOf"]:
        entrees = _entrees_de_la_table(conditionnelle)
        doublons = set(entrees) & set(table)
        if doublons:
            raise TableTierIllisible(f"entrée présente deux fois dans la table des tiers : {sorted(doublons)}")
        table.update(entrees)
    return table


def _charger_referentiel() -> _Referentiel:
    definitions = json.loads(SCHEMA_COMMUN.read_text("utf-8"))["$defs"]
    proprietes = definitions["source"]["properties"]
    return _Referentiel(
        tier=tuple(definitions["tier"]["enum"]),
        type_document=tuple(proprietes["type_document"]["enum"]),
        publication=tuple(proprietes["publication"]["enum"]),
        motif_identifiant=re.compile(definitions["identifiant_court"]["pattern"]),
        tier_par_type=_lire_table(definitions),
    )


REFERENTIEL = _charger_referentiel()

# ----------------------------------------------------------------- contrôles d'une valeur


def _hors_enumeration(permis: tuple[str, ...]) -> Callable[[object], str | None]:
    def verifier(valeur: object) -> str | None:
        if valeur in permis:
            return None
        return f"hors énumération : {valeur!r} (attendu : {', '.join(permis)})"

    return verifier


def _verifier_url(valeur: object) -> str | None:
    if not isinstance(valeur, str) or not re.match(r"^https?://", valeur):
        return f"doit être une URL http ou https : {valeur!r}"
    if not urlsplit(valeur).hostname:
        return f"URL sans hôte : {valeur!r}"
    return None


def _verifier_identifiant(valeur: object) -> str | None:
    if isinstance(valeur, str) and REFERENTIEL.motif_identifiant.fullmatch(valeur):
        return None
    return f"identifiant invalide : {valeur!r} (minuscules, chiffres, - et _)"


def _verifier_date(valeur: object) -> str | None:
    # `datetime` hérite de `date` : on exige une date TOML nue, sans heure ni guillemets.
    if type(valeur) is date:
        return None
    return f"doit être une date TOML nue, sans guillemets ni heure (AAAA-MM-JJ) : {valeur!r}"


def _verifier_booleen(valeur: object) -> str | None:
    return None if isinstance(valeur, bool) else f"doit valoir true ou false : {valeur!r}"


CONTROLES: dict[str, Callable[[object], str | None]] = {
    "url": _verifier_url,
    "candidat_id": _verifier_identifiant,
    "tier": _hors_enumeration(REFERENTIEL.tier),
    "type_document": _hors_enumeration(REFERENTIEL.type_document),
    "date_source": _verifier_date,
    "publication": _hors_enumeration(REFERENTIEL.publication),
    MENTION_SITE_PARTI: _verifier_booleen,
}

# ----------------------------------------------------------------- contrôles d'une source


def _problemes_de_cles(table: dict[str, object]) -> list[str]:
    manquants = [f"champ « {champ} » manquant" for champ in OBLIGATOIRES if champ not in table]
    inconnus = [f"champ « {champ} » inconnu" for champ in sorted(set(table) - AUTORISES)]
    return manquants + inconnus


def _problemes_de_valeurs(table: dict[str, object]) -> list[str]:
    problemes = []
    for champ, controle in CONTROLES.items():
        probleme = controle(table[champ]) if champ in table else None
        if probleme is not None:
            problemes.append(f"champ « {champ} » {probleme}")
    return problemes


def _problemes_de_mention(table: dict[str, object]) -> list[str]:
    """§4 : la mention est la note exigée pour un site de parti, et n'a de sens que pour lui."""
    est_site_parti = table.get("type_document") == "site_parti"
    porte_mention = MENTION_SITE_PARTI in table
    if est_site_parti and not porte_mention:
        return [f"champ « {MENTION_SITE_PARTI} » obligatoire pour un type_document site_parti"]
    if porte_mention and not est_site_parti:
        return [f"champ « {MENTION_SITE_PARTI} » réservé au type_document site_parti"]
    return []


def _probleme_de_tier(table: dict[str, object]) -> list[str]:
    """§4 : le tier découle du type de document (et, pour un site de parti, de la mention).

    Muet quand la clé de la table est incomplète ou hors énumération : ce manque est déjà rapporté
    par les contrôles de clés, de valeurs ou de mention, et le tier admis y est indécidable.
    """
    cle = (str(table.get("type_document")), table.get(MENTION_SITE_PARTI))
    admis = REFERENTIEL.tier_par_type.get(cle) if isinstance(cle[1], bool | None) else None
    tier = table.get("tier")
    if admis is None or tier not in REFERENTIEL.tier or tier == admis:
        return []
    mention = "" if cle[1] is None else f" avec {MENTION_SITE_PARTI} = {str(cle[1]).lower()}"
    return [f"champ « tier » {tier!r} incompatible avec type_document {cle[0]!r}{mention} : {admis} attendu (§4)"]


def _nom(numero: int, table: dict[str, object]) -> str:
    url = table.get("url")
    return f"source n°{numero} ({url})" if isinstance(url, str) else f"source n°{numero} (sans url)"


def _erreurs_de_la_source(numero: int, table: dict[str, object]) -> list[str]:
    problemes = (
        _problemes_de_cles(table)
        + _problemes_de_valeurs(table)
        + _problemes_de_mention(table)
        + _probleme_de_tier(table)
    )
    return [f"{_nom(numero, table)} : {probleme}" for probleme in problemes]


# ----------------------------------------------------------------- fichier entier


def _decoder(texte: str) -> dict[str, object]:
    try:
        return tomllib.loads(texte)
    except tomllib.TOMLDecodeError as erreur:
        raise ListeSourcesInvalide([f"TOML mal formé : {erreur}"]) from erreur


def _tables(donnees: dict[str, object]) -> list[dict[str, object]]:
    inconnues = sorted(set(donnees) - {"source"})
    if inconnues:
        cles = ", ".join(inconnues)
        raise ListeSourcesInvalide([f"clé de premier niveau inconnue : {cles} (seul [[source]] est admis)"])
    tables = donnees.get("source")
    if tables is None:
        raise ListeSourcesInvalide(["aucune source : le fichier doit contenir au moins une table [[source]]"])
    if not isinstance(tables, list) or not all(isinstance(table, dict) for table in tables):
        raise ListeSourcesInvalide(["« source » doit être un tableau de tables [[source]]"])
    return tables


def _construire(table: dict[str, object]) -> Source:
    mention = table.get(MENTION_SITE_PARTI)
    return Source(
        url=str(table["url"]),
        candidat_id=str(table["candidat_id"]),
        tier=str(table["tier"]),
        type_document=str(table["type_document"]),
        date_source=table["date_source"],  # type: ignore[arg-type]  # contrôlé par _verifier_date
        publication=str(table["publication"]),
        site_parti_tient_lieu_de_campagne=mention if isinstance(mention, bool) else None,
    )


def analyser_sources(texte: str) -> list[Source]:
    tables = _tables(_decoder(texte))
    erreurs = [
        erreur
        for numero, table in enumerate(tables, start=1)
        for erreur in _erreurs_de_la_source(numero, table)
    ]
    if erreurs:
        raise ListeSourcesInvalide(erreurs)
    return [_construire(table) for table in tables]


def lire_sources(chemin: Path) -> list[Source]:
    return analyser_sources(chemin.read_text(encoding="utf-8"))
