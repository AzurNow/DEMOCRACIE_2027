"""Collecte des sources (sous-lots C1 et C1-bis) : téléchargement poli, archivage, manifestes.

Flux : `config/sources.toml` (liste tenue par l'auteur) → téléchargement (robots.txt, une requête
par seconde et par hôte) → copie tels quels des octets reçus dans `archives/` → SHA-256 →
sauvegarde Wayback Machine → manifeste de contenu `staging/sources/<sha256>.json` et fiche de
source `staging/sources/par-source/<cle_source>/<sha256>.json`. Un archivage en échec est repris
par une collecte ultérieure dans `staging/archivages/<sha256>.json`, sans réécrire le manifeste ;
`lien_archive.archive_url_de` résout le lien effectif.

Les formats sont fixés dans `docs/CONTRATS.md` §5 ; les trois fichiers sont décrits par
`schema/collecte.schema.json`, `schema/fiche-source.schema.json` et
`schema/reprise-archivage.schema.json`.
"""
