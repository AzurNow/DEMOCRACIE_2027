"""`uv run python -m pipeline.collecte config/sources.toml` (ou `pnpm collecte config/sources.toml`).

Les sources `enregistrement_audio` et `enregistrement_video` sont téléchargées par yt-dlp
(`media.py`), toutes les autres par HTTP. Codes de sortie : 0 si chaque source est collectée, déjà collectée, rattachée par une fiche à un
contenu déjà archivé, ou si son archivage a été repris ; 1 si au moins une source a échoué (HTTP,
robots.txt, réseau, réponse vide, yt-dlp) ou n'a pas pu être sauvegardée sur la Wayback Machine, à la
première collecte comme à la reprise ; 2 si la liste des sources est refusée, auquel cas rien n'a
été téléchargé.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from pipeline.collecte.collecte import Dependances, code_de_sortie, collecter, formater_rapport
from pipeline.collecte.horloge import HorlogeSysteme
from pipeline.collecte.media import YtDlp, telechargeurs_media
from pipeline.collecte.politesse import Cadence, ClientPoli
from pipeline.collecte.reseau import TransportUrllib
from pipeline.collecte.sources import RACINE_DEPOT, ListeSourcesInvalide, lire_sources
from pipeline.collecte.wayback import ArchiveurWayback

DELAI_SOURCES_S = 30.0
DELAI_WAYBACK_S = 120.0  # Save Page Now capture la page avant de répondre : c'est lent.
CODE_LISTE_REFUSEE = 2


def dependances_reelles(racine: Path) -> Dependances:
    horloge = HorlogeSysteme()
    cadence = Cadence(horloge)
    client = ClientPoli(TransportUrllib(delai_s=DELAI_SOURCES_S), cadence)
    return Dependances(
        client=client,
        archiveur=ArchiveurWayback(TransportUrllib(delai_s=DELAI_WAYBACK_S), cadence, horloge),
        horloge=horloge,
        racine=racine,
        medias=telechargeurs_media(client, YtDlp(), racine),
    )


def _arguments(arguments: Sequence[str]) -> argparse.Namespace:
    analyseur = argparse.ArgumentParser(
        prog="python -m pipeline.collecte",
        description="Collecte une liste explicite de sources : archive locale, SHA-256, Wayback, manifeste.",
    )
    analyseur.add_argument("sources", type=Path, help="liste des sources au format TOML (docs/CONTRATS.md §5)")
    analyseur.add_argument(
        "--racine", type=Path, default=RACINE_DEPOT, help="racine du dépôt (défaut : ce dépôt)"
    )
    return analyseur.parse_args(list(arguments))


def principal(
    arguments: Sequence[str],
    construire: Callable[[Path], Dependances] = dependances_reelles,
) -> int:
    options = _arguments(arguments)
    try:
        sources = lire_sources(options.sources)
    except (ListeSourcesInvalide, OSError) as refus:
        print("liste de sources refusée, rien n'a été téléchargé :", file=sys.stderr)
        print(refus, file=sys.stderr)
        return CODE_LISTE_REFUSEE
    resultats = collecter(sources, construire(options.racine))
    print(formater_rapport(resultats))
    return code_de_sortie(resultats)


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:]))
