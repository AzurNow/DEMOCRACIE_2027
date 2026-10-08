"""Le transport classe ses erreurs : délai, connexion refusée, TLS, nom introuvable (D20).

La collecte ne lit que `ErreurReseau` et son message : les sous-classes ne changent rien pour elle
(`tests/collecte/test_reseau.py` reste inchangé). Le test des liens en a besoin, parce que la table
de D20 distingue « domaine inexistant » (mort) de « délai dépassé » (inaccessible).

Aucune requête DNS réelle : le classement est vérifié sur des exceptions construites, et seule la
connexion refusée passe par le vrai transport, vers 127.0.0.1.
"""

from __future__ import annotations

import socket
import ssl
import urllib.error

import pytest

from pipeline.collecte.reseau import (
    ConnexionRefusee,
    DelaiDepasse,
    ErreurReseau,
    ErreurTls,
    NomIntrouvable,
    TransportUrllib,
    classe_d_erreur_reseau,
)
from tests.collecte.doubles import RouteLocale, ServeurLocal


def test_connexion_refusee_est_classee() -> None:
    with pytest.raises(ConnexionRefusee):
        TransportUrllib(delai_s=1).envoyer("http://127.0.0.1:1/rien", {})


def test_delai_depasse_est_classe_et_garde_son_message(serveur_local: ServeurLocal) -> None:
    serveur_local.routes["/lent"] = RouteLocale(200, b"x", attente_s=1.0)

    with pytest.raises(DelaiDepasse, match="délai dépassé"):
        TransportUrllib(delai_s=0.2).envoyer(f"{serveur_local.base}/lent", {})


@pytest.mark.parametrize("code", [socket.EAI_NONAME, socket.EAI_NODATA])
def test_nom_introuvable_est_un_domaine_inexistant(code: int) -> None:
    erreur = urllib.error.URLError(socket.gaierror(code, "nodename nor servname provided"))
    assert classe_d_erreur_reseau(erreur) is NomIntrouvable


def test_echec_dns_temporaire_n_est_pas_un_domaine_inexistant() -> None:
    """EAI_AGAIN dit une panne du résolveur, pas un nom qui n'existe pas : jamais « mort »."""
    erreur = urllib.error.URLError(socket.gaierror(socket.EAI_AGAIN, "temporary failure"))
    assert classe_d_erreur_reseau(erreur) is ErreurReseau


def test_erreur_de_certificat_est_une_erreur_tls() -> None:
    erreur = urllib.error.URLError(ssl.SSLCertVerificationError(1, "certificate verify failed"))
    assert classe_d_erreur_reseau(erreur) is ErreurTls


def test_connexion_reinitialisee_reste_une_erreur_reseau_generale() -> None:
    erreur = urllib.error.URLError(ConnectionResetError(54, "reset"))
    assert classe_d_erreur_reseau(erreur) is ErreurReseau


def test_delai_enveloppe_dans_url_error_est_un_delai() -> None:
    erreur = urllib.error.URLError(TimeoutError("timed out"))
    assert classe_d_erreur_reseau(erreur) is DelaiDepasse


def test_les_sous_classes_restent_des_erreurs_reseau_pour_la_collecte() -> None:
    for classe in (ConnexionRefusee, DelaiDepasse, ErreurTls, NomIntrouvable):
        assert issubclass(classe, ErreurReseau)
