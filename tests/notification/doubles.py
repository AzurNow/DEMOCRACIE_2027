"""Doubles des tests de notification : transport factice, mini-serveur SMTP local, bac d'essai.

**Aucun test n'ouvre de connexion SMTP hors du mini-serveur local** : `conftest.py` remplace
`smtplib.SMTP` et `smtplib.SMTP_SSL` par des objets qui lèvent, sauf dans les tests qui demandent
la fixture `serveur_smtp_local` (127.0.0.1, port éphémère, sans TLS).
"""

from __future__ import annotations

import json
import shutil
import socketserver
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

from pipeline.notification.transport import EchecEnvoi

RACINE = Path(__file__).resolve().parents[2]
GABARIT_REEL = RACINE / "validation" / "notifications" / "gabarits" / "courriel.txt"


class SmtpInterdit:
    """Remplace smtplib.SMTP hors du test d'intégration : toute tentative de connexion lève."""

    def __init__(self, *args: object, **kwargs: object) -> None:
        raise AssertionError("Connexion SMTP interdite dans les tests (hors serveur local).")


@dataclass
class TransportFactice:
    """Transport injecté : enregistre les envois, ou lève l'échec demandé."""

    echecs: list[EchecEnvoi] = field(default_factory=list)
    envois: list[tuple[str, bytes]] = field(default_factory=list)

    def envoyer(self, destinataire: str, octets: bytes) -> int:
        if self.echecs:
            raise self.echecs.pop(0)
        self.envois.append((destinataire, octets))
        return 250


class Horloge:
    """Horloge fixe qui avance d'une seconde à chaque lecture : les journaux sont reproductibles."""

    def __init__(self) -> None:
        self._instant = datetime(2026, 10, 2, 9, 0, 0, tzinfo=timezone(timedelta(hours=2)))

    def __call__(self) -> datetime:
        self._instant += timedelta(seconds=1)
        return self._instant


ENV = {
    "BANC_SMTP_HOTE": "127.0.0.1",
    "BANC_SMTP_PORT": "2525",
    "BANC_SMTP_UTILISATEUR": "banc",
    "BANC_SMTP_MOT_DE_PASSE": "secret-de-test",
    "BANC_SMTP_EXPEDITEUR": "contestation@banc-essai.invalid",
}


def due(numero: int, candidat_id: str, evenement: str = "creation") -> dict:
    return {
        "id": f"01JBQ0N0T1F1CAT10N00000{numero:03d}",
        "item_id": f"01JBQ01TEM00000000000000{numero:02d}",
        "candidat_id": candidat_id,
        "evenement": evenement,
        "date": "2026-10-01T10:00:00+02:00",
        "commit": "c" * 40,
    }


def contacts(*candidats: tuple[str, str | None, str]) -> str:
    preuve = {"url": "https://demo.invalid/contact", "date": "2026-09-01", "sha256": "a" * 64, "archive_url": "https://archive.invalid/contact"}
    return json.dumps(
        {
            "candidats": [
                {
                    "candidat_id": candidat_id,
                    "statut_au_gel": statut,
                    "contact_notification": None if adresse is None else {"adresse": adresse, "preuve": preuve},
                }
                for candidat_id, adresse, statut in candidats
            ]
        }
    )


class Bac:
    def __init__(self, racine: Path) -> None:
        self.notifications = racine / "notifications"
        self.gabarits = racine / "gabarits"
        self.notifications.mkdir()
        self.gabarits.mkdir()
        # Le gabarit réel, marque provisoire retirée : ce que l'auteur aura réécrit.
        texte = GABARIT_REEL.read_text(encoding="utf-8").split("\n", 1)[1]
        (self.gabarits / "courriel.txt").write_text(texte, encoding="utf-8")
        self.gabarit_provisoire = racine / "gabarit-provisoire"
        self.gabarit_provisoire.mkdir()
        shutil.copy(GABARIT_REEL, self.gabarit_provisoire / "courriel.txt")

    def dues(self, *lignes: dict) -> None:
        with open(self.notifications / "dues.jsonl", "a", encoding="utf-8") as fichier:
            for ligne in lignes:
                fichier.write(json.dumps(ligne) + "\n")

    def envois(self) -> list[dict]:
        chemin = self.notifications / "envois.jsonl"
        if not chemin.exists():
            return []
        return [json.loads(ligne) for ligne in chemin.read_text(encoding="utf-8").splitlines()]

    def arguments(self, *reste: str) -> list[str]:
        return [f"--notifications={self.notifications}", f"--gabarits={self.gabarits}", *reste]


@dataclass
class ReglageServeur:
    codes: dict[str, int] = field(default_factory=dict)
    messages: list[bytes] = field(default_factory=list)


class _Gestionnaire(socketserver.StreamRequestHandler):
    def _repondre(self, code: int, texte: str = "OK") -> None:
        self.wfile.write(f"{code} {texte}\r\n".encode())

    def _data(self, reglage: ReglageServeur) -> None:
        self._repondre(354, "fin par <CRLF>.<CRLF>")
        corps = b""
        for ligne in self.rfile:
            if ligne == b".\r\n":
                break
            corps += ligne
        reglage.messages.append(corps)
        self._repondre(reglage.codes.get("DATA", 250))

    def handle(self) -> None:
        reglage: ReglageServeur = self.server.reglage  # type: ignore[attr-defined]
        self._repondre(220, "local")
        for ligne in self.rfile:
            commande = ligne.decode("ascii", "replace")[:4].upper()
            if commande == "EHLO":
                self.wfile.write(b"250-local\r\n250 8BITMIME\r\n")
            elif commande == "DATA":
                self._data(reglage)
            elif commande == "QUIT":
                self._repondre(221)
                return
            else:
                self._repondre(reglage.codes.get(commande, 250))


class ServeurSmtpLocal(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self) -> None:
        super().__init__(("127.0.0.1", 0), _Gestionnaire)
        self.reglage = ReglageServeur()
        self._fil = threading.Thread(target=self.serve_forever, daemon=True)
        self._fil.start()

    @property
    def port(self) -> int:
        return self.server_address[1]

    def arreter(self) -> None:
        self.shutdown()
        self.server_close()
