"""Pages d'un texte de PDF (`docs/CONTRATS.md` §1.1 et §1.2), sans dépendre de pymupdf.

Les textes des pages, chacun canonisé, sont joints par `\\f`. Chaque page garde son intervalle
semi-ouvert `[debut, fin)` en points de code, séparateur exclu : c'est ce qui donne `source.page`
d'une citation. Canoniser page par page puis joindre donne le même texte que canoniser le tout,
parce que `\\f` ne se compose avec rien ; les intervalles, eux, ne se calculent qu'ainsi.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from pipeline.collecte.textes.canonique import TexteCanonique, canoniser
from pipeline.collecte.textes.refus import ExtractionRefusee

SEPARATEUR_PAGES = "\f"


@dataclass(frozen=True)
class Page:
    numero: int
    debut: int
    fin: int


@dataclass(frozen=True)
class TexteEnPages:
    texte: TexteCanonique
    pages: tuple[Page, ...]


def _page_canonique(numero: int, brut: str) -> str:
    page = canoniser(brut)
    if SEPARATEUR_PAGES in page:
        raise ExtractionRefusee(f"la page {numero} contient déjà le séparateur de pages U+000C")
    return page


def joindre_pages(textes_bruts: Sequence[str]) -> TexteEnPages:
    """Refuse un document sans page, ou dont toutes les pages sont blanches (sans couche texte)."""
    textes = [_page_canonique(numero, brut) for numero, brut in enumerate(textes_bruts, start=1)]
    if all(not page.strip() for page in textes):
        raise ExtractionRefusee(f"PDF sans couche texte ({len(textes)} page(s) blanche(s)), aucune OCR")
    pages: list[Page] = []
    debut = 0
    for numero, page in enumerate(textes, start=1):
        pages.append(Page(numero, debut, debut + len(page)))
        debut += len(page) + len(SEPARATEUR_PAGES)
    return TexteEnPages(TexteCanonique(SEPARATEUR_PAGES.join(textes)), tuple(pages))


class CitationSansPageUnique(Exception):
    """L'intervalle d'une citation déborde d'une page, ou sort du texte."""


def page_de(pages: Sequence[Page], debut: int, fin: int) -> int:
    """Numéro de la page dont l'intervalle contient `[debut, fin)`. Une citation à cheval sur deux
    pages, ou qui recouvre un séparateur, n'a pas de page unique : erreur, jamais la première."""
    for page in pages:
        if page.debut <= debut and fin <= page.fin and debut < fin:
            return page.numero
    raise CitationSansPageUnique(f"[{debut}, {fin}) n'est contenu dans aucune page unique")
