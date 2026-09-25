"""Le courriel : gabarits rédigés par l'auteur, jamais de texte en dur ici.

`validation/notifications/gabarits/courriel.txt` : les lignes qui précèdent la ligne « Objet : »
sont un en-tête jamais envoyé, sauf « Ligne : », gabarit d'une ligne de la liste (`{item_id}`,
`{evenement}`, `{date}`) ; la ligne « Objet : » donne le sujet ; une ligne vide la sépare du corps.
Champs : `{candidat_id}`, `{nombre}`, `{liste}`.

Un gabarit qui porte encore la marque « Gabarit provisoire » n'est jamais envoyé : `--envoyer` le
refuse avant toute écriture.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import format_datetime
from datetime import datetime
from pathlib import Path

from pipeline.notification.journal import Due

MARQUE_PROVISOIRE = "Gabarit provisoire"
PREFIXE_OBJET = "Objet : "
PREFIXE_LIGNE = "Ligne : "


class GabaritInvalide(Exception):
    """Gabarit absent, mal formé, ou encore provisoire au moment d'envoyer."""


@dataclass(frozen=True)
class Gabarits:
    objet: str
    corps: str
    ligne: str
    provisoire: bool


def lire_gabarits(repertoire: Path) -> Gabarits:
    try:
        courriel = (repertoire / "courriel.txt").read_text(encoding="utf-8")
    except FileNotFoundError as erreur:
        raise GabaritInvalide(f"gabarit absent : {erreur.filename}") from erreur
    lignes = courriel.split("\n")
    rangs = [rang for rang, texte in enumerate(lignes) if texte.startswith(PREFIXE_OBJET)]
    if not rangs or lignes[rangs[0] + 1 : rangs[0] + 2] != [""]:
        raise GabaritInvalide("courriel.txt : une ligne « Objet : », puis une ligne vide, puis le corps")
    debut = rangs[0]
    gabarits_ligne = [texte[len(PREFIXE_LIGNE) :] for texte in lignes[:debut] if texte.startswith(PREFIXE_LIGNE)]
    if len(gabarits_ligne) != 1:
        raise GabaritInvalide("courriel.txt : une ligne « Ligne : » exactement, avant « Objet : »")
    return Gabarits(
        objet=lignes[debut][len(PREFIXE_OBJET) :],
        corps="\n".join(lignes[debut + 2 :]),
        ligne=gabarits_ligne[0],
        provisoire=MARQUE_PROVISOIRE in courriel,
    )


def message_id(identifiant: str, expediteur: str) -> str:
    """Dérivé des identifiants regroupés : un même envoi renvoyé porte le même Message-ID."""
    return f"<{identifiant}@{expediteur.rsplit('@', 1)[1]}>"


def construire(
    gabarits: Gabarits,
    dues: list[Due],
    entetes: dict[str, str],
    date: datetime,
) -> bytes:
    liste = "\n".join(
        gabarits.ligne.format(item_id=due.item_id, evenement=due.evenement, date=due.date) for due in dues
    )
    champs = {"candidat_id": dues[0].candidat_id, "nombre": len(dues), "liste": liste}
    message = EmailMessage()
    message["From"] = entetes["expediteur"]
    message["To"] = entetes["destinataire"]
    message["Subject"] = gabarits.objet.format(**champs)
    message["Message-ID"] = entetes["message_id"]
    message["Date"] = format_datetime(date)
    message.set_content(gabarits.corps.format(**champs))
    return message.as_bytes()


def preuve(octets: bytes) -> str:
    return hashlib.sha256(octets).hexdigest()
