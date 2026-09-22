"""Collecte des sources (sous-lot C1) : téléchargement poli, archivage, manifeste.

Flux : `config/sources.toml` (liste tenue par l'auteur) → téléchargement (robots.txt, une requête
par seconde et par hôte) → copie tels quels des octets reçus dans `archives/` → SHA-256 →
sauvegarde Wayback Machine → manifeste `staging/sources/<sha256>.json`.

Les formats sont fixés dans `docs/CONTRATS.md` §5 ; le manifeste est décrit par
`schema/collecte.schema.json`.
"""
