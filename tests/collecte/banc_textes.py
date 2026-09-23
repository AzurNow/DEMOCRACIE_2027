"""Banc des tests de C2 : contenus collectés posés sur disque, extracteurs injectés.

`deposer` écrit une copie locale et son manifeste comme la collecte les aurait laissés, sans passer
par le réseau. `extracteur_pdf_factice` rend deux pages fixes : le PDF réel n'est exercé que par
`test_textes_pdf.py`. `extracteur_html_fige` appelle le vrai `extraire_html` mais fige la version de
Python, pour que les fichiers dorés ne dépendent pas de la machine.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
from pathlib import Path

from pipeline.collecte.textes.extraction import Dependances
from pipeline.collecte.textes.fiche import Extraction
from pipeline.collecte.textes.page_html import extraire_html
from pipeline.collecte.textes.pages import SEPARATEUR_PAGES, joindre_pages
from tests.collecte.doubles import HorlogeFactice

VERSION_PYMUPDF_FIGEE = "1.28.2"
VERSION_PYTHON_FIGEE = "3.12.11"
DRAPEAUX_ATTENDUS = 67  # TEXT_PRESERVE_LIGATURES (1) | TEXT_PRESERVE_WHITESPACE (2) | TEXT_MEDIABOX_CLIP (64)
PAGES_FACTICES = ["Programme \U0001f600\n\ufb01nancement des re-\ntraites\n", "Page deux\n"]


def extracteur_pdf_factice(octets: bytes) -> Extraction:
    en_pages = joindre_pages(PAGES_FACTICES)
    options = {"mode": "text", "drapeaux": DRAPEAUX_ATTENDUS, "separateur_pages": SEPARATEUR_PAGES}
    return Extraction(en_pages.texte, "pymupdf", VERSION_PYMUPDF_FIGEE, options, pages=en_pages.pages)


def extracteur_html_fige(octets: bytes, type_contenu: str | None) -> Extraction:
    return dataclasses.replace(extraire_html(octets, type_contenu), version=VERSION_PYTHON_FIGEE)


def dependances(racine: Path, horloge: HorlogeFactice) -> Dependances:
    return Dependances(racine, horloge, extracteur_pdf_factice, extracteur_html_fige)


def deposer(racine: Path, octets: bytes, type_contenu: str | None, extension: str = ".bin") -> str:
    """Copie locale et manifeste de contenu, comme après une collecte réussie. Rend le sha256."""
    sha = hashlib.sha256(octets).hexdigest()
    chemin_local = f"archives/{sha[:2]}/{sha}{extension}"
    (racine / chemin_local).parent.mkdir(parents=True, exist_ok=True)
    (racine / chemin_local).write_bytes(octets)
    manifeste = {
        "sha256": sha,
        "chemin_local": chemin_local,
        "taille_octets": len(octets),
        "type_contenu_recu": type_contenu,
        "date_premiere_collecte": "2026-09-22T14:30:05+02:00",
        "url_soumise": "https://example.org/document",
        "archive_url": "https://web.archive.org/web/20260922123005/https://example.org/document",
    }
    chemin = racine / "staging" / "sources" / f"{sha}.json"
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(json.dumps(manifeste, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return sha


def texte_ecrit(racine: Path, texte_sha: str) -> bytes:
    return (racine / "staging" / "textes" / f"{texte_sha}.txt").read_bytes()


def fiche_extraction(racine: Path, sha_source: str, texte_sha: str) -> dict[str, object]:
    chemin = racine / "staging" / "extractions" / sha_source / f"{texte_sha}.json"
    return json.loads(chemin.read_text(encoding="utf-8"))


def fichiers(racine: Path) -> dict[str, bytes]:
    return {
        chemin.relative_to(racine).as_posix(): chemin.read_bytes()
        for chemin in sorted(racine.rglob("*"))
        if chemin.is_file()
    }
