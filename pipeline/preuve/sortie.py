"""Le bloc YAML d'une preuve, prêt à coller dans `config/perimetre.yaml`.

Les chaînes sont écrites en JSON : un littéral JSON est un scalaire YAML entre guillemets valide, quel
que soit son contenu. Ce qui n'est pas connu (date de publication, institut) est imprimé vide avec
`# à lire sur la page` : jamais deviné.
"""

from __future__ import annotations

import json

from pipeline.preuve.entree import Demande
from pipeline.preuve.traitement import Preuve

A_LIRE = "# à lire sur la page"


def _chaine(valeur: str) -> str:
    return json.dumps(valeur, ensure_ascii=False)


def _commentaires(demande: Demande, preuve: Preuve) -> list[str]:
    lignes = [f"# {texte}".rstrip() for texte in demande.commentaire]
    lignes.append(f"# capture : {preuve.capture}")
    if preuve.url_finale != preuve.url:
        lignes.append(f"# url finale après redirections : {preuve.url_finale}")
    type_contenu = preuve.type_contenu if preuve.type_contenu is not None else "absent"
    lignes.append(f"# HTTP {preuve.statut}, type de contenu : {type_contenu}")
    lignes.append(f"# copie locale : {preuve.copie}")
    return lignes


def _archive(preuve: Preuve) -> list[str]:
    if preuve.archive_url is not None:
        return [f"archive_url: {_chaine(preuve.archive_url)}"]
    return [
        f"# ARCHIVAGE WAYBACK EN ÉCHEC : {preuve.motif_archivage} — à refaire, ne pas coller tel quel",
        "archive_url:",
    ]


def formater_bloc(demande: Demande, preuve: Preuve, cle_date: str, sondage: bool) -> str:
    lignes = _commentaires(demande, preuve)
    if sondage:
        lignes.append(f"institut:  {A_LIRE}")
    lignes.append(f"url: {_chaine(preuve.url)}")
    lignes.append(f"{cle_date}:  {A_LIRE}")
    lignes.append(f"sha256: {_chaine(preuve.sha256)}")
    lignes.extend(_archive(preuve))
    return "\n".join(lignes)
