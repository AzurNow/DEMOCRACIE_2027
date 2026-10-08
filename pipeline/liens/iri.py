"""Conversion IRI → URI pour l'envoi d'une requête, et pour l'envoi seulement (D21, point 2).

RFC 3987 §3.1 : chaque caractère non ASCII du chemin, de la requête et du fragment est encodé en
UTF-8 puis en `%XX` ; un hôte non ASCII passe par le codec `idna` de la bibliothèque standard
(`xn--…`). Tout caractère ASCII reste tel qu'écrit, `%XX` déjà présents et délimiteurs compris :
une URL ASCII sort identique, octet pour octet. Rien d'autre n'est normalisé (ni casse, ni port, ni
barre finale).

L'URL citée (`url_citee`), la clé de dédoublonnage et le nom du fichier de résultat restent la
chaîne exacte : deux IRI distinctes qui s'encodent de la même façon donnent deux résultats.

La règle est déclarée dans la table (`conversion_iri`) ; `CONVERSIONS_IRI` est le registre des
règles que le code connaît, le chargeur de la table refuse toute autre valeur.
"""

from __future__ import annotations

import string
from collections.abc import Callable
from urllib.parse import quote, urlsplit

SURS_ASCII = string.punctuation
"""Le jeu `safe` de `quote` : toute la ponctuation ASCII. Avec les lettres et chiffres, toujours
sûrs, aucun caractère ASCII imprimable n'est réencodé : `%XX` existants, délimiteurs (`:/?#[]@`,
`!$&'()*+,;=`) et caractères ASCII hors norme restent tels qu'écrits. Seuls les caractères non
ASCII sont encodés (les espaces et caractères de contrôle sont refusés avant, `url_malformee`)."""


class IriInconvertible(Exception):
    """L'IRI ne se convertit pas en URI : hôte refusé par IDNA, chaîne non encodable, forme illisible."""


def _encoder(partie: str) -> str:
    try:
        return quote(partie, safe=SURS_ASCII, encoding="utf-8", errors="strict")
    except UnicodeEncodeError as erreur:
        raise IriInconvertible(f"{partie!r} : {erreur}") from erreur


def _hote(hote: str) -> str:
    if hote.isascii():
        return hote
    if hote.startswith("["):
        raise IriInconvertible(f"littéral IP non ASCII : {hote!r}")
    try:
        return hote.encode("idna").decode("ascii")
    except UnicodeError as erreur:
        raise IriInconvertible(f"hôte {hote!r} refusé par IDNA : {erreur}") from erreur


def _autorite(netloc: str) -> str:
    """`identifiants@hôte:port` : identifiants encodés comme le chemin, hôte en IDNA, port intact."""
    identifiants, arobase, hote_port = netloc.rpartition("@")
    hote, deux_points, port = hote_port.partition(":") if not hote_port.startswith("[") else (hote_port, "", "")
    return f"{_encoder(identifiants)}{arobase}{_hote(hote)}{deux_points}{port}"


def iri_vers_uri(iri: str) -> str:
    """L'URI à envoyer pour `iri` ; lève `IriInconvertible`. Une URL ASCII est rendue telle quelle."""
    if iri.isascii():
        return iri
    try:
        netloc = urlsplit(iri).netloc
    except ValueError as erreur:
        raise IriInconvertible(f"{iri!r} illisible : {erreur}") from erreur
    debut = iri.find("//") + 2
    if debut < 2 or iri[debut : debut + len(netloc)] != netloc:
        raise IriInconvertible(f"autorité introuvable telle qu'écrite dans {iri!r}")
    return f"{iri[:debut]}{_autorite(netloc)}{_encoder(iri[debut + len(netloc) :])}"


CONVERSIONS_IRI: dict[str, Callable[[str], str]] = {"rfc3987-3.1": iri_vers_uri}
"""Règles de conversion qu'une table peut déclarer (`conversion_iri`)."""
