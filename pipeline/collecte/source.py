"""Bloc `commun#/$defs/source` d'une source collectée : le seul endroit qui l'assemble.

Quatre fichiers y contribuent, chacun pour ce qu'il sait : la fiche de source (métadonnées de la
liste), le manifeste de contenu (copie locale), le lien d'archive effectif (`archive_url_de`, qui
voit une reprise), la fiche d'extraction (texte canonique et pages). Tout consommateur (extraction,
interface, site) passe par `source_de` : lire `archive_url` dans le manifeste manquerait une
reprise, et la source disparaîtrait sans erreur (docs/DETTE.md, C1, point 5).

Aucun champ n'est inventé. Sans lien d'archive, pas de source (CLAUDE.md règle 2) : erreur nommée.
"""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.collecte.archivage import type_media
from pipeline.collecte.lien_archive import archive_url_de
from pipeline.collecte.manifeste import REPERTOIRE_FICHES, chemin_manifeste
from pipeline.collecte.sources import MENTION_SITE_PARTI
from pipeline.collecte.textes import page_html, pdf, transcription_vtt
from pipeline.collecte.textes.fiche import chemin_fiche_extraction
from pipeline.collecte.textes.pages import Page, page_de

FORMAT_PAR_OUTIL = {pdf.OUTIL: "pdf", page_html.OUTIL: "html"}
"""Protocole 0.13 (§4, n° 54) : le format d'une source est relevé par la collecte, jamais deviné de
l'URL. L'outil qui a produit le texte canonique le dit pour un PDF et une page web."""

FORMAT_PAR_GENRE_MEDIA = {"audio": "audio", "video": "video"}
"""Pour un texte dérivé d'une transcription (outil webvtt), le type de contenu que la collecte a
reçu (`type_contenu_recu` du manifeste, `audio/*` ou `video/*`) dit si c'est un audio ou une vidéo."""


class PieceManquante(Exception):
    """Un des fichiers qui composent la source n'existe pas."""


class SourceSansArchive(Exception):
    """Ni le manifeste ni une reprise ne portent de lien d'archive : la source ne peut pas s'afficher."""


class FormatIndecidable(Exception):
    """Ni l'outil d'extraction ni le type de contenu reçu ne disent le format : il n'est pas deviné."""


def format_de(extraction: dict[str, object], manifeste: dict[str, object]) -> str:
    """Format (`pdf`, `html`, `audio`, `video`) relevé dans la fiche d'extraction et le manifeste."""
    outil = extraction["extracteur"]["outil"]  # type: ignore[index]
    if outil in FORMAT_PAR_OUTIL:
        return FORMAT_PAR_OUTIL[outil]
    if outil != transcription_vtt.OUTIL:
        raise FormatIndecidable(f"outil d'extraction inconnu : {outil!r}")
    type_contenu = str(manifeste["type_contenu_recu"])
    genre = type_media(type_contenu).split("/", 1)[0]
    if genre not in FORMAT_PAR_GENRE_MEDIA:
        raise FormatIndecidable(f"texte dérivé d'une transcription pour un contenu {type_contenu} ni audio ni vidéo")
    return FORMAT_PAR_GENRE_MEDIA[genre]


def _lire(chemin: Path, quoi: str) -> dict[str, object]:
    if not chemin.exists():
        raise PieceManquante(f"{quoi} absente : {chemin}")
    contenu = json.loads(chemin.read_text(encoding="utf-8"))
    if not isinstance(contenu, dict):
        raise PieceManquante(f"{quoi} illisible : {chemin} n'est pas un objet JSON")
    return contenu


def _pages(extraction: dict[str, object]) -> list[Page] | None:
    """Pages d'un texte de PDF ; `None` pour un texte qui n'en a pas (HTML)."""
    pages = extraction.get("pages")
    if pages is None:
        return None
    return [Page(p["numero"], p["debut"], p["fin"]) for p in pages]  # type: ignore[attr-defined,index]


def _metadonnees(fiche: dict[str, object]) -> dict[str, object]:
    champs = {cle: fiche[cle] for cle in ("tier", "url", "type_document")}
    if MENTION_SITE_PARTI in fiche:
        champs[MENTION_SITE_PARTI] = fiche[MENTION_SITE_PARTI]
    return champs


def source_de(
    racine: Path,
    cle_source: str,
    sha256: str,
    texte_sha256: str,
    citation: tuple[int, int] | None = None,
) -> dict[str, object]:
    """Source de l'entrée `cle_source` pour le contenu `sha256` et le texte `texte_sha256`.

    `citation`, intervalle `[debut, fin)` en points de code, donne `page` quand le texte est celui
    d'un PDF (et rien pour une page HTML) ; une citation à cheval sur deux pages lève
    `CitationSansPageUnique`."""
    fiche = _lire(racine / REPERTOIRE_FICHES / cle_source / f"{sha256}.json", "fiche de source")
    manifeste = _lire(racine / chemin_manifeste(sha256), "manifeste de contenu")
    extraction = _lire(racine / chemin_fiche_extraction(sha256, texte_sha256), "fiche d'extraction")
    archive_url = archive_url_de(racine, sha256)
    if archive_url is None:
        raise SourceSansArchive(f"{sha256} : archivage Wayback en échec et jamais repris")
    source = _metadonnees(fiche)
    source["format"] = format_de(extraction, manifeste)
    pages = _pages(extraction)
    if citation is not None and pages is not None:
        source["page"] = page_de(pages, *citation)
    return {
        **source,
        "sha256": sha256,
        "texte_sha256": texte_sha256,
        "archive_url": archive_url,
        "date_source": fiche["date_source"],
        "date_collecte": fiche["date_collecte"],
        "chemin_local": manifeste["chemin_local"],
        "publication": fiche["publication"],
    }
