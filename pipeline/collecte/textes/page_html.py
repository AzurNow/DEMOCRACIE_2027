"""Texte canonique d'une page HTML (`docs/CONTRATS.md` §1.3), avec la seule bibliothèque standard.

Deux étapes, chacune refusant plutôt que supposant :

1. Décodage, dans l'ordre WHATWG : marque d'ordre des octets, sinon `charset` du `Content-Type`
   reçu, sinon `<meta>` dans les 1 024 premiers octets. Aucune des trois : refus.
2. Rendu en lignes : contenu de `script`, `style`, `noscript`, `template` ignoré ; chaque élément
   de bloc coupe la ligne ; les suites d'espaces ASCII d'une ligne deviennent une espace. Rien
   d'autre n'est touché : U+00A0, trait d'union conditionnel, coquilles restent en place.

Le module s'appelle `page_html` et non `html` pour ne pas masquer `html.parser`.
"""

from __future__ import annotations

import codecs
import platform
import re
from html.parser import HTMLParser

from pipeline.collecte.textes.canonique import TexteCanonique, canoniser
from pipeline.collecte.textes.fiche import Encodage, Extraction
from pipeline.collecte.textes.refus import ExtractionRefusee

OUTIL = "html.parser"
REGLE = "blocs-1"
"""Version de la règle de rendu. Toute modification de IGNORES, BLOCS ou du traitement des espaces
l'incrémente : le texte produit change, la fiche d'extraction doit le dire."""

IGNORES = frozenset({"script", "style", "noscript", "template"})
BLOCS = frozenset(
    {
        "address", "article", "aside", "blockquote", "body", "br", "caption", "dd", "details",
        "dialog", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1",
        "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "html", "legend", "li", "main",
        "nav", "ol", "option", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot",
        "th", "thead", "title", "tr", "ul",
    }
)

ESPACES_ASCII = re.compile(r"[ \t\n\r\f]+")
TAILLE_PRESCAN = 1024
BOMS = (
    (codecs.BOM_UTF8, "utf-8"),
    (codecs.BOM_UTF16_LE, "utf-16-le"),
    (codecs.BOM_UTF16_BE, "utf-16-be"),
)
# WHATWG : une page qui se déclare latin-1 ou ASCII est lue en windows-1252, comme dans tout
# navigateur. Sans cela, l'apostrophe typographique (0x92) deviendrait un caractère de contrôle.
LUS_EN_CP1252 = frozenset({"iso8859-1", "ascii"})  # noms rendus par codecs.lookup()
CHARSET_EN_TETE = re.compile(r"""charset\s*=\s*["']?([^;"'\s]+)""", re.IGNORECASE)
CHARSET_META = re.compile(r"""<meta[^>]*?charset\s*=\s*["']?\s*([A-Za-z0-9_.:-]+)""", re.IGNORECASE)


# ----------------------------------------------------------------- décodage


def _codec(etiquette: str, origine: str) -> str:
    try:
        nom = codecs.lookup(etiquette).name
    except LookupError:
        raise ExtractionRefusee(f"encodage inconnu {etiquette!r} déclaré par {origine}") from None
    return "cp1252" if nom in LUS_EN_CP1252 else nom


def _depuis_bom(octets: bytes) -> tuple[Encodage, bytes] | None:
    for marque, nom in BOMS:
        if octets.startswith(marque):
            return Encodage(nom, "bom"), octets[len(marque) :]
    return None


def _depuis_declaration(motif: re.Pattern[str], texte: str | None, origine: str) -> Encodage | None:
    trouve = motif.search(texte) if texte is not None else None
    return Encodage(_codec(trouve.group(1), origine), origine) if trouve else None


def choisir_encodage(octets: bytes, type_contenu: str | None) -> tuple[Encodage, bytes]:
    """Encodage retenu, et les octets à décoder (sans la marque d'ordre, s'il y en avait une)."""
    par_bom = _depuis_bom(octets)
    if par_bom is not None:
        return par_bom
    prescan = octets[:TAILLE_PRESCAN].decode("latin-1")
    encodage = _depuis_declaration(CHARSET_EN_TETE, type_contenu, "content-type") or _depuis_declaration(
        CHARSET_META, prescan, "meta"
    )
    if encodage is None:
        raise ExtractionRefusee("aucun encodage déclaré (ni BOM, ni charset dans Content-Type, ni <meta>)")
    return encodage, octets


def decoder(octets: bytes, type_contenu: str | None) -> tuple[str, Encodage]:
    encodage, corps = choisir_encodage(octets, type_contenu)
    try:
        return corps.decode(encodage.nom), encodage
    except UnicodeDecodeError as erreur:
        raise ExtractionRefusee(
            f"octet invalide pour {encodage.nom} ({encodage.origine}) à la position {erreur.start}"
        ) from None


# ----------------------------------------------------------------- rendu


class _Rendu(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._profondeur_ignoree = 0
        self._lignes: list[list[str]] = [[]]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in IGNORES:
            self._profondeur_ignoree += 1
        elif tag in BLOCS:
            self._lignes.append([])

    def handle_endtag(self, tag: str) -> None:
        if tag in IGNORES:
            self._profondeur_ignoree = max(0, self._profondeur_ignoree - 1)
        elif tag in BLOCS:
            self._lignes.append([])

    def handle_data(self, data: str) -> None:
        if self._profondeur_ignoree == 0:
            self._lignes[-1].append(data)

    def texte(self) -> str:
        lignes = (ESPACES_ASCII.sub(" ", "".join(morceaux)).strip(" ") for morceaux in self._lignes)
        return "\n".join(ligne for ligne in lignes if ligne)


def rendre(document: str) -> str:
    rendu = _Rendu()
    rendu.feed(document)
    rendu.close()
    return rendu.texte()


def extraire_html(octets: bytes, type_contenu: str | None) -> Extraction:
    document, encodage = decoder(octets, type_contenu)
    texte = TexteCanonique(canoniser(rendre(document)))
    if texte.longueur == 0:
        raise ExtractionRefusee("page HTML sans texte")
    return Extraction(texte, OUTIL, platform.python_version(), {"regle": REGLE}, encodage=encodage)
