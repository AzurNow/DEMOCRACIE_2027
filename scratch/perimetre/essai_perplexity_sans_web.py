"""Essai jetable (D37) : perplexity/sonar cherche-t-il sur le web sans l'outil web_search ?

Lancé à la main par l'auteur, avec sa clé :

    PERPLEXITY_API_KEY=… python3 -I scratch/perimetre/essai_perplexity_sans_web.py

Deux appels à POST https://api.perplexity.ai/v1/agent (documentation lue le 2026-10-15), modèle
perplexity/sonar, sans aucun outil : l'un avec "tools": [], l'autre sans la clé "tools". La question
porte sur l'actualité du jour, à laquelle un modèle sans recherche ne peut pas répondre. Chaque corps
de réponse est écrit tel quel, octet pour octet, dans scratch/perimetre/essai-perplexity/, puis un
résumé est imprimé : types des éléments de `output`, URL des résultats de recherche et des
citations, et `usage.tool_calls_details`. Bibliothèque standard seule ; rien n'est importé ailleurs.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

POINT_D_ACCES = "https://api.perplexity.ai/v1/agent"
MODELE = "perplexity/sonar"
QUESTION = (
    "Quelle est la date d'aujourd'hui, et quels sont les trois principaux titres de l'actualité "
    "française de ce jour ? Indique tes sources."
)
DOSSIER = Path(__file__).resolve().parent / "essai-perplexity"
VARIANTES = {
    "tools-vide": {"model": MODELE, "input": QUESTION, "tools": []},
    "sans-cle-tools": {"model": MODELE, "input": QUESTION},
}


def appeler(cle: str, corps: dict[str, object]) -> tuple[int, bytes]:
    requete = urllib.request.Request(
        POINT_D_ACCES,
        data=json.dumps(corps).encode("utf-8"),
        headers={"Authorization": f"Bearer {cle}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(requete, timeout=120) as reponse:
            return reponse.status, reponse.read()
    except urllib.error.HTTPError as erreur:
        return erreur.code, erreur.read()


def urls_des_citations(element: dict[str, object]) -> list[str]:
    urls: list[str] = []
    for partie in element.get("content") or []:
        for annotation in partie.get("annotations") or []:
            urls.append(str(annotation.get("url")))
    return urls


def resumer(brut: bytes) -> None:
    try:
        reponse = json.loads(brut)
    except json.JSONDecodeError:
        print("  corps non JSON, voir le fichier brut")
        return
    for element in reponse.get("output") or []:
        genre = element.get("type")
        if genre == "search_results":
            print(f"  output: search_results, requêtes {element.get('queries')}")
            for resultat in element.get("results") or []:
                print(f"    {resultat.get('url')}")
        elif genre == "message":
            citations = urls_des_citations(element)
            print(f"  output: message, {len(citations)} citation(s)")
            for url in citations:
                print(f"    {url}")
        else:
            print(f"  output: {genre}")
    usage = reponse.get("usage") or {}
    print(f"  modèle servi : {reponse.get('model')}")
    print(f"  usage.tool_calls_details : {usage.get('tool_calls_details')}")


def principal() -> int:
    cle = os.environ.get("PERPLEXITY_API_KEY")
    if not cle:
        print("PERPLEXITY_API_KEY absente : aucun appel envoyé", file=sys.stderr)
        return 2
    DOSSIER.mkdir(exist_ok=True)
    horodatage = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for nom, corps in VARIANTES.items():
        statut, brut = appeler(cle, corps)
        chemin = DOSSIER / f"{horodatage}-{nom}.json"
        chemin.write_bytes(brut)
        print(f"{nom} : HTTP {statut}, réponse brute dans {chemin}")
        resumer(brut)
    return 0


if __name__ == "__main__":
    sys.exit(principal())
