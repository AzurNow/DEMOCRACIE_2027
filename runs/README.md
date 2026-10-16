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
  balise/<relais>.json        Git   la réponse brute de chaque relais drand au tour du gel, octets
                                    exacts (règle 7), référencée par run.json#/balise/relais
  engagement/wayback.json     Git   la réponse brute de l'API de disponibilité de la Wayback
                                    Machine qui a vérifié l'engagement, octets exacts (D47 (3)),
                                    référencée par run.json#/engagement/disponibilite
  verdicts/<id>.json          Git   un verdict par objet noté (schema/verdict.schema.json)
  metriques/…                 Git   les sorties d'analysis/ (§8)
  checklist.json              Git   la checklist de l'annexe F (schema/checklist.schema.json), écrite
                                    par pnpm go-no-go, contresignée par pnpm go-no-go:contresigner
  volume/                     hors Git (ligne /runs/*/volume/ de .gitignore) — archive Zenodo
    reponses/<id>.json              une réponse par requête (schema/reponse.schema.json)
    tentatives/<empreinte>.jsonl    le journal des tentatives d'une requête
    notations/<id>.json             une notation individuelle par fichier (schema/notation.schema.json)
    reponses-contrefactuelles/<id>.json
                                    les réponses permutées du test contrefactuel (§7), contexte ≠ run
    liens/<sha256 de l'URL>.json    le test HTTP d'un lien cité (schema/existence-lien.schema.json)
    liens/pages/<sha256><ext>       la page d'un lien qui existe, octets reçus tels quels
```

Les mesures ne sont pas copiées dans `runs/<date>/` : comme les items, elles sont lues dans
`data/mesures/` (un fichier par mesure, décision D38) au commit `run.json#/versions/donnees_commit`,
et `pnpm symmetry --mesures=data/mesures` recoupe ce répertoire avec lui-même à ce commit
(`outils/items-au-gel.ts:exigerMesuresDuGel`) : une mesure en plus, en moins ou modifiée depuis le gel
arrête la barrière.

`pnpm geler` écrit `run.json`, `tirage.json`, `questions.json`, `balise/` et `engagement/` (section
suivante).
L'interrogation (`pipeline/interrogation/stockage.ts`) écrit `volume/reponses/` et
`volume/tentatives/`. La notation (`pipeline/notation/stockage.ts:DepotNotation`) écrit
`verdicts/`, `volume/notations/` et `volume/reponses-contrefactuelles/`. `run.json`, `tirage.json`
et `questions.json` suivent l'usage déjà documenté de `pnpm symmetry` (`outils/symmetry.ts`). Le nom `metriques/` reste la disposition proposée pour le lot de l'analyse ;
il n'a pas encore d'écrivain dans le dépôt.

## `pnpm geler` — `run.json`, `tirage.json`, `questions.json`, `balise/`, `engagement/`

```
pnpm geler --type-run=<type> --engagement=<url de capture> [--sortie=<répertoire>]
```

Le gel d'un run (décisions D41, D44, D45 (1), D46, D47 ; `pipeline/gel/`). **Seul l'auteur gèle un vrai
run**, c'est-à-dire lance la commande sans `--sortie` : elle écrit alors sous `runs/<date>/`. Un agent
ou un test gèle toujours vers une `--sortie` hors de `runs/` (une sortie sous `runs/` est refusée), et
jamais avec le réseau : la commande appelle les deux relais drand et la Wayback Machine, rien d'autre.
Chaque appel est abandonné au bout de 30 s (D47 (4), `pipeline/gel/reseau.ts:DELAI_APPEL_RESEAU_MS`) :
refus nommé, aucune nouvelle tentative.

Lit `data/items/`, `data/mesures/`, `data/formulations/`, `config/perimetre.yaml`, `config/gel.json`
(version du protocole, début de fenêtre, juges, alias aveugles ; `schema/config-gel.schema.json`),
`docs/PROTOCOLE.md` et le commit courant ; vérifie l'engagement archivé, lit la balise ; écrit, au
statut `planifie` et tout ou rien (un temporaire voisin renommé d'un geste) :

- `questions.json` : le jeu complet des questions engendrées au gel, chacune avec ses formulations
  relues (`data/formulations/`), `engendree_le` égal à `date_gel` (D44) ;
- `tirage.json` : le tirage (`pipeline/questions/tirage.ts`), graine du tirage et quotas du périmètre ;
- `run.json` : fenêtre, `versions.code_commit` et `versions.donnees_commit` (HEAD : `data/` est dans le
  même dépôt), `versions.protocole_sha256` (SHA-256 des octets de `docs/PROTOCOLE.md` au commit gelé),
  graines, `balise`, `engagement`, périmètre au gel, juges, symétrie, et `tirage`
  (`runs/<date>/tirage.json`, SHA-256 de ses octets, nombre de questions tirées) — même quand
  `--sortie` est donnée ;
- `balise/api.drand.sh.json` et `balise/drand.cloudflare.com.json` : la réponse de chaque relais au
  tour du gel, octet pour octet (règle 7), et son SHA-256 dans `run.json#/balise/relais` ;
- `engagement/wayback.json` : la réponse de l'API de disponibilité de la Wayback Machine, octet pour
  octet (D47 (3)), avec l'URL appelée et son SHA-256 dans `run.json#/engagement/disponibilite`.

`balise` et `engagement` sont exigés de tout run, pilote compris (D47 (2)).

Refuse, sans rien écrire, code 1 : un dépôt sale (`git status --porcelain` non vide, fichiers non
suivis compris), vérifié avant toute autre lecture ; un répertoire `<date>/` qui existe déjà, même
vide (un gel s'invalide, il ne se refait pas) ; un champ de `config/gel.json` à `null` ou absent,
nommé ; une question sans formulations relues sur son texte neutre et sa position courants
(`FormulationsEnDefautAuGel`) ; un tour drand pas encore émis (`date_gel` dans le futur), **avant tout
appel réseau** ; un engagement absent, mal formé, d'un autre commit, non antérieur à `date_gel` ou que
la Wayback Machine ne sert pas (`EngagementRefuse`) ; une balise refusée (`BaliseRefusee` : relais
injoignable, muet au-delà de 30 s ou en erreur HTTP, réponse illisible, chaîne différente de l'épinglée, tour différent,
`randomness` différent de SHA-256(signature), relais en désaccord) ; et tout ce que la barrière de
`pnpm symmetry` refuse — les mêmes fonctions (`pipeline/gel/barriere.ts`), items et mesures recoupés
avec le commit inscrit. Une symétrie `ecart_tolere` est écrite, l'écart dans `run.json#/symetrie`.

### Engagement archivé (D46)

Avant `date_gel`, l'auteur pousse le commit à geler, puis fait capturer par la Wayback Machine sa page
`https://github.com/AzurNow/DEMOCRACIE_2027/commit/<sha complet>`. Au gel, il passe l'URL de la
capture, `https://web.archive.org/web/<14 chiffres UTC>/https://github.com/AzurNow/DEMOCRACIE_2027/commit/<sha>`,
par `--engagement`. Elle ne vit pas dans `config/gel.json` : ce fichier fait partie du commit capturé
et ne peut pas porter l'URL de sa propre capture. Le gel exige que `<sha>` soit HEAD, que
l'horodatage soit une date réelle strictement antérieure à `date_gel`, et que
`https://archive.org/wayback/available?url=<page>&timestamp=<horodatage>` rende comme capture la plus
proche celle-là exactement (même horodatage, statut `"200"`, `available: true`). L'URL et
l'horodatage sont inscrits dans `run.json#/engagement`, avec l'URL de l'API appelée, le chemin et le
SHA-256 de sa réponse archivée (`engagement/wayback.json`). La source `--engagement` est retenue par
D47 (1).

### Balise drand (D44) et identifiant (D45 (1))

- **Chaîne** : quicknet, empreinte `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`,
  genèse 1692803367 s, période 3 s, schéma `bls-unchained-g1-rfc9380` ; épinglée dans
  `pipeline/gel/balise.ts`, vérifiée contre `/<empreinte>/info` de chaque relais, inscrite dans
  `run.json#/balise/chaine`.
- **Tour** : le premier émis à `date_gel` ou après, `r = ⌈(date_gel − genèse) / 3 s⌉ + 1` (le tour r
  est émis à genèse + (r − 1) × 3 s) ; `run.json#/balise/tour`.
- **Relais** : `https://api.drand.sh` et `https://drand.cloudflare.com`, `/<empreinte>/public/<r>` lu
  sur les deux ; même tour, même signature, sinon refus. Aucun repli sur un relais unique.
- **Aléa** : SHA-256 des 48 octets de la signature, recalculé au gel, égal au `randomness` de chaque
  relais ; `run.json#/balise/alea`.
- **Graines** : graine(clé) = les 8 premiers octets, lus gros-boutistes, de SHA-256(aléa en
  hexadécimal minuscule ‖ U+0000 ‖ clé, en UTF-8), décalés de 11 bits vers la droite (dans
  [0, 2^53 − 1]) ; la clé de chaque graine est dans `run.json#/balise/cles` (son nom).
- **Identifiant** : l'ULID du run a pour horodatage `date_gel` en millisecondes et pour partie
  aléatoire les 10 premiers octets de SHA-256(aléa hex ‖ U+0000 ‖ `run_id`), en base 32 de Crockford
  (`run.json#/balise/cle_identifiant`). Le tirage dépend de l'identifiant (`tirage.json#/run_id`,
  `tirage.ts:amorce`) : deux gels du même commit et de la même balise donnent donc `run.json`,
  `tirage.json`, `questions.json`, `balise/` et `engagement/` identiques, octet pour octet.

**Vérifier par un tiers.** Le gel ne vérifie pas la signature BLS (D44 : aucune dépendance). Un tiers
le fait hors du dépôt : (1) relire `balise/<relais>.json`, recalculer son SHA-256 et le comparer à
`run.json#/balise/relais[].sha256` ; (2) vérifier `signature` pour le tour `tour` contre la clé
publique de la chaîne (`public_key` de `https://api.drand.sh/<empreinte>/info`, qui doit rendre la
même empreinte) avec un client drand qui vérifie les signatures — la bibliothèque JavaScript
`drand-client` ou le client Go de `github.com/drand/drand`, configurés sur cette empreinte. Pour le
schéma `bls-unchained-g1-rfc9380`, le message signé est SHA-256 du numéro de tour sur 8 octets
gros-boutistes, la signature est sur G1 ; (3) recalculer l'aléa, les cinq graines et l'identifiant
par les règles ci-dessus, et les comparer à `run.json#/balise/alea`, `run.json#/graines` et
`run.json#/id`. Cette procédure n'a pas encore été rejouée de bout en bout sur un vrai run.

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

Le test HTTP des liens du §7 (décisions D20 et D21, `pipeline/liens`), un passage par run, après la
fermeture de la fenêtre d'interrogation (refusé avant `fenetre.fin`) et avant la notation. Les URL de
`normalise.liens` des réponses obtenues sont prises telles qu'écrites, dédoublonnées sur la chaîne
exacte et testées en ordre trié ; la table résultat → verdict est `config/test-liens.toml`
(`table-liens-v2`), qui fixe aussi le délai d'une requête (`delai_s`) et la conversion des IRI.

- **Un fichier par URL**, `<sha256 de l'URL en UTF-8>.json`, écrit une fois (refus d'écraser), après
  contrôle de sa forme. Une URL que la table ne classe pas n'a pas de fichier : elle reste « en
  attente du test des liens » pour la notation, et le passage sort avec le code 1 (la v2 classe
  toute issue et toute classe de code : ce cas ne survient qu'avec une autre table).
- **URL non ASCII.** Une IRI est convertie en URI pour l'envoi seulement (RFC 3987 §3.1 :
  percent-encoding UTF-8 hors ASCII, hôte en IDNA ; `%XX` existants intacts), au site comme à la
  Wayback Machine (D22 : requête de l'API de disponibilité et URL `id_`). `url_citee` et le nom du
  fichier gardent la chaîne exacte, `url_finale` est l'URI qui a répondu ; une IRI inconvertible
  est `url_malformee` (non testable), et sa recherche d'instantané est consignée en échec sans
  requête.
- **`pages/`** garde, octets intacts et nommés par leur SHA-256, la page d'un lien qui existe et la
  version brute (`https://web.archive.org/web/<14 chiffres>id_/<uri>`) de l'instantané retenu d'un
  lien inaccessible ou non testable. Un instantané n'est retenu que si l'API de disponibilité le dit
  de statut 200 ; sinon il est écarté (`wayback.issue = "ecarte"`, statut consigné). Seul un
  téléchargement réussi pose `archive_url` et `sha256_contenu`. D22 : le téléchargement suit les
  redirections, et Wayback sert souvent une capture voisine ; `archive_url` est l'instantané
  réellement servi, forme publique sans `id_` de l'URL finale, l'instantané demandé restant dans
  `wayback.url_instantane`. Une URL finale hors de la forme `/web/<14 chiffres>id_/…` de
  web.archive.org est un téléchargement en échec. Un échec est consigné dans
  `wayback.telechargement`, compté parmi les échecs Wayback du bilan, sans changer le verdict.
- **Relance.** Un fichier déjà présent est repris tel quel : l'URL n'est ni retestée ni réécrite, son
  verdict est compté « repris ». Un fichier présent mais illisible ou qui ne porte pas cette URL est
  refusé (code 1), jamais remplacé. Une page déjà conservée n'est pas réécrite (son nom est son
  empreinte) ; une interruption entre la page et le résultat refait le test et Save Page Now (ou la
  recherche et le téléchargement de l'instantané).
- **Lecture.** `pnpm notation:humaine` lit ce répertoire s'il existe
  (`pipeline/notation/fournisseur-fichiers.ts`) ; un fichier invalide, mal nommé ou dont la copie
  conservée (page ou version brute de l'instantané) manque empêche le démarrage. Le dossier `pages/` et les résultats sont les seules entrées admises.

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

## `pnpm go-no-go <repertoire_run>` et `pnpm go-no-go:contresigner`

Les sept critères du §12 et la décision qui en découle (D24, `pipeline/go-no-go/`). Lit `run.json`,
`volume/reponses/`, `volume/notations/`, `verdicts/`, `tirage.json` s'il est là, et l'existence de
`metriques/`. Écrit dans `run.json` `go_no_go`, le kappa de l'échantillon humain de chaque juge
retenu (`kappa_echantillon_humain`, ou son motif d'indéfinition), le nombre de réponses de
l'échantillon à note humaine indéterminée, écartées de ce kappa (`indeterminees_echantillon_humain`,
D25), et `motif_provisoire` si la décision
est provisoire ; écrit `checklist.json` sans contreseing. Ne touche jamais `statut`. Refuse un run
`invalide`, `planifie` ou à symétrie rouge ; un go/no-go déjà écrit et différent du recalcul est une
erreur, identique un no-op. `metriques/` présent arrête la commande : aucun format n'y est encore
défini. Sortie 0 ou 2.

`pnpm go-no-go:contresigner <repertoire_run> --nom="<nom>" --case=<rang>:faite --case=<rang>:non_faite:<motif>`
déclare chaque case `declaree` de la checklist et ajoute `contreseing: { nom, date }`. Refuse une case
déclarée sans état, une case non faite sans motif, une checklist déjà contresignée. N'écrit que
`checklist.json`.

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

## `pnpm preuve <url> [<url>…]`

Commande de l'auteur, jamais d'un agent contre le réseau réel (`pipeline/preuve`) : archive une preuve
du périmètre (déclaration de candidature, sondage, classement de store, CGU, page de contact) et
imprime le bloc YAML à coller dans `config/perimetre.yaml`. Elle n'écrit ni dans `config/`, ni dans
`data/`, ni dans `runs/`.

```bash
pnpm preuve https://exemple.fr/declaration --cle-date date
pnpm preuve --sondage https://institut.fr/sondage-12
pnpm preuve --fichier scratch/perimetre/urls-a-archiver.txt
```

Pour chaque URL : GET selon la norme de la collecte (robots.txt, une requête par seconde et par hôte,
cinq redirections au plus), SHA-256 des octets reçus tels quels, copie sous
`scratch/perimetre/preuves/<sha256><extension>` (`--dossier` pour changer), Save Page Now.

- **Bloc** : `url` exacte telle que donnée, `sha256`, `archive_url` (l'instantané renvoyé par Wayback) ;
  en commentaire, l'instant de capture, l'URL finale si elle diffère, le code HTTP, le type de contenu,
  la copie locale et, dans un fichier d'URL, les lignes `#` qui précèdent l'URL (sans ligne vide entre).
- **Jamais devinés** : `date_publication:` (ou `date:` avec `--cle-date date`) et, avec `--sondage`,
  `institut:` sont imprimés vides avec `# à lire sur la page`. L'auteur les lit sur la page.
- **Échec** (robots.txt, 4xx/5xx, réseau, URL non http(s), IRI inconvertible) : pas de bloc, la cause
  sur stderr, code de sortie 1 ; les autres URL sont traitées. Si Wayback échoue après le
  téléchargement, le bloc est imprimé avec `archive_url:` vide et un commentaire, et le code est 1 :
  refaire l'URL avant de coller. Code 2 : ligne de commande ou fichier d'URL refusés, aucune requête.
- Une URL non ASCII est envoyée en URI (conversion de `pipeline/liens/iri.py`) ; le bloc garde la
  chaîne exacte.
