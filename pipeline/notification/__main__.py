"""`pnpm notifier` : `node … outils/contacts.ts | uv run python -m pipeline.notification [options]`.

Simulation par défaut : liste ce qui partirait, n'envoie et n'écrit rien. `--envoyer` exige les
variables BANC_SMTP_HOTE, BANC_SMTP_PORT, BANC_SMTP_UTILISATEUR, BANC_SMTP_MOT_DE_PASSE et
BANC_SMTP_EXPEDITEUR (l'adresse dédiée), et des gabarits rédigés par l'auteur (un gabarit encore
marqué « Gabarit provisoire » est refusé) ; sinon rien n'est écrit. `--relancer=<envoi_id>`
renvoie un envoi indéterminé, et rien d'autre. Aucune commande ne commite : la commande Git est
imprimée.

Codes de sortie : 0 si tout est réglé ; 1 si un envoi a échoué ou qu'un envoi reste indéterminé ;
2 si l'exécution est refusée avant tout envoi.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime
from pathlib import Path

from pipeline.notification import courriel
from pipeline.notification.journal import FichierNotificationsInvalide
from pipeline.notification.notifier import (
    CODE_REFUS,
    ContactsInvalides,
    Execution,
    Transport,
    executer,
    lire_contacts,
    relancer,
)
from pipeline.notification.transport import ParametresSmtp, TransportSmtp

RACINE_DEPOT = Path(__file__).resolve().parents[2]
VARIABLES = ("HOTE", "PORT", "UTILISATEUR", "MOT_DE_PASSE", "EXPEDITEUR")


class Refus(Exception):
    """L'exécution ne commence pas : rien n'est envoyé ni écrit."""


def _arguments(arguments: Sequence[str]) -> argparse.Namespace:
    analyseur = argparse.ArgumentParser(prog="python -m pipeline.notification", description=__doc__)
    analyseur.add_argument("--racine", type=Path, default=RACINE_DEPOT)
    analyseur.add_argument("--notifications", type=Path, default=None)
    analyseur.add_argument("--gabarits", type=Path, default=None)
    analyseur.add_argument("--envoyer", action="store_true")
    analyseur.add_argument("--relancer", default=None, metavar="ENVOI_ID")
    return analyseur.parse_args(list(arguments))


def parametres_smtp(env: Mapping[str, str]) -> ParametresSmtp:
    manquantes = [f"BANC_SMTP_{nom}" for nom in VARIABLES if not env.get(f"BANC_SMTP_{nom}")]
    if manquantes:
        raise Refus(f"--envoyer exige {', '.join(manquantes)} : rien n'est envoyé ni écrit.")
    port = env["BANC_SMTP_PORT"]
    if not port.isdigit():
        raise Refus(f"BANC_SMTP_PORT n'est pas un entier : {port!r}")
    return ParametresSmtp(
        env["BANC_SMTP_HOTE"], int(port), env["BANC_SMTP_UTILISATEUR"], env["BANC_SMTP_MOT_DE_PASSE"], env["BANC_SMTP_EXPEDITEUR"]
    )


def _transport(options: argparse.Namespace, gabarits: courriel.Gabarits, env: Mapping[str, str], fabrique) -> tuple:
    if not options.envoyer:
        return None, None
    parametres = parametres_smtp(env)
    if gabarits.provisoire:
        raise Refus("gabarit encore marqué « Gabarit provisoire » : l'auteur le réécrit avant tout envoi réel.")
    return fabrique(parametres), parametres.expediteur


def principal(
    arguments: Sequence[str],
    entree: str,
    env: Mapping[str, str],
    fabrique: Callable[[ParametresSmtp], Transport] = TransportSmtp,
    maintenant: Callable[[], datetime] = lambda: datetime.now().astimezone(),
    sortie: Callable[[str], None] = sys.stdout.write,
) -> int:
    options = _arguments(arguments)
    repertoire = options.notifications or options.racine / "validation" / "notifications"
    try:
        gabarits = courriel.lire_gabarits(options.gabarits or repertoire / "gabarits")
        transport, expediteur = _transport(options, gabarits, env, fabrique)
        execution = Execution(repertoire, gabarits, lire_contacts(entree), maintenant, transport, expediteur, sortie)
        code = relancer(execution, options.relancer) if options.relancer else executer(execution)
    except (Refus, courriel.GabaritInvalide, ContactsInvalides, FichierNotificationsInvalide) as erreur:
        sys.stderr.write(f"{erreur}\n")
        return CODE_REFUS
    if execution.ecrit > 0:
        sortie(
            "\nRien n'est commité : c'est vous qui signez.\n\n"
            "  git add validation/notifications/envois.jsonl\n"
            f'  git commit -m "validation: journal des envois de notifications ({execution.ecrit} ligne(s))"\n'
        )
    return code


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:], sys.stdin.read(), os.environ))
