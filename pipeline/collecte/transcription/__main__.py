"""`uv run python -m pipeline.collecte.transcription` (ou `pnpm transcriptions`).

Transcrit chaque contenu audio ou vidéo collecté qui n'a pas encore de `.vtt`. Au premier lancement,
les poids du modèle sont téléchargés à la révision épinglée dans `modeles/` (hors Git) ; ensuite tout
tourne hors ligne. Codes de sortie : 0 si chaque contenu est transcrit ou l'était déjà ; 1 si au
moins un contenu est refusé (copie locale absente ou altérée, transcription vide, segment
inutilisable, `.vtt` ou fiche orphelin) ; 2 si le modèle est inutilisable (poids absents ou
d'empreinte fausse), auquel cas rien n'a été transcrit.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from pipeline.collecte.horloge import HorlogeSysteme
from pipeline.collecte.sources import RACINE_DEPOT
from pipeline.collecte.transcription.modele import Transcripteur, charger_transcripteur
from pipeline.collecte.transcription.poids import EmpreintePoidsInvalide, PoidsAbsent
from pipeline.collecte.transcription.transcription import (
    Dependances,
    code_de_sortie,
    formater_rapport,
    transcrire_tout,
)

CODE_MODELE_INUTILISABLE = 2


def _arguments(arguments: Sequence[str]) -> argparse.Namespace:
    analyseur = argparse.ArgumentParser(
        prog="python -m pipeline.collecte.transcription",
        description="Transcrit en local les enregistrements audio et vidéo collectés (docs/CONTRATS.md §2).",
    )
    analyseur.add_argument(
        "--racine", type=Path, default=RACINE_DEPOT, help="racine du dépôt (défaut : ce dépôt)"
    )
    return analyseur.parse_args(list(arguments))


def principal(
    arguments: Sequence[str],
    charger: Callable[[Path], Transcripteur] = charger_transcripteur,
) -> int:
    options = _arguments(arguments)
    deps = Dependances(options.racine, HorlogeSysteme(), lambda: charger(options.racine))
    try:
        resultats = transcrire_tout(deps)
    except (PoidsAbsent, EmpreintePoidsInvalide) as refus:
        print(f"modèle de transcription inutilisable, rien n'a été transcrit : {refus}", file=sys.stderr)
        return CODE_MODELE_INUTILISABLE
    print(formater_rapport(resultats))
    return code_de_sortie(resultats)


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:]))
