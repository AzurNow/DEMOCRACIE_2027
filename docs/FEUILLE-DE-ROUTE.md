# Feuille de route — Banc d'essai 2027

> Fichier généré par `pnpm feuille-de-route` depuis `docs/feuille-de-route.json`. Ne pas éditer à la main. Mis à jour le 2026-09-20.

## Décisions en attente

### D1 — Brancher une intégration continue GitHub Actions qui exécute `pnpm check` et `pnpm test` sur chaque PR ?

Aujourd'hui « testé » est une déclaration : rien ne rejoue les tests hors de la machine de l'auteur. GitHub Actions est un service tiers, donc une décision de l'auteur (CLAUDE.md, arrêt obligatoire).

Options :

1. Oui, GitHub Actions, un fichier de quatre lignes, aucune dépendance npm.
2. Non, on s'en remet à la discipline de session ; le risque est un test rouge fusionné sans que personne ne le voie.

**Recommandation :** Oui. Coût unique négligeable, et c'est la seule preuve publique que les tests bloquants du §5 sont réellement bloquants.

Lots portant cette décision : ci

### D2 — Quelles dépendances autoriser pour la collecte et l'archivage (lot collecte) ?

La collecte doit produire les artefacts de docs/CONTRATS.md : texte canonique NFC, transcription WebVTT, copie locale avec SHA-256, sauvegarde Wayback. Aucune bibliothèque de la stdlib Python ou Node ne télécharge une vidéo, ne transcrit de l'audio ni n'extrait proprement le texte d'un PDF.

Options :

1. yt-dlp + faster-whisper en local + pymupdf + appel HTTP direct à l'API Wayback : tout tourne sur la machine, aucune clé, transcription reproductible.
2. yt-dlp + API de transcription hébergée + pymupdf : plus rapide, mais un service tiers de plus et une transcription non reproductible hors ligne.
3. Pas de vidéo en v1.0 : sources T1 seulement, ce qui supprime yt-dlp et la transcription mais exclut les sources T2 que le §4 prévoit.

**Recommandation :** Option 1. Tout local, tout reproductible, quatre dépendances justifiables une par une dans le brief.

Lots portant cette décision : collecte

### D3 — Quels SDK d'API autoriser pour l'extraction, l'interrogation et la notation ?

Trois lots appellent des modèles : l'extraction double (deux familles), l'interrogation des outils du périmètre, les deux juges. Chaque SDK est une dépendance et un appel réseau nouveau (CLAUDE.md, arrêt obligatoire).

Options :

1. SDK officiels, un par éditeur, versions épinglées : typage fourni, retries maison, surface d'audit = nombre d'éditeurs.
2. Appels HTTP directs sans SDK : zéro dépendance, mais chaque format de réponse brute réécrit à la main, source d'erreurs sur la règle 7.

**Recommandation :** Option 1, avec la liste nominative fixée par le lot périmètre. La réponse brute stockée est le corps HTTP tel que reçu, pas l'objet du SDK.

Lots portant cette décision : extraction, interrogation, notation

### D4 — Comment offrir le formulaire public de contestation (§4, droit de réponse) sur un site statique sans traceur ?

Le §4 exige « un formulaire public et une adresse dédiée ». La règle 1 interdit tout runtime, le §10 interdit tout traceur. Un formulaire suppose un service qui reçoit les envois.

Options :

1. Adresse mail dédiée seule pour la v1.0 : le §4 dit « formulaire public ET adresse », donc une révision de texte avant gel, pas un amendement.
2. Service de formulaire tiers déclaré dans le protocole, avec son traitement de données personnelles à documenter (§10, RGPD).
3. Formulaire via GitHub Issues public : gratuit, tracé, mais exige un compte GitHub au contestataire.

**Recommandation :** Option 1 pour la v1.0, texte du §4 ajusté avant gel. Un service de formulaire peut s'ajouter par amendement quand le volume le justifie.

Lots portant cette décision : protocole, site

### D5 — Quelle est la liste nominative des outils et des candidats du premier run, et où vit-elle ?

Le §3 fixe des règles d'inclusion mais la liste nominative doit être publiée au gel (J1). Elle alimente config/perimetre.yaml, que seul l'auteur écrit. Elle bloque l'extraction, l'interrogation et la notation, qui ont besoin de savoir quels éditeurs appeler.

Options :

1. L'auteur applique les règles du §3 à la date du jour, archive les preuves d'inclusion (deux sondages, classements de stores) et écrit config/perimetre.yaml.
2. Attendre plus près du gel pour une liste plus fraîche, au prix de bloquer trois lots pendant ce temps.

**Recommandation :** Option 1 maintenant, avec révision au gel : les lots dépendants peuvent être développés sur un périmètre provisoire tant que le format est fixé.

Lots portant cette décision : perimetre-prompts, protocole

### D6 — Six précisions du §8 remontées par le lot analyse, à écrire dans le protocole avant gel.

Le code d'analysis/ n'a rien tranché : chaque point est un paramètre explicite ou une lecture littérale du §8 signalée. Avant gel, chaque réponse est une révision de texte, pas un amendement. (1) Réponses tronquées dans les métriques primaires. (2) Dénominateur de la confirmation de prémisse : « items F et O » laisse muet un drapeau posé sur un item P. (3) Holm est exigé sur les effets de condition mais aucune valeur p n'y est définie. (4) Famille des formulations : trois paires ou deux contre le neutre. (5) « Exactitude moyenne de l'outil » dans la permutation : globale ou moyenne des candidats. (6) Exactitude des comparateurs : les lectures indéterminées restent au dénominateur, contrairement aux assistants.

Options :

1. (1) Inclure les tronquées et ajouter un quatrième recalcul de robustesse « hors tronquées ». (2) Garder le texte et interdire premisse_fausse sur un item P à l'engendrement. (3) Retirer Holm de cette famille, publier intervalles et qualificatif seulement. (4) Trois paires. (5) Globale. (6) Aligner sur les assistants.
2. Toute autre combinaison, point par point ; chaque choix est une ligne de code et une phrase de protocole.

**Recommandation :** Option 1 sur les six points. C'est la combinaison qui ajoute le moins de texte au §8 et ne fait disparaître aucun drapeau.

Lots portant cette décision : analyse

### D7 — Sept conventions du tirage que le protocole n'écrit pas, retenues au plus restrictif par le lot questions.

(1) Item arbitré : le brief l'excluait, l'annexe E point 6 le réintègre si maintenu ou corrigé, et un exemple valide du schéma le contient. (2) Q-ORI sur un item O avant son changement : la prémisse est vraie, l'annexe B dit « non avec correction » sans distinguer. (3) Position conditionnelle face à Q-FER ou Q-NEG : le protocole ne dit rien, le code lève une erreur. (4) Quota de questions par strate candidat × thème × gabarit : aucun nombre dans le §5, paramètre obligatoire sans défaut. (5) Q-ATT et reprise 80 % : le §5 calcule le ratio par candidat, les Q-ATT n'en ont pas. (6) Date civile comparée à date_gel : minuit UTC retenu, minuit Paris serait l'alternative. (7) Gabarits dans pipeline/questions/gabarits.ts alors que la règle 6 et le schéma les attendent dans prompts/.

Options :

1. (1) Tirable si la dernière décision du panel vaut maintien ou correction. (2) Non avec correction si l'état postérieur est en vigueur, oui sinon, phrase ajoutée à l'annexe B. (3) Ni Q-FER ni Q-NEG pour une position conditionnelle, porté par la table des gabarits. (4) Quota fixé dans config/perimetre.yaml. (5) Même budget de reprise pour les Q-ATT, stratifiées par thème. (6) Minuit UTC, écrit dans schema/README.md. (7) Déplacement vers prompts/gabarits-1.0.0.json au lot perimetre-prompts.
2. Toute autre combinaison ; chaque point est une ligne dans un prédicat nommé.

**Recommandation :** Option 1 sur les sept points, à écrire avant le run pilote du 22 novembre : après, tout changement réduit les questions communes de la tendance §8.

Lots portant cette décision : questions-tirage-symetrie

### D8 — Trois points que le §4 ne tranche pas, rencontrés en implémentant la réannotation et le registre des mesures.

(1) Les annotateurs d'un lot de réannotation sont hérités du lot d'origine, et --annotateurs est refusé avec --reannote. Le §4 ne dit rien. Deux kappas portés par des paires différentes ne se remplacent pas l'un l'autre, or le §4 fait remplacer. (2) Le registre est indexé par mesure et thème, donc une demande de correction visant un autre chemin que /theme ne pourrait jamais être tranchée et retiendrait l'item indéfiniment ; le cas est aujourd'hui inatteignable car l'interface refuse ces chemins, mais le §4 pourrait les ouvrir. (3) L'identifiant d'un lot de réannotation est dérivé (lot-003 puis lot-003-r1), et pnpm mesures prend par défaut la date civile du jour.

Options :

1. (1) Garder l'héritage des annotateurs : faire rejuger un lot par une autre paire deviendrait un amendement au §4, qui devrait dire ce que devient le kappa comparé. (2) Si le §4 ouvre un jour la correction d'autre chose que le thème, élargir la clé du registre dans le même amendement. (3) Entériner les deux conventions dans le protocole ou schema/README.md.
2. Ouvrir dès maintenant la réannotation par une autre paire d'annotateurs, ce qui suppose de définir le kappa retenu.

**Recommandation :** Option 1 sur les trois points. Aucun ne bloque le 15 novembre, mais (1) doit être écrit avant qu'un annotateur ne quitte le projet en cours de campagne.

Lots portant cette décision : dette-validation

## Décisions tranchées

Aucune décision tranchée.

## Arbre

Légende : couleur par niveau de preuve — T0 gris, T1 ambre, T2 bleu, T3 vert, T4 bleu foncé ; une décision en attente est un hexagone rouge. Arête pleine (`-->`) = dépendance bloquante ; arête pointillée (`-.->`) = dépendance informative seulement.

```mermaid
flowchart LR
  subgraph jalon_J1["J1 · 15 oct. 2026"]
    lot_perimetre_prompts["perimetre-prompts<br/>config/perimetre.yaml et prompts/ versionnés<br/>T0"]:::T0
    lot_protocole["protocole<br/>Protocole v0.2, à geler en v1.0<br/>T1"]:::T1
  end
  subgraph jalon_J2["J2 · 31 oct. 2026"]
    lot_ci["ci<br/>Intégration continue : check et test sur chaque PR<br/>T0"]:::T0
    lot_collecte["collecte<br/>Collecte et archivage : crawl, PDF, yt-dlp, transcription, SHA-256, Wayback<br/>T0"]:::T0
    lot_extraction["extraction<br/>Extraction double, test verbatim, écriture dans staging/<br/>T0"]:::T0
    lot_feuille_de_route["feuille-de-route<br/>Feuille de route générée depuis ce fichier<br/>T2"]:::T2
    lot_outillage["outillage<br/>ajv sur les 45 exemples, ESLint à deux règles de complexité<br/>T3"]:::T3
    lot_questions_tirage_symetrie["questions-tirage-symetrie<br/>Gabarits, reformulations, tirage stratifié à graine, pnpm symmetry, invariants inter-fichiers<br/>T2"]:::T2
    lot_schemas["schemas<br/>Schémas JSON et 45 exemples<br/>T2"]:::T2
    lot_validation_interface["validation-interface<br/>Interface de validation humaine, pnpm lots, pnpm promote<br/>T3"]:::T3
  end
  subgraph jalon_J3["J3 · 15 nov. 2026"]
    lot_dette_validation["dette-validation<br/>Réannotation supersédante, pnpm mesures, logique client extraite vers domaine/<br/>T2"]:::T2
    lot_hors_code["hors-code<br/>Avocat, Zenodo, institutions, annotateurs, panel, image conteneur §9<br/>T0"]:::T0
  end
  subgraph jalon_J4["J4 · 22 nov. 2026"]
    lot_interrogation["interrogation<br/>Appels API, fenêtre 48 h, trois relances, réponses brutes immuables, archive Zenodo<br/>T0"]:::T0
    lot_notation["notation<br/>Deux juges, désaccords, échantillon 10 %, test contrefactuel, revue humaine des erreurs graves<br/>T0"]:::T0
  end
  subgraph jalon_J5["J5 · 1 déc. 2026"]
    lot_analyse["analyse<br/>Métriques §8, bootstrap en grappes, permutation, Holm, robustesse<br/>T2"]:::T2
    lot_site["site<br/>Site statique généré depuis runs/<br/>T0"]:::T0
  end
  dec_D1{{"D1<br/>Brancher une intégration continue GitHub Actions qui exécute…"}}:::decision
  dec_D2{{"D2<br/>Quelles dépendances autoriser pour la collecte et l'archivag…"}}:::decision
  dec_D3{{"D3<br/>Quels SDK d'API autoriser pour l'extraction, l'interrogation…"}}:::decision
  dec_D4{{"D4<br/>Comment offrir le formulaire public de contestation (§4, dro…"}}:::decision
  dec_D5{{"D5<br/>Quelle est la liste nominative des outils et des candidats d…"}}:::decision
  dec_D6{{"D6<br/>Six précisions du §8 remontées par le lot analyse, à écrire …"}}:::decision
  dec_D7{{"D7<br/>Sept conventions du tirage que le protocole n'écrit pas, ret…"}}:::decision
  dec_D8{{"D8<br/>Trois points que le §4 ne tranche pas, rencontrés en impléme…"}}:::decision
  lot_collecte -.-> lot_extraction
  lot_perimetre_prompts --> lot_extraction
  lot_protocole --> lot_hors_code
  lot_perimetre_prompts --> lot_interrogation
  lot_questions_tirage_symetrie --> lot_interrogation
  lot_interrogation -.-> lot_notation
  lot_perimetre_prompts --> lot_notation
  lot_analyse --> lot_site
  dec_D1 --> lot_ci
  dec_D2 --> lot_collecte
  dec_D3 --> lot_extraction
  dec_D3 --> lot_interrogation
  dec_D3 --> lot_notation
  dec_D4 --> lot_protocole
  dec_D4 --> lot_site
  dec_D5 --> lot_perimetre_prompts
  dec_D5 --> lot_protocole
  dec_D6 --> lot_analyse
  dec_D7 --> lot_questions_tirage_symetrie
  dec_D8 --> lot_dette_validation
  classDef T0 fill:#78716c,color:#ffffff,stroke:#44403c
  classDef T1 fill:#b45309,color:#ffffff,stroke:#78350f
  classDef T2 fill:#0369a1,color:#ffffff,stroke:#0c4a6e
  classDef T3 fill:#15803d,color:#ffffff,stroke:#14532d
  classDef T4 fill:#1d4ed8,color:#ffffff,stroke:#1e3a8a
  classDef decision fill:#b91c1c,color:#ffffff,stroke:#7f1d1d
```

## Lots

| Lot | Titre | Jalon | Niveau | État | Agent | Taille | Temps auteur (h) | Dépend de |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| perimetre-prompts | config/perimetre.yaml et prompts/ versionnés | J1 | T0 | bloqué par D5 | auteur avec fable | S | 5 | — |
| protocole | Protocole v0.2, à geler en v1.0 | J1 | T1 | bloqué par D4, D5 | auteur | S | 4 | — |
| ci | Intégration continue : check et test sur chaque PR | J2 | T0 | bloqué par D1 | sonnet | S | 0.25 | — |
| collecte | Collecte et archivage : crawl, PDF, yt-dlp, transcription, SHA-256, Wayback | J2 | T0 | bloqué par D2 | sonnet | L | 1 | — |
| extraction | Extraction double, test verbatim, écriture dans staging/ | J2 | T0 | bloqué par D3, perimetre-prompts | opus | L | 1 | collecte (informe), perimetre-prompts |
| feuille-de-route | Feuille de route générée depuis ce fichier | J2 | T2 | débloqué | sonnet | S | 0.5 | — |
| outillage | ajv sur les 45 exemples, ESLint à deux règles de complexité | J2 | T3 | atteint | sonnet puis opus | M | 0.5 | — |
| questions-tirage-symetrie | Gabarits, reformulations, tirage stratifié à graine, pnpm symmetry, invariants inter-fichiers | J2 | T2 | bloqué par D7 | opus | L | 2 | — |
| schemas | Schémas JSON et 45 exemples | J2 | T2 | débloqué | fait | S | 0 | — |
| validation-interface | Interface de validation humaine, pnpm lots, pnpm promote | J2 | T3 | atteint | fait | L | 0 | — |
| dette-validation | Réannotation supersédante, pnpm mesures, logique client extraite vers domaine/ | J3 | T2 | bloqué par D8 | opus pour promote, sonnet pour le reste | M | 1 | — |
| hors-code | Avocat, Zenodo, institutions, annotateurs, panel, image conteneur §9 | J3 | T0 | bloqué par protocole | auteur | L | 24 | protocole |
| interrogation | Appels API, fenêtre 48 h, trois relances, réponses brutes immuables, archive Zenodo | J4 | T0 | bloqué par D3, perimetre-prompts, questions-tirage-symetrie | opus | M | 1 | perimetre-prompts, questions-tirage-symetrie |
| notation | Deux juges, désaccords, échantillon 10 %, test contrefactuel, revue humaine des erreurs graves | J4 | T0 | bloqué par D3, perimetre-prompts | opus | L | 2 | interrogation (informe), perimetre-prompts |
| analyse | Métriques §8, bootstrap en grappes, permutation, Holm, robustesse | J5 | T2 | bloqué par D6 | opus | L | 1 | — |
| site | Site statique généré depuis runs/ | J5 | T0 | bloqué par D4, analyse | sonnet | M | 2 | analyse |

## Jalons

| Jalon | Date | Titre | Critère |
| --- | --- | --- | --- |
| J1 | 2026-10-15 | Protocole v1.0 gelé, relu par un avocat, déposé sur Zenodo, transmis aux institutions | Empreinte et DOI publiés ; liste nominative des outils et des candidats du premier run publiée |
| J2 | 2026-10-31 | Schéma, interface de validation, collecte et archivage en production | 100 items T1 archivés et extraits ; test verbatim et tests de symétrie verts en intégration continue |
| J3 | 2026-11-15 | Annotateurs formés ; 200 items vérifiés ; panel constitué ou faiblesse déclarée | Kappa ≥ 0,80 sur les deux derniers lots |
| J4 | 2026-11-22 | Run pilote complet ; jeu d'or de 300 réponses | Kappa juge-humain ≥ 0,75 ; taux de changement contrefactuel ≤ 3 % |
| J5 | 2026-12-01 | Premier run public mensuel | Tous les critères précédents ; au moins 8 candidats au-dessus du seuil de couverture |

### J1

- perimetre-prompts (T0)
- protocole (T1)

### J2

- ci (T0)
- collecte (T0)
- extraction (T0)
- feuille-de-route (T2)
- outillage (T3)
- questions-tirage-symetrie (T2)
- schemas (T2)
- validation-interface (T3)

### J3

- dette-validation (T2)
- hors-code (T0)

### J4

- interrogation (T0)
- notation (T0)

### J5

- analyse (T2)
- site (T0)

## Échelle de preuve

| Niveau | Définition |
| --- | --- |
| T0 | absent : rien n'existe |
| T1 | écrit, sans vérification automatique |
| T2 | testé unitairement, cas limites couverts |
| T3 | testé de bout en bout sur fixtures |
| T4 | exercé sur données réelles |

## Anomalies relevées

- README.md est encodé en UTF-16 avec BOM et ne contient qu'un titre.
- CLAUDE.md promet cinq commandes absentes de package.json : symmetry, run:dry, run:live, analyze, build:site.
- L'annexe A du protocole montre l'identifiant 2027-LEP-FISC-0012, contredit par la convention d'identifiants opaques de schema/README.md.
- Le suivi du taux de « non évaluable » par annotateur était donné pour manquant par docs/DETTE.md alors qu'il était implémenté depuis le 2026-09-17 : entrée corrigée le 2026-09-19.
