"""Ce que le test des liens lit dans `schema/` : les verdicts d'existence, et la forme d'un résultat.

Python n'a pas de validateur JSON Schema (aucune dépendance ne s'ajoute). Le contrôle fait ici avant
chaque écriture est donc partiel : clés obligatoires présentes, aucune clé inconnue, verdict dans
l'énumération du schéma de notation. Le contrôle complet est fait côté TypeScript : par ajv sur les
fichiers dorés (`tests/liens/dores-liens.test.ts`) et à chaque lecture par la notation
(`pipeline/notation/fournisseur-fichiers.ts`).
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from functools import cache
from typing import Any

from pipeline.collecte.sources import RACINE_DEPOT

SCHEMA_NOTATION = RACINE_DEPOT / "schema" / "notation.schema.json"
SCHEMA_EXISTENCE = RACINE_DEPOT / "schema" / "existence-lien.schema.json"


class SchemaIllisible(Exception):
    """Un schéma n'a pas la forme que ce lecteur attend : on s'arrête, on ne devine pas."""


class ResultatNonConforme(Exception):
    """Un résultat construit ne respecte pas `schema/existence-lien.schema.json` : il n'est pas écrit."""


def _lire(chemin: Any) -> dict[str, Any]:
    contenu = json.loads(chemin.read_text(encoding="utf-8"))
    if not isinstance(contenu, dict):
        raise SchemaIllisible(f"{chemin} n'est pas un objet JSON")
    return contenu


@cache
def verdicts_existence() -> tuple[str, ...]:
    """L'énumération `verdict_existence` d'un lien de notation, seule source des verdicts."""
    noeud = _lire(SCHEMA_NOTATION)
    for cle in ("properties", "sourcage", "properties", "liens", "items", "properties", "verdict_existence", "enum"):
        if not isinstance(noeud, dict) or cle not in noeud:
            raise SchemaIllisible(f"{SCHEMA_NOTATION} : verdict_existence introuvable (clé {cle})")
        noeud = noeud[cle]
    if not isinstance(noeud, list) or not all(isinstance(v, str) for v in noeud):
        raise SchemaIllisible(f"{SCHEMA_NOTATION} : l'énumération verdict_existence n'est pas une liste de chaînes")
    return tuple(noeud)


@cache
def _forme_resultat() -> tuple[frozenset[str], frozenset[str]]:
    schema = _lire(SCHEMA_EXISTENCE)
    proprietes, obligatoires = schema.get("properties"), schema.get("required")
    if not isinstance(proprietes, dict) or not isinstance(obligatoires, list):
        raise SchemaIllisible(f"{SCHEMA_EXISTENCE} : properties ou required absent")
    return frozenset(proprietes), frozenset(obligatoires)


def verifier_resultat(resultat: Mapping[str, object]) -> None:
    """Lève `ResultatNonConforme` si le résultat n'a pas la forme du schéma (contrôle partiel)."""
    proprietes, obligatoires = _forme_resultat()
    manquantes = sorted(obligatoires - set(resultat))
    inconnues = sorted(set(resultat) - proprietes)
    if manquantes or inconnues:
        raise ResultatNonConforme(f"clés manquantes {manquantes}, clés inconnues {inconnues}")
    if resultat["verdict_existence"] not in verdicts_existence():
        raise ResultatNonConforme(f"verdict inconnu : {resultat['verdict_existence']!r}")
