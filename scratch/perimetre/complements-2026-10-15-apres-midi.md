# Compléments au dossier du 2026-10-15 (après-midi, avant la relecture du 17 prévue par D36 (1))

Ne modifie pas `dossier-2026-10-15-final.md`. Rien n'est archivé ni écrit hors de `scratch/`.

## D36 (3) : proclamation de la primaire PS–Place publique–GRS

- Source secondaire (LCP, i24news, Public Sénat, via recherche web du 15) : résultats annoncés le
  dimanche 11 octobre par Patrick Mennucci, président de la commission d'organisation. Le vote en
  ligne a été **prolongé d'une journée, jusqu'au dimanche soir, après une cyberattaque**. Cela
  explique l'écart de calendrier noté en 0.1-2 (FAQ : fin le samedi 10 ; désignation : dimanche 11).
- Chiffres : 79 613 voix, 66,13 % ou 66,17 % selon les sources. i24news donne aussi « 120 787
  exprimés », ce qui fait 65,91 % : incohérent avec les deux pourcentages. Note sans effet sur un
  verdict.
- Aucune proclamation du PS en source primaire trouvée : choisir2027.fr toujours hors service.
  Liens à lire et archiver :
  - https://lcp.fr/actualites/primaire-socialiste-vainqueur-des-le-1er-tour-raphael-glucksmann-sera-le-candidat-de-la
  - https://www.publicsenat.fr/actualites/politique/primaire-de-la-gauche-raphael-glucksmann-plie-le-match-et-remporte-le-scrutin-des-le-premier-tour-avec-66
  - https://www.i24news.tv/fr/actu/france/artc-presidentielle-2027-raphael-glucksmann-vainqueur-de-la-primaire-de-la-gauche-des-le-premier-tour

## D37 : mode sans web de Perplexity (documentation primaire lue le 15)

- docs.perplexity.ai n'offre plus que l'Orchestrator API, l'Agent API, la Search API et
  l'Embeddings API. Sonar n'apparaît plus comme API à part.
- Agent API (`/api-reference/agent-post`) : **aucun paramètre `disable_search` ni `search_mode`**.
  La recherche s'ajoute par l'outil `{"type": "web_search"}` dans `tools`. Les « presets » portent
  leurs propres paramètres de recherche (le preset `low` inclut `web_search` et `fetch_url`).
- Le seul modèle propre à Perplexity est `perplexity/sonar`. La documentation ne dit pas s'il
  cherche sur le web sans l'outil `web_search`.
- **Piège** : sans outil, l'Agent API sert aussi des modèles tiers (OpenAI, Anthropic, Google,
  xAI…). Un mode « sans web » obtenu avec un modèle tiers ne mesurerait pas Perplexity, mais
  l'éditeur du modèle. Le modèle demandé doit donc être `perplexity/sonar` dans les deux modes.
- Non établi par la documentation : seul un appel réel (sonar, `tools` vide, puis inspection de la
  réponse brute) le dirait. C'est un nouvel appel réseau avec une clé d'API : **décision de
  l'auteur**.

## Commandes à lancer par l'auteur (choix du 15 après-midi)

- Archivage des preuves (171 URL, dont 2 copies Wayback et 6 doublons ; blocs YAML prêts pour
  config/perimetre.yaml) :
  `pnpm preuve --fichier scratch/perimetre/urls-a-archiver-2026-10-15.txt > scratch/perimetre/preuves-2026-10-15.yaml 2> scratch/perimetre/preuves-2026-10-15.erreurs.txt`
  Pour les notices de sondage, relancer sur leur sous-liste avec `--sondage` ; pour les déclarations
  et les contacts, avec `--cle-date date`.
- Essai Perplexity : `PERPLEXITY_API_KEY=… python3 -I scratch/perimetre/essai_perplexity_sans_web.py`
