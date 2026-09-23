"""Extraction des textes canoniques de tous les contenus collectés (sous-lot C2).

Pour chaque manifeste `staging/sources/<sha256>.json` : le type se lit dans `type_contenu_recu`
(`docs/CONTRATS.md` §1.4), la copie locale est relue et son empreinte revérifiée, l'extracteur du
type rend un texte, puis le texte et sa fiche sont écrits s'ils manquent. Un refus n'arrête pas le
lot : il est nommé dans le rapport et rend le code de sortie non nul. Rien n'est jamais réécrit.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from pipeline.collecte.archivage import ecrire_atomiquement, empreinte, type_media
from pipeline.collecte.horloge import Horloge, instant_iso
from pipeline.collecte.manifeste import REPERTOIRE_MANIFESTES, serialiser
from pipeline.collecte.textes.fiche import Extraction, chemin_fiche_extraction, chemin_texte, construire_fiche_extraction
from pipeline.collecte.textes.refus import ExtractionRefusee

ExtracteurPdf = Callable[[bytes], Extraction]
ExtracteurHtml = Callable[[bytes, str | None], Extraction]

GENRE_PDF = "pdf"
GENRE_HTML = "html"
GENRES: dict[str, str] = {
    "application/pdf": GENRE_PDF,
    "text/html": GENRE_HTML,
    "application/xhtml+xml": GENRE_HTML,
}
PREFIXES_C3 = ("audio/", "video/")


@dataclass(frozen=True)
class Dependances:
    racine: Path
    horloge: Horloge
    extraire_pdf: ExtracteurPdf
    extraire_html: ExtracteurHtml


@dataclass(frozen=True)
class Extrait:
    sha256_source: str
    texte_sha256: str
    outil: str


@dataclass(frozen=True)
class DejaExtrait:
    """Le même texte et sa fiche existaient déjà : rien n'est écrit."""

    sha256_source: str
    texte_sha256: str


@dataclass(frozen=True)
class AttendC3:
    """Audio ou vidéo : le texte sera dérivé de la transcription (sous-lot C3). Pas un échec."""

    sha256_source: str
    type_contenu: str


@dataclass(frozen=True)
class Refuse:
    sha256_source: str
    motif: str


ResultatTexte = Extrait | DejaExtrait | AttendC3 | Refuse
REUSSIS = (Extrait, DejaExtrait, AttendC3)


@dataclass(frozen=True)
class Contenu:
    sha256: str
    chemin_local: str
    type_contenu: str | None


def lire_contenu(chemin: Path) -> Contenu:
    manifeste = json.loads(chemin.read_text(encoding="utf-8"))
    return Contenu(manifeste["sha256"], manifeste["chemin_local"], manifeste["type_contenu_recu"])


def contenus_collectes(racine: Path) -> list[Contenu]:
    """Manifestes de contenu seulement : les fiches de `par-source/` sont dans un sous-répertoire."""
    repertoire = racine / REPERTOIRE_MANIFESTES
    if not repertoire.exists():
        return []
    return [lire_contenu(chemin) for chemin in sorted(repertoire.glob("*.json"))]


def _octets_verifies(contenu: Contenu, racine: Path) -> bytes:
    chemin = racine / contenu.chemin_local
    if not chemin.exists():
        raise ExtractionRefusee(f"copie locale absente : {contenu.chemin_local}")
    octets = chemin.read_bytes()
    if empreinte(octets) != contenu.sha256:
        raise ExtractionRefusee(f"copie locale altérée : {contenu.chemin_local} n'a plus l'empreinte {contenu.sha256}")
    return octets


def _extraire(genre: str, contenu: Contenu, deps: Dependances) -> Extraction:
    octets = _octets_verifies(contenu, deps.racine)
    if genre == GENRE_PDF:
        return deps.extraire_pdf(octets)
    return deps.extraire_html(octets, contenu.type_contenu)


def _ecrire_texte(extraction: Extraction, racine: Path) -> None:
    """Un texte existant sous le même nom a les mêmes octets par construction ; s'il en diffère,
    le fichier a été altéré, et on le dit au lieu de le réécrire."""
    chemin = racine / chemin_texte(extraction.texte.sha256)
    if not chemin.exists():
        ecrire_atomiquement(chemin, extraction.texte.octets)
    elif chemin.read_bytes() != extraction.texte.octets:
        raise ExtractionRefusee(f"texte existant altéré : {chemin_texte(extraction.texte.sha256)}")


def _consigner(contenu: Contenu, extraction: Extraction, deps: Dependances) -> ResultatTexte:
    """Le texte d'abord, la fiche ensuite : une fiche n'existe jamais sans son texte."""
    _ecrire_texte(extraction, deps.racine)
    fiche = deps.racine / chemin_fiche_extraction(contenu.sha256, extraction.texte.sha256)
    if fiche.exists():
        return DejaExtrait(contenu.sha256, extraction.texte.sha256)
    date = instant_iso(deps.horloge.maintenant())
    ecrire_atomiquement(fiche, serialiser(construire_fiche_extraction(contenu.sha256, extraction, date)))
    return Extrait(contenu.sha256, extraction.texte.sha256, extraction.outil)


def _genre(contenu: Contenu) -> str | AttendC3:
    if contenu.type_contenu is None:
        raise ExtractionRefusee("aucun Content-Type reçu : type inconnu, jamais deviné")
    media = type_media(contenu.type_contenu)
    if media.startswith(PREFIXES_C3):
        return AttendC3(contenu.sha256, contenu.type_contenu)
    if media not in GENRES:
        raise ExtractionRefusee(f"type de contenu non pris en charge : {contenu.type_contenu}")
    return GENRES[media]


def extraire_contenu(contenu: Contenu, deps: Dependances) -> ResultatTexte:
    try:
        genre = _genre(contenu)
        if isinstance(genre, AttendC3):
            return genre
        return _consigner(contenu, _extraire(genre, contenu, deps), deps)
    except ExtractionRefusee as refus:
        return Refuse(contenu.sha256, refus.motif)


def extraire_tout(deps: Dependances) -> list[ResultatTexte]:
    return [extraire_contenu(contenu, deps) for contenu in contenus_collectes(deps.racine)]


def code_de_sortie(resultats: Sequence[ResultatTexte]) -> int:
    return 0 if all(isinstance(resultat, REUSSIS) for resultat in resultats) else 1


# ----------------------------------------------------------------- rapport

LARGEUR_ETIQUETTE = 16


def _ligne(etiquette: str, sha256_source: str, reste: str) -> str:
    return f"{etiquette.ljust(LARGEUR_ETIQUETTE)}{sha256_source}  {reste}"


LIGNES: dict[type, Callable[..., str]] = {
    Extrait: lambda r: _ligne("extrait", r.sha256_source, f"→ {r.texte_sha256} ({r.outil})"),
    DejaExtrait: lambda r: _ligne("déjà extrait", r.sha256_source, f"→ {r.texte_sha256}"),
    AttendC3: lambda r: _ligne("attend C3", r.sha256_source, r.type_contenu),
    Refuse: lambda r: _ligne("REFUSÉ", r.sha256_source, r.motif),
}

LIBELLES_BILAN: dict[type, str] = {
    Extrait: "extrait(s)",
    DejaExtrait: "déjà extrait(s)",
    AttendC3: "en attente de C3",
    Refuse: "refusé(s)",
}


def formater_rapport(resultats: Sequence[ResultatTexte]) -> str:
    lignes = [LIGNES[type(resultat)](resultat) for resultat in resultats]
    comptes = [
        f"{sum(isinstance(resultat, genre) for resultat in resultats)} {libelle}"
        for genre, libelle in LIBELLES_BILAN.items()
    ]
    return "\n".join([*lignes, f"bilan : {', '.join(comptes)}"])
