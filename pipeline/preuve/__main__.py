"""`uv run python -m pipeline.preuve <url> [<url>…]` (ou `pnpm preuve <url> [<url>…]`).

Codes de sortie : 0 si chaque URL a son bloc complet ; 1 si au moins une URL a échoué (robots.txt,
HTTP, réseau, copie locale) ou si Save Page Now a échoué (le bloc est alors imprimé avec
`archive_url:` vide et un commentaire) ; 2 si la ligne de commande ou le fichier d'URL est refusé
avant toute requête. Les autres URL sont toujours traitées.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from pipeline.collecte.horloge import HorlogeSysteme
from pipeline.collecte.politesse import Cadence, ClientPoli
from pipeline.collecte.reseau import TransportUrllib
from pipeline.collecte.wayback import ArchiveurWayback
from pipeline.preuve.entree import Demande, lire_fichier
from pipeline.preuve.sortie import formater_bloc
from pipeline.preuve.traitement import Dependances, EchecPreuve, etablir

DOSSIER_PAR_DEFAUT = Path("scratch/perimetre/preuves")
DELAI_PAGE_S = 30.0
DELAI_WAYBACK_S = 120.0  # Save Page Now capture la page avant de répondre : c'est lent.
CODE_ECHEC = 1
CODE_REFUSE = 2


def dependances_reelles(dossier: Path) -> Dependances:
    horloge = HorlogeSysteme()
    cadence = Cadence(horloge)
    return Dependances(
        client=ClientPoli(TransportUrllib(DELAI_PAGE_S), cadence),
        archiveur=ArchiveurWayback(TransportUrllib(DELAI_WAYBACK_S), cadence, horloge),
        horloge=horloge,
        dossier=dossier,
    )


def _arguments(arguments: Sequence[str]) -> argparse.Namespace:
    analyseur = argparse.ArgumentParser(
        prog="python -m pipeline.preuve",
        description="Archive une preuve du périmètre et imprime son bloc YAML pour config/perimetre.yaml.",
    )
    analyseur.add_argument("urls", nargs="*", help="URL exactes, http ou https")
    analyseur.add_argument("--fichier", type=Path, help="fichier d'URL (une par ligne, # = commentaire)")
    analyseur.add_argument("--dossier", type=Path, default=DOSSIER_PAR_DEFAUT, help="copies locales des pages")
    analyseur.add_argument("--sondage", action="store_true", help="ajoute la ligne institut: (preuve d'un sondage)")
    analyseur.add_argument(
        "--cle-date",
        choices=("date_publication", "date"),
        default="date_publication",
        help="nom de la ligne de date (date pour une déclaration ou une page de contact)",
    )
    return analyseur.parse_args(list(arguments))


def _demandes(options: argparse.Namespace) -> list[Demande]:
    demandes = [Demande(url) for url in options.urls]
    if options.fichier is not None:
        demandes.extend(lire_fichier(options.fichier))
    if not demandes:
        raise ValueError("aucune URL : en donner en argument ou avec --fichier")
    return demandes


def _traiter(demande: Demande, deps: Dependances, options: argparse.Namespace) -> bool:
    """Vrai si le bloc est complet. Un bloc n'est imprimé que si la page a été téléchargée."""
    try:
        preuve = etablir(demande.url, deps)
    except EchecPreuve as echec:
        print(f"ÉCHEC {demande.url} : {echec}", file=sys.stderr)
        return False
    print(formater_bloc(demande, preuve, options.cle_date, options.sondage))
    print()
    if preuve.archive_url is None:
        print(f"ÉCHEC {demande.url} : Save Page Now : {preuve.motif_archivage}", file=sys.stderr)
    return preuve.archive_url is not None


def principal(
    arguments: Sequence[str],
    construire: Callable[[Path], Dependances] = dependances_reelles,
) -> int:
    options = _arguments(arguments)
    try:
        demandes = _demandes(options)
    except (OSError, UnicodeDecodeError, ValueError) as refus:
        print(f"refusé, aucune requête envoyée : {refus}", file=sys.stderr)
        return CODE_REFUSE
    deps = construire(options.dossier)
    resultats = [_traiter(demande, deps, options) for demande in demandes]
    return 0 if all(resultats) else CODE_ECHEC


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:]))
