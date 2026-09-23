"""Texte canonique et fiche d'extraction (`docs/CONTRATS.md` §1 et §1.1), tous deux immuables.

- `staging/textes/<texte_sha256>.txt` : le texte, rangé sous sa propre empreinte ;
- `staging/extractions/<sha256_source>/<texte_sha256>.json` (`schema/extraction-texte.schema.json`) :
  le lien vers le document archivé, l'extracteur, sa version, ses options, et selon le cas les pages
  (PDF) ou l'encodage (HTML).

L'ordre des clés est fixé ici par construction ; la sérialisation est celle de `manifeste.serialiser`.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath

from pipeline.collecte.textes.canonique import TexteCanonique
from pipeline.collecte.textes.pages import Page

REPERTOIRE_TEXTES = PurePosixPath("staging", "textes")
REPERTOIRE_EXTRACTIONS = PurePosixPath("staging", "extractions")


@dataclass(frozen=True)
class Encodage:
    nom: str
    origine: str
    """`bom`, `content-type` ou `meta`."""


@dataclass(frozen=True)
class Extraction:
    """Ce qu'un extracteur rend : un texte canonique et de quoi le rejouer. Exactement un de
    `pages` (PDF) et `encodage` (HTML) est renseigné."""

    texte: TexteCanonique
    outil: str
    version: str
    options: dict[str, object]
    pages: tuple[Page, ...] | None = None
    encodage: Encodage | None = None


def chemin_texte(texte_sha256: str) -> PurePosixPath:
    return REPERTOIRE_TEXTES / f"{texte_sha256}.txt"


def chemin_fiche_extraction(sha256_source: str, texte_sha256: str) -> PurePosixPath:
    return REPERTOIRE_EXTRACTIONS / sha256_source / f"{texte_sha256}.json"


def _bloc_specifique(extraction: Extraction) -> dict[str, object]:
    if extraction.pages is not None:
        return {"pages": [{"numero": p.numero, "debut": p.debut, "fin": p.fin} for p in extraction.pages]}
    if extraction.encodage is not None:
        return {"encodage": {"nom": extraction.encodage.nom, "origine": extraction.encodage.origine}}
    raise ValueError(f"extraction {extraction.outil} sans pages ni encodage")


def construire_fiche_extraction(sha256_source: str, extraction: Extraction, date_extraction: str) -> dict[str, object]:
    return {
        "sha256_source": sha256_source,
        "texte_sha256": extraction.texte.sha256,
        "longueur": extraction.texte.longueur,
        "date_extraction": date_extraction,
        "extracteur": {"outil": extraction.outil, "version": extraction.version, "options": extraction.options},
        **_bloc_specifique(extraction),
    }
