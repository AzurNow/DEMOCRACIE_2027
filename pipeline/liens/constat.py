"""Ce qu'une tentative de test d'un lien a constaté, avant toute lecture de la table.

Une tentative finit de deux façons : sur une réponse HTTP qui n'est pas une redirection suivie
(`reponse_http`, son code décide), ou sur une issue nommée sans réponse finale (délai, robots.txt,
redirections, URL refusée…). Le vocabulaire des issues est fermé et vit ici, une fois ; la table
(`config/test-liens.toml`) dit lesquelles sont des verdicts.
"""

from __future__ import annotations

from dataclasses import dataclass

REPONSE_HTTP = "reponse_http"

ISSUES_SANS_REPONSE = frozenset(
    {
        "delai_depasse",
        "connexion_refusee",
        "erreur_tls",
        "domaine_inexistant",
        "erreur_reseau",
        "robots_interdit",
        "robots_injoignable",
        "schema_non_http",
        "url_malformee",
        "url_non_ascii",
        "redirections_excessives",
        "boucle_redirection",
        "redirection_sans_location",
    }
)
"""Issues qu'une table peut classer. `reponse_http` n'en est pas une : c'est le code qui décide."""

ISSUES = ISSUES_SANS_REPONSE | {REPONSE_HTTP}

CLASSES_HTTP = ("1xx", "2xx", "3xx", "4xx", "5xx")


def classe_http(code: int) -> str:
    """`404` → `"4xx"`. Un code hors de 100–599 n'a pas de classe : erreur, jamais une classe voisine."""
    if not 100 <= code <= 599:
        raise ValueError(f"code HTTP hors de 100–599 : {code}")
    return f"{code // 100}xx"


@dataclass(frozen=True)
class Constat:
    issue: str
    code_http: int | None
    """Code de la dernière réponse HTTP reçue pour la chaîne de l'URL ; `None` : aucune réponse."""
    url_finale: str | None = None
    """URL qui a rendu la réponse finale ; présente seulement pour `reponse_http`."""
    corps: bytes | None = None
    """Octets reçus tels quels (règle 7) ; présents seulement pour `reponse_http`."""
    type_contenu: str | None = None
    """En-tête `Content-Type` tel que reçu ; `None` s'il est absent, jamais deviné."""
    motif: str | None = None
    """Détail lisible (message réseau, cible refusée), pour le journal ; jamais lu par la table."""

    def __post_init__(self) -> None:
        if self.issue not in ISSUES:
            raise ValueError(f"issue inconnue : {self.issue!r}")
