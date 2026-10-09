"""L'entrée du test des liens : le run et les liens cités par ses réponses obtenues (D20).

Lit `run.json` (identifiant, fin de la fenêtre d'interrogation) et `volume/reponses/*.json`
(`pipeline/interrogation/stockage.ts`, `schema/reponse.schema.json`). Chaque réponse a été validée
contre son schéma à l'écriture ; ce lecteur en revérifie ce qu'il lit, et refuse tout le passage
au premier écart (`EntreeRefusee`), avant la moindre requête : un lien ne reçoit pas de verdict à
partir d'une entrée douteuse.

Rien à tester pour une réponse manquante (pas de `normalise`) ni pour un refus de l'API
(`normalise.liens` vide). Les liens sont pris tels qu'écrits : dédoublonnés sur la chaîne exacte,
sans aucune normalisation. Pour chacun, l'instant de référence est le `horodatage_reponse` le plus
ancien des réponses qui le citent (règle de la session principale, pour la recherche d'instantané).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

STATUTS_REPONSE = frozenset({"obtenue", "manquante"})


class EntreeRefusee(Exception):
    """Le run ou une réponse ne se lit pas comme attendu : rien n'est testé."""


@dataclass(frozen=True)
class RunLu:
    id: str
    fin_fenetre: datetime


def _objet(chemin: Path) -> dict[str, Any]:
    try:
        contenu = json.loads(chemin.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as erreur:
        raise EntreeRefusee(f"{chemin} illisible : {erreur}") from erreur
    if not isinstance(contenu, dict):
        raise EntreeRefusee(f"{chemin} n'est pas un objet JSON")
    return contenu


def _champ(objet: dict[str, Any], chemin_champ: tuple[str, ...], ou: Path) -> Any:
    noeud: Any = objet
    for cle in chemin_champ:
        if not isinstance(noeud, dict) or cle not in noeud:
            raise EntreeRefusee(f"{ou} : champ {'.'.join(chemin_champ)} absent")
        noeud = noeud[cle]
    return noeud


def _instant(valeur: Any, ou: str) -> datetime:
    if not isinstance(valeur, str):
        raise EntreeRefusee(f"{ou} : instant attendu, reçu {valeur!r}")
    try:
        instant = datetime.fromisoformat(valeur)
    except ValueError as erreur:
        raise EntreeRefusee(f"{ou} : instant illisible {valeur!r}") from erreur
    if instant.utcoffset() is None:
        raise EntreeRefusee(f"{ou} : instant sans décalage horaire {valeur!r}")
    return instant


def lire_run(repertoire_run: Path) -> RunLu:
    chemin = repertoire_run / "run.json"
    run = _objet(chemin)
    identifiant = _champ(run, ("id",), chemin)
    if not isinstance(identifiant, str):
        raise EntreeRefusee(f"{chemin} : id n'est pas une chaîne")
    return RunLu(id=identifiant, fin_fenetre=_instant(_champ(run, ("fenetre", "fin"), chemin), f"{chemin} fenetre.fin"))


def _liens_d_une_reponse(chemin: Path, run: RunLu) -> tuple[list[str], datetime | None]:
    """Les liens cités et l'instant de la réponse ; aucun lien pour une réponse manquante."""
    reponse = _objet(chemin)
    if _champ(reponse, ("run_id",), chemin) != run.id:
        raise EntreeRefusee(f"{chemin} : run_id {reponse['run_id']!r} au lieu de {run.id!r}")
    statut = _champ(reponse, ("statut_reponse",), chemin)
    if statut not in STATUTS_REPONSE:
        raise EntreeRefusee(f"{chemin} : statut_reponse inconnu {statut!r}")
    if statut == "manquante":
        return [], None
    liens = _champ(reponse, ("normalise", "liens"), chemin)
    if not isinstance(liens, list) or not all(isinstance(lien, str) for lien in liens):
        raise EntreeRefusee(f"{chemin} : normalise.liens n'est pas une liste de chaînes")
    instant = _instant(_champ(reponse, ("metadonnees", "horodatage_reponse"), chemin), f"{chemin} horodatage_reponse")
    return liens, instant


def _fichiers_de_reponses(repertoire: Path) -> list[Path]:
    if not repertoire.is_dir():
        raise EntreeRefusee(f"{repertoire} absent : aucune réponse à lire")
    entrees = sorted(repertoire.iterdir())
    etrangers = [entree.name for entree in entrees if entree.suffix != ".json" or not entree.is_file()]
    if etrangers:
        raise EntreeRefusee(f"{repertoire} : entrées qui ne sont pas des réponses, ni lues ni ignorées : {etrangers}")
    return entrees


def liens_cites(repertoire_run: Path, run: RunLu) -> dict[str, datetime]:
    """Chaque lien cité (chaîne exacte) → `horodatage_reponse` le plus ancien qui le cite."""
    references: dict[str, datetime] = {}
    for chemin in _fichiers_de_reponses(repertoire_run / "volume" / "reponses"):
        liens, instant = _liens_d_une_reponse(chemin, run)
        for lien in liens:
            if instant is not None and (lien not in references or instant < references[lien]):
                references[lien] = instant
    return references
