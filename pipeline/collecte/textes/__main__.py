"""`uv run python -m pipeline.collecte.textes` (ou `pnpm textes`).

Extrait le texte canonique de chaque contenu collecté qui n'en a pas encore pour l'extracteur en
service ; le texte d'un contenu audio ou vidéo est dérivé de sa transcription (`pnpm transcriptions`
d'abord). Codes de sortie : 0 si chaque contenu est extrait ou déjà extrait ; 1 si au moins un
contenu est refusé (type inconnu, copie locale absente ou altérée, PDF sans couche texte, encodage
non déclaré, transcription absente ou altérée…).
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from pipeline.collecte.horloge import HorlogeSysteme
from pipeline.collecte.sources import RACINE_DEPOT
from pipeline.collecte.textes.extraction import Dependances, code_de_sortie, extraire_tout, formater_rapport
from pipeline.collecte.textes.page_html import extraire_html
from pipeline.collecte.textes.pdf import extraire_pdf
from pipeline.collecte.textes.transcription_vtt import extraire_vtt


def _arguments(arguments: Sequence[str]) -> argparse.Namespace:
    analyseur = argparse.ArgumentParser(
        prog="python -m pipeline.collecte.textes",
        description="Extrait le texte canonique des contenus collectés (docs/CONTRATS.md §1).",
    )
    analyseur.add_argument(
        "--racine", type=Path, default=RACINE_DEPOT, help="racine du dépôt (défaut : ce dépôt)"
    )
    return analyseur.parse_args(list(arguments))


def principal(arguments: Sequence[str]) -> int:
    options = _arguments(arguments)
    deps = Dependances(options.racine, HorlogeSysteme(), extraire_pdf, extraire_html, extraire_vtt)
    resultats = extraire_tout(deps)
    print(formater_rapport(resultats))
    return code_de_sortie(resultats)


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:]))
