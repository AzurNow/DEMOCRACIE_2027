"""Texte canonique d'un PDF avec pymupdf (`docs/CONTRATS.md` §1.2, décision D2).

Les drapeaux sont fixés ici et consignés dans la fiche : ligatures et espaces conservés, texte
coupé à la boîte média, ni suppression de césure ni réordonnancement. Aucune OCR.
"""

from __future__ import annotations

from importlib.metadata import version

import pymupdf

from pipeline.collecte.textes.fiche import Extraction
from pipeline.collecte.textes.pages import SEPARATEUR_PAGES, joindre_pages
from pipeline.collecte.textes.refus import ExtractionRefusee

OUTIL = "pymupdf"
MODE = "text"
DRAPEAUX = pymupdf.TEXT_PRESERVE_LIGATURES | pymupdf.TEXT_PRESERVE_WHITESPACE | pymupdf.TEXT_MEDIABOX_CLIP


def options() -> dict[str, object]:
    return {"mode": MODE, "drapeaux": DRAPEAUX, "separateur_pages": SEPARATEUR_PAGES}


def _ouvrir(octets: bytes) -> pymupdf.Document:
    try:
        document = pymupdf.open(stream=octets, filetype="pdf")
    except (pymupdf.FileDataError, RuntimeError, ValueError) as erreur:
        raise ExtractionRefusee(f"PDF illisible par pymupdf : {erreur}") from None
    # pymupdf ignore `filetype` quand il reconnaît un autre format dans les octets : une page HTML
    # servie en application/pdf serait rendue par son moteur HTML, sans erreur. On le refuse.
    if not document.is_pdf:
        document.close()
        raise ExtractionRefusee("PDF illisible par pymupdf : les octets ne sont pas un PDF")
    if document.needs_pass:
        raise ExtractionRefusee("PDF protégé par mot de passe")
    return document


def lire_pages(octets: bytes) -> list[str]:
    with _ouvrir(octets) as document:
        return [page.get_text(MODE, flags=DRAPEAUX) for page in document]


def extraire_pdf(octets: bytes) -> Extraction:
    en_pages = joindre_pages(lire_pages(octets))
    return Extraction(en_pages.texte, OUTIL, version("pymupdf"), options(), pages=en_pages.pages)
