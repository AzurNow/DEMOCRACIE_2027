"""Empreinte, chemin d'archive et écriture atomique.

Les octets reçus sont écrits tels quels (CLAUDE.md règle 7, `docs/CONTRATS.md` §3) : aucune
normalisation de BOM, de fins de ligne ni d'encodage. Le SHA-256 porte sur ces octets-là.
"""

from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path, PurePosixPath

REPERTOIRE_ARCHIVES = "archives"
EXTENSION_INCONNUE = ".bin"

# Table fermée. Un type absent de la table donne `.bin` ; le type reçu reste consigné tel quel
# dans le manifeste, donc rien n'est perdu. Ajouter un type = ajouter une ligne ici.
EXTENSIONS: dict[str, str] = {
    "application/pdf": ".pdf",
    "text/html": ".html",
    "application/xhtml+xml": ".xhtml",
    "text/plain": ".txt",
    "application/json": ".json",
    "application/xml": ".xml",
    "text/xml": ".xml",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".weba",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
}


def empreinte(octets: bytes) -> str:
    return hashlib.sha256(octets).hexdigest()


def type_media(type_contenu: str) -> str:
    """`text/HTML; charset=utf-8` → `text/html`. Sert à la recherche dans la table, rien d'autre."""
    return type_contenu.split(";", 1)[0].strip().lower()


def extension_pour(type_contenu: str | None) -> str:
    if type_contenu is None:
        return EXTENSION_INCONNUE
    media = type_media(type_contenu)
    return EXTENSIONS[media] if media in EXTENSIONS else EXTENSION_INCONNUE


def chemin_archive(sha256: str, extension: str) -> PurePosixPath:
    """`archives/<sha256[0:2]>/<sha256><extension>`, relatif à la racine du dépôt."""
    return PurePosixPath(REPERTOIRE_ARCHIVES, sha256[:2], f"{sha256}{extension}")


def ecrire_atomiquement(cible: Path, octets: bytes) -> None:
    """Fichier temporaire dans le même répertoire, puis renommage : jamais de fichier partiel
    sous le nom définitif. Refuse d'écraser un fichier existant (archives et manifestes sont
    immuables une fois écrits)."""
    if cible.exists():
        raise FileExistsError(f"refus d'écraser {cible}")
    cible.parent.mkdir(parents=True, exist_ok=True)
    descripteur, temporaire = tempfile.mkstemp(dir=cible.parent, prefix=f".{cible.name}.", suffix=".partiel")
    try:
        with os.fdopen(descripteur, "wb") as flux:
            flux.write(octets)
            flux.flush()
            os.fsync(flux.fileno())
        os.replace(temporaire, cible)
    except BaseException:
        os.unlink(temporaire)
        raise
