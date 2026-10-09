"""Archivage d'une preuve du périmètre : `pnpm preuve <url> [<url>…]`.

Commande que l'AUTEUR lance à la main (autorisée le 2026-10-09) pour une preuve de `config/perimetre.yaml`
(déclaration de candidature, sondage, classement de store, CGU, page de contact). Pour chaque URL :
GET poli (`pipeline/collecte/politesse.py` : robots.txt, une requête par seconde et par hôte,
redirections contrôlées), SHA-256 des octets reçus tels quels, copie locale sous
`scratch/perimetre/preuves/<sha256><extension>`, Save Page Now (`pipeline/collecte/wayback.py`), puis
un bloc YAML prêt à coller sur la sortie standard.

La commande n'écrit jamais dans `config/`, `data/` ni `runs/`, et ne devine jamais une date de
publication ni un institut : ces lignes sont imprimées vides, à lire sur la page. Un agent ne la
lance jamais contre le réseau réel.
"""
