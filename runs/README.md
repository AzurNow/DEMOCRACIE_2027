# `runs/` — disposition des fichiers d'un run

Un run vit dans `runs/<date>/`, où `<date>` est la date de `date_gel` **à Paris**, au format
`AAAA-MM-JJ` (`pipeline/interrogation/heure-paris.ts:dateParis`). Un gel le 27 novembre 2026 à
00:30, heure de Paris, range le run sous `runs/2026-11-27/`, même si l'instant UTC tombe la veille.

Deux parts, et la frontière est celle de CLAUDE.md, « Ce que Git stocke » : Git garde ce qui doit
rester clonable par n'importe qui ; le volume part dans une archive Zenodo, référencée depuis Git par
son DOI et son empreinte SHA-256 (`run.json#/depot`, §9).

```
runs/<date>/
  run.json                    Git   le run (schema/run.schema.json) : fenêtre, versions, graines,
                                    périmètre au gel, symétrie, juges, dépôt Zenodo, publication
  tirage.json                 Git   le tirage (schema/tirage.schema.json), référencé par
                                    run.json#/tirage/chemin et son sha256
  questions/<question_id>.json Git  les questions tirées (schema/question.schema.json)
  verdicts/<id>.json          Git   un verdict par objet noté (schema/verdict.schema.json)
  metriques/…                 Git   les sorties d'analysis/ (§8)
  volume/                     hors Git (ligne /runs/*/volume/ de .gitignore) — archive Zenodo
    reponses/<id>.json              une réponse par requête (schema/reponse.schema.json)
    tentatives/<empreinte>.jsonl    le journal des tentatives d'une requête
    notations/<id>.json             les notations individuelles (schema/notation.schema.json)
```

Ce lot (interrogation, mode simulé) écrit seulement `volume/reponses/` et `volume/tentatives/`. Les
noms `questions/`, `verdicts/`, `metriques/` et `notations/` sont la disposition proposée pour les
lots suivants, à confirmer par eux ; ils n'ont pas encore d'écrivain dans le dépôt.

## `volume/reponses/<id>.json`

Une réponse par requête — question × outil × mode × formulation × échantillon (§2) —, obtenue ou
manquante, jamais deux. `<id>` est l'identifiant opaque de la réponse (ULID) : un nom lisible ferait
fuiter l'outil vers un juge aveugle (§7).

- **Écrite une fois** (règle 7) : validée contre le schéma, puis écrite par ouverture exclusive ; un
  fichier existant n'est jamais remplacé, et une seconde réponse pour la même requête est refusée
  (`pipeline/interrogation/stockage.ts`).
- `brut` est le corps HTTP reçu, lu comme objet JSON ; `brut_sha256` est l'empreinte de sa forme
  canonique (`validation/domaine/empreinte.ts:canoniser`), vérifiable sur le fichier relu.
- `requete` porte le corps envoyé et son empreinte ; aucun en-tête, donc aucune clé d'API.
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

## Ce que l'analyse lira

`analysis/filtre.ts:assembler()` prend un `EntreesAnalyse` : `run`, `entrees_tirage`, `questions`,
`items`, `reponses`, `verdicts`. Sa lecture depuis cette disposition vient au lot notation, sans
couche intermédiaire (docs/DETTE.md, « Le contrat d'entrée de l'analyse précède la disposition de
`runs/` ») :

| Champ de `EntreesAnalyse` | Lu dans |
| --- | --- |
| `run` | `runs/<date>/run.json` |
| `entrees_tirage` | `tirage.json#/entrees`, au chemin de `run.json#/tirage/chemin` |
| `questions` | `runs/<date>/questions/*.json` |
| `items` | `data/items/`, à la version épinglée par chaque question (`reference.item_version`) |
| `reponses` | `runs/<date>/volume/reponses/*.json`, chaque fichier validé ; pour un tiers, le volume se reconstitue depuis l'archive Zenodo, dont l'empreinte est vérifiée contre `run.json#/depot/archives` |
| `verdicts` | `runs/<date>/verdicts/*.json` |

Les journaux de tentatives et les notations individuelles ne passent pas par `assembler()` : les
premiers servent l'audit du §6, les secondes le recalcul de robustesse §8(a).

## `pnpm run:dry`

Le run simulé écrit cette même disposition sous un répertoire temporaire, ou sous
`--sortie <chemin>` : `<chemin>/<date>/volume/…`. **Jamais dans `runs/` par défaut** : un run simulé
n'est pas un run.
