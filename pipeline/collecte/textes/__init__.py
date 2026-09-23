"""Texte canonique des contenus collectés (sous-lot C2), `docs/CONTRATS.md` §1.

Flux : manifeste `staging/sources/<sha256>.json` → copie locale relue et revérifiée → extracteur
selon `type_contenu_recu` (pymupdf pour un PDF, `html.parser` pour une page HTML ; audio et vidéo
attendent C3) → `staging/textes/<texte_sha256>.txt` puis sa fiche
`staging/extractions/<sha256_source>/<texte_sha256>.json` (`schema/extraction-texte.schema.json`).

Le texte n'est jamais corrigé : fins de ligne en LF et NFC, rien d'autre.
"""
