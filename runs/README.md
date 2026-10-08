# `runs/` — disposition des fichiers d'un run

Un run vit dans `runs/<date>/`, où `<date>` est la date de `date_gel` **à Paris**, au format
`AAAA-MM-JJ` (`pipeline/interrogation/heure-paris.ts:dateParis`), jamais la date d'ouverture de la
fenêtre d'interrogation. Un gel le 27 novembre 2026 à 00:30, heure de Paris, range le run sous
`runs/2026-11-27/`, même si l'instant UTC tombe la veille.

Deux parts, et la frontière est celle de CLAUDE.md, « Ce que Git stocke » : Git garde ce qui doit
rester clonable par n'importe qui ; le volume part dans une archive Zenodo, référencée depuis Git par
son DOI et son empreinte SHA-256 (`run.json#/depot`, §9).

```
runs/<date>/
  run.json                    Git   le run (schema/run.schema.json) : fenêtre, versions, graines,
                                    périmètre au gel, symétrie, juges, dépôt Zenodo, publication
  tirage.json                 Git   le tirage (schema/tirage.schema.json), référencé par
                                    run.json#/tirage/chemin et son sha256
  questions.json              Git   le jeu complet des questions engendrées au gel, un tableau
                                    (schema/question.schema.json ; lu par pnpm symmetry)
  mesures.json                Git   les mesures au gel, un tableau (lu par pnpm symmetry)
  verdicts/<id>.json          Git   un verdict par objet noté (schema/verdict.schema.json)
  metriques/…                 Git   les sorties d'analysis/ (§8)
  volume/                     hors Git (ligne /runs/*/volume/ de .gitignore) — archive Zenodo
    reponses/<id>.json              une réponse par requête (schema/reponse.schema.json)
    tentatives/<empreinte>.jsonl    le journal des tentatives d'une requête
    notations/<id>.json             une notation individuelle par fichier (schema/notation.schema.json)
    reponses-contrefactuelles/<id>.json
                                    les réponses permutées du test contrefactuel (§7), contexte ≠ run
    liens/<sha256 de l'URL>.json    le test HTTP d'un lien cité (schema/existence-lien.schema.json)
    liens/pages/<sha256><ext>       la page d'un lien qui existe, octets reçus tels quels
```

L'interrogation (`pipeline/interrogation/stockage.ts`) écrit `volume/reponses/` et
`volume/tentatives/`. La notation (`pipeline/notation/stockage.ts:DepotNotation`) écrit
`verdicts/`, `volume/notations/` et `volume/reponses-contrefactuelles/`. `run.json`, `tirage.json`,
`questions.json` et `mesures.json` suivent l'usage déjà documenté de `pnpm symmetry`
(`outils/symmetry.ts`). Le nom `metriques/` reste la disposition proposée pour le lot de l'analyse ;
il n'a pas encore d'écrivain dans le dépôt.

## `verdicts/`, `volume/notations/`, `volume/reponses-contrefactuelles/`

Mêmes garanties que `volume/reponses/` (règle 7) : chaque objet est validé contre son schéma, puis
écrit par ouverture exclusive ; un fichier existant n'est jamais remplacé, et rien n'est écrit quand
un contrôle échoue. Chaque objet porte le `run_id` du `run.json` de son répertoire.

- `verdicts/<id>.json` : un verdict par objet noté, et seulement pour un objet de contexte `run` ;
  un second verdict sur le même objet est refusé dès l'écriture.
- `volume/notations/<id>.json` : une notation individuelle par fichier, tous contextes confondus
  (notations du run, des humains, du test contrefactuel).
- `volume/reponses-contrefactuelles/<id>.json` : les réponses permutées du test contrefactuel, de
  contexte autre que `run`, une par réponse d'origine et par contexte. Un dossier à part de
  `volume/reponses/` : une réponse contrefactuelle partage la requête de sa réponse d'origine, que
  le stockage de l'interrogation refuserait une seconde fois, et ces textes n'ont été produits par
  aucun outil.

## `volume/reponses/<id>.json`

Une réponse par requête — question × outil × mode × formulation × échantillon (§2) —, obtenue ou
manquante, jamais deux. `<id>` est l'identifiant opaque de la réponse (ULID) : un nom lisible ferait
fuiter l'outil vers un juge aveugle (§7).

- **Écrite une fois** (règle 7) : validée contre le schéma, puis écrite par ouverture exclusive ; un
  fichier existant n'est jamais remplacé, et une seconde réponse pour la même requête est refusée
  (`pipeline/interrogation/stockage.ts`).
- Le corps HTTP reçu (décisions de l'auteur du 2026-10-02) : `brut_octets_sha256` est le SHA-256 de
  ses octets exacts, pris avant toute lecture ; les octets eux-mêmes ne sont pas copiés. Un corps
  qui est un objet JSON est stocké dans `brut`, avec `brut_sha256`, l'empreinte de sa forme canonique
  (`validation/domaine/empreinte.ts:canoniser`), vérifiable sur le fichier relu ; les deux
  empreintes diffèrent dès que la lecture JSON a changé quelque chose (ordre des clés, espaces,
  entier au-delà de 2^53). Tout autre corps UTF-8 est stocké tel quel dans `brut_texte`, sans `brut`
  ni `brut_sha256`. Un corps qui n'est pas de l'UTF-8 valide arrête la file de l'outil : rien n'est
  écrit pour cette requête.
- `requete` porte le corps envoyé, ses en-têtes moins ceux d'authentification (`authorization`,
  `x-api-key`, `api-key` et ceux que déclare l'adaptateur, sans égard à la casse : seul retrait
  autorisé, donc aucune clé d'API), l'endpoint et `sha256`, l'empreinte de la forme canonique du
  corps seul — ni les en-têtes, ni les octets exacts envoyés.
- Une réponse obtenue porte `normalise.refus_api` (refus de modération de l'API, décision du
  2026-10-02) ; une manquante porte `motif_manquante` : `echecs` (trois tentatives) ou
  `hors_fenetre` (zéro à deux, la fenêtre de 48 h s'étant fermée).

## `volume/tentatives/<empreinte>.jsonl`

Un fichier par requête, nommé par le SHA-256 de sa clé canonique (`outil_id`, `question_id`, `mode`,
`formulation_id`, `echantillon`), en ajout seul. Avant chaque envoi : une ligne `debut` (numéro,
horodatage, clé), synchronisée sur disque ; après un échec : une ligne `echec` (l'erreur, au format
de `reponse.schema.json#/$defs/tentative/properties/erreur`). Une relance compte ces lignes : un
`debut` sans `echec` est une tentative interrompue, comptée comme échouée. C'est ce journal qui fait
tenir le plafond de trois tentatives du §6 après un arrêt brutal (`pipeline/interrogation/journal.ts`).

- **Attente après une relance.** L'attente qui précède la tentative suivante (30 s avant la 2e,
  120 s avant la 3e) repart de la relance, pas de la fin de la tentative interrompue, que le journal
  ne connaît pas : après un arrêt, l'écart entre deux tentatives est donc au moins celui du §6.
- **Journal abîmé.** Une ligne illisible, hors séquence ou tronquée (dernière ligne sans fin de
  ligne, écriture interrompue) arrête la relance avec `JournalIllisible`, qui nomme le fichier et la
  ligne. Il n'y a pas de quarantaine automatique : un humain examine le fichier et décide.

## `volume/liens/` — `pnpm liens <repertoire_run>`

Le test HTTP des liens du §7 (décision D20, `pipeline/liens`), un passage par run, après la fermeture
de la fenêtre d'interrogation (refusé avant `fenetre.fin`) et avant la notation. Les URL de
`normalise.liens` des réponses obtenues sont prises telles qu'écrites, dédoublonnées sur la chaîne
exacte et testées en ordre trié ; la table résultat → verdict est `config/test-liens.toml`.

- **Un fichier par URL**, `<sha256 de l'URL en UTF-8>.json`, écrit une fois (refus d'écraser), après
  contrôle de sa forme. Une URL que la table ne classe pas n'a pas de fichier : elle reste « en
  attente du test des liens » pour la notation, et le passage sort avec le code 1.
- **Relance.** Un fichier déjà présent est repris tel quel : l'URL n'est ni retestée ni réécrite, son
  verdict est compté « repris ». Un fichier présent mais illisible ou qui ne porte pas cette URL est
  refusé (code 1), jamais remplacé. Une page déjà conservée n'est pas réécrite (son nom est son
  empreinte) ; une interruption entre la page et le résultat refait le test et Save Page Now.
- **Lecture.** `pnpm notation:humaine` lit ce répertoire s'il existe
  (`pipeline/notation/fournisseur-fichiers.ts`) ; un fichier invalide, mal nommé ou dont la page
  manque empêche le démarrage. Le dossier `pages/` et les résultats sont les seules entrées admises.

## Ce que l'analyse lira

`analysis/filtre.ts:assembler()` prend un `EntreesAnalyse` : `run`, `entrees_tirage`, `questions`,
`items`, `reponses`, `verdicts`. `analysis/lecture-run.ts:lireRun` le lit depuis cette disposition,
sans couche intermédiaire (docs/DETTE.md, « Le contrat d'entrée de l'analyse précède la disposition
de `runs/` »), chaque fichier validé contre son schéma ; un fichier illisible, non conforme, mal
nommé, d'un autre run ou hors du contexte de son dossier est une erreur qui cite son chemin :

| Champ de `EntreesAnalyse` | Lu dans |
| --- | --- |
| `run` | `runs/<date>/run.json` |
| `entrees_tirage` | `tirage.json#/entrees`, au chemin de `run.json#/tirage/chemin` |
| `questions` | `runs/<date>/questions.json` (jeu complet : `assembler()` résout chaque réponse par son `question_id`) |
| `items` | `data/items/`, à la version épinglée par chaque question (`reference.item_version`) |
| `reponses` | `runs/<date>/volume/reponses/*.json`, chaque fichier validé ; pour un tiers, le volume se reconstitue depuis l'archive Zenodo, dont l'empreinte est vérifiée contre `run.json#/depot/archives` |
| `verdicts` | `runs/<date>/verdicts/*.json` |

Précisions de la lecture :

- `tirage.json` : `run.json#/tirage/chemin` doit désigner un fichier du répertoire du run
  (`runs/<date>/<fichier>`), et le SHA-256 de ses octets doit être `run.json#/tirage/sha256`.
- `items` : chaque item est lu par Git au commit `run.versions.donnees_commit`, à la version et à
  l'empreinte qu'épinglent les questions ; une version introuvable est une erreur, jamais la version
  courante à sa place.
- `reponses` : `volume/` absent, ou sans `reponses/`, est une erreur qui dit de reconstituer le
  volume ; un `reponses/` vide est lu tel quel, et `assembler()` décide.
- Archive Zenodo : vérifiée seulement si l'appelant en fournit le fichier, contre l'empreinte que
  `run.json#/depot/archives` déclare sous le même nom ; sinon le résultat dit `non_verifiee`.

Les journaux de tentatives, les notations individuelles et les réponses contrefactuelles ne passent
pas par `assembler()` : les premiers servent l'audit du §6 ; les notations et les réponses
contrefactuelles sont relues par `lireNotationsDuRun`, pour le contrôle croisé et le recalcul de
robustesse §8(a).

## `pnpm notation:controle <repertoire_run>`

Le contrôle croisé n° 18 (§7 ; D13) sur un run enregistré : lit `run.json`, `volume/reponses/`,
`volume/notations/` (et `volume/reponses-contrefactuelles/`) et `verdicts/`, imprime chaque violation.
Sortie 0 sans violation, 1 avec au moins une, 2 si le run n'a pas pu être lu. N'écrit rien.

## `pnpm run:dry`

Le run simulé écrit cette même disposition sous un répertoire temporaire, ou sous
`--sortie <chemin>` : `<chemin>/<date>/volume/…`. **Jamais dans `runs/` par défaut** : un run simulé
n'est pas un run.

## `pnpm notation:dry`

La chaîne de notation du §7 (`pipeline/notation/chaine.ts`, celle du vrai run) de bout en bout sur
le run simulé de `pnpm run:dry`, sans modèle ni appel réseau : seuls les juges
(`pipeline/notation/juge-simule.ts`) et le fournisseur des verdicts d'existence des liens
(`pipeline/notation/fournisseur-simule.ts`) sont simulés. Même sortie que `run:dry` : un répertoire
temporaire neuf, ou `--sortie <chemin>` ; **une sortie sous `runs/` est refusée** avant toute
écriture, et le juge et le fournisseur simulés refusent eux-mêmes un répertoire de `runs/`.

```
pnpm run:dry --sortie X && pnpm notation:dry --sortie X     note le run interrogé
pnpm notation:dry                                           interroge (comme run:dry) puis note
```

Ce que la commande ajoute sous `<sortie>/<date>/` :

- `run.json` et `questions.json`, que `run:dry` n'écrit pas, posés depuis les fixtures
  (`tests/notation/fixtures/notation-dry/run.json`, `tests/interrogation/fixtures/run-simule/questions.json`),
  jamais réécrits ; les items épinglés sont lus dans `tests/notation/fixtures/notation-dry/items/`,
  puisqu'aucun item fictif n'entre dans `data/` ;
- le test contrefactuel, d'abord (D14 (1)) : `volume/reponses-contrefactuelles/`, les notations des
  deux côtés dans `volume/notations/`, puis son inscription dans `run.json`
  (`contrefactuel_candidats`, juges, taux de l'échantillon humain), une seule fois ;
- la notation de masse par les juges non retirés (`volume/notations/`) et un verdict par réponse
  décidée (`verdicts/`).

Les réponses qui attendent un humain ne reçoivent aucun verdict : le bilan imprimé, relu du disque,
les compte par motif. Relancer sur la même sortie ne réécrit aucun fichier.
`pnpm notation:controle <sortie>/<date>` passe sur le répertoire produit.
