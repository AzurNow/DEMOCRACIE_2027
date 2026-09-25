"""Transport SMTP, injecté : les tests le remplacent, ou le pointent sur un serveur local.

En production le transport chiffre toujours : TLS implicite sur le port 465, STARTTLS exigé
ailleurs (un serveur qui ne l'offre pas est un échec, jamais un envoi en clair). `tls=False`
n'existe que pour le serveur de test local sur 127.0.0.1.

Le code de réponse retenu est celui de la commande DATA, qui dit si le serveur a accepté le
message ; toute réponse d'erreur ou perte de connexion devient `EchecEnvoi`, avec son code quand
le serveur en a donné un.
"""

from __future__ import annotations

import smtplib
import ssl
from dataclasses import dataclass


class EchecEnvoi(Exception):
    def __init__(self, message: str, code: int | None) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ParametresSmtp:
    hote: str
    port: int
    utilisateur: str
    mot_de_passe: str
    expediteur: str


class TransportSmtp:
    def __init__(self, parametres: ParametresSmtp, tls: bool = True, delai_s: float = 60.0) -> None:
        self._p = parametres
        self._tls = tls
        self._delai_s = delai_s

    def _ouvrir(self) -> smtplib.SMTP:
        if self._tls and self._p.port == 465:
            return smtplib.SMTP_SSL(self._p.hote, self._p.port, timeout=self._delai_s, context=ssl.create_default_context())
        connexion = smtplib.SMTP(self._p.hote, self._p.port, timeout=self._delai_s)
        if self._tls:
            connexion.starttls(context=ssl.create_default_context())
        return connexion

    def _dialoguer(self, connexion: smtplib.SMTP, destinataire: str, octets: bytes) -> int:
        connexion.ehlo()
        if self._tls:
            connexion.login(self._p.utilisateur, self._p.mot_de_passe)
        for commande, reponse in (("MAIL", connexion.mail(self._p.expediteur)), ("RCPT", connexion.rcpt(destinataire))):
            if reponse[0] >= 400:
                raise EchecEnvoi(f"{commande} refusé : {reponse[1]!r}", reponse[0])
        code, texte = connexion.data(octets)
        if code >= 400:
            raise EchecEnvoi(f"DATA refusé : {texte!r}", code)
        return code

    def envoyer(self, destinataire: str, octets: bytes) -> int:
        # Pas de `with` : sa sortie envoie QUIT et lève si la réponse n'est pas 221 ; un message déjà
        # accepté par DATA serait alors journalisé en échec, puis renvoyé. La connexion est fermée
        # sans QUIT : l'issue de l'envoi est celle de DATA, et d'elle seule.
        connexion = None
        try:
            connexion = self._ouvrir()
            return self._dialoguer(connexion, destinataire, octets)
        except smtplib.SMTPResponseException as erreur:
            raise EchecEnvoi(f"réponse SMTP {erreur.smtp_code} : {erreur.smtp_error!r}", erreur.smtp_code) from erreur
        except (smtplib.SMTPException, OSError) as erreur:
            raise EchecEnvoi(f"{type(erreur).__name__} : {erreur}", None) from erreur
        finally:
            if connexion is not None:
                connexion.close()
