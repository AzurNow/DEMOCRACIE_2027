"""L'extracteur de texte que le code utiliserait aujourd'hui pour un contenu (décision D52 (4),
option A de l'auteur du 2026-10-16).

L'extraction double ne lit que le texte produit par l'extracteur **épinglé par le code**
(`pipeline/extraction/choix-texte.ts:choisirFiche`). Il n'existe pas une constante unique : il y a
un extracteur par genre de contenu, et sa version se lit à l'exécution (pymupdf installé, ou version
de Python pour `html.parser` et `webvtt`), exactement comme dans les fiches d'extraction.

`extracteur_en_service` applique la règle de genre de l'extraction (`extraction.genre_de`) et rend
la description que l'extracteur de ce genre inscrirait dans une nouvelle fiche : la même fonction
`extracteur()` de chaque module sert aux deux, ils ne peuvent pas diverger. Conséquence voulue : un
patch de Python différent entre `pnpm textes` et `pnpm extraction:entrees` rend un épinglage qu'aucune
fiche ne porte, et la source est refusée (`AucunTexteEpingle`), jamais repliée sur l'ancienne fiche.
"""

from __future__ import annotations

from collections.abc import Callable

from pipeline.collecte.textes import page_html, pdf, transcription_vtt
from pipeline.collecte.textes.extraction import GENRE_HTML, GENRE_PDF, GENRE_TRANSCRIPTION, genre_de
from pipeline.collecte.textes.fiche import Extracteur

DESCRIPTIONS: dict[str, Callable[[], Extracteur]] = {
    GENRE_PDF: pdf.extracteur,
    GENRE_HTML: page_html.extracteur,
    GENRE_TRANSCRIPTION: transcription_vtt.extracteur,
}


def extracteur_en_service(type_contenu: str | None) -> Extracteur:
    """Lève `ExtractionRefusee` pour un type de contenu sans extracteur, comme l'extraction."""
    return DESCRIPTIONS[genre_de(type_contenu)]()
