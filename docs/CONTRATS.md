# Contrats d'artefacts entre la collecte et la validation

`docs/PROTOCOLE.md` fait autorité sur ce qu'on mesure. Ce fichier fige la **forme des fichiers**
qu'un étage du pipeline dépose pour l'étage suivant, quand `schema/` ne les décrit pas parce qu'ils
ne sont pas des objets JSON du modèle de données.

Un contrat entre ici quand un artefact est produit par un composant et consommé par un autre : sans
lui, les deux composants se mettent d'accord par hasard, et la divergence n'est découverte qu'au
moment où un chiffre est faux.

---

## 1. Texte canonique d'une source — `staging/textes/<sha256_source>.txt`

Le texte extrait d'une source archivée. C'est **lui**, et lui seul, que les offsets d'un test
verbatim indexent, et c'est lui que l'interface de validation surligne.

| Propriété | Valeur | Pourquoi |
| --- | --- | --- |
| Nom du fichier | `<sha256_source>.txt`, où `sha256_source` est `source.sha256` de l'item | L'appariement se fait sur l'empreinte du document archivé, jamais sur son URL, qui peut changer |
| Encodage | UTF-8, sans BOM | — |
| Normalisation Unicode | **NFC** | Sans forme fixée, « é » composé et « é » décomposé donnent deux longueurs et deux jeux d'offsets pour le même texte |
| Fins de ligne | **LF** (`\n`) seulement | CRLF décale tous les offsets d'un fichier d'une unité par ligne |
| Unité des offsets | **points de code Unicode** | Ni octets (UTF-8 est de largeur variable) ni unités UTF-16 (les emojis et certains caractères comptent double en JavaScript). C'est la seule unité que TypeScript et Python comptent identiquement sans conversion |

L'item enregistre `source.texte_sha256` : l'empreinte du fichier `.txt` lui-même, distincte de
`source.sha256` qui est celle du document d'origine. Deux empreintes parce que ce sont deux
documents : le PDF publié par un candidat, et le texte qu'on en a extrait.

**Offsets.** `test_verbatim.offset_debut` et `offset_fin` désignent un intervalle **semi-ouvert**
`[debut, fin)` de ce texte brut, en points de code. La comparaison verbatim, elle, se fait après la
normalisation du test (espaces et guillemets, §4 du protocole) : la normalisation sert à **comparer**,
les offsets à **montrer**. Confondre les deux produit un surlignage décalé de quelques caractères sur
toute source contenant des guillemets typographiques.

**Personne ne corrige un texte canonique depuis l'interface de validation.** Un texte extrait faux
(OCR défaillant, transcription erronée) se solde par un rejet de l'item avec le commentaire
« texte extrait erroné », qui renvoie la source à la réextraction. L'interface n'a aucun chemin
d'écriture vers `staging/textes/`.

## 2. Transcription minutée — `staging/transcriptions/<sha256_source>.vtt`

Obligatoire pour toute source `enregistrement_audio` ou `enregistrement_video`. Format WebVTT
standard, lisible tel quel par l'élément `<track>` d'un navigateur.

Le texte canonique d'une source audio ou vidéo n'est pas produit indépendamment : il est **dérivé**
du `.vtt` de façon déterministe, en joignant le texte des cues dans l'ordre par un saut de ligne
(`\n`), après normalisation NFC. Un seul modèle de texte vaut donc pour les trois types de source, et
un seul code de surlignage les traite tous.

De cette dérivation découle une propriété utile : un offset dans le texte canonique se retrouve dans
un cue, donc dans un horodatage. C'est ce qui positionne le lecteur audio ou vidéo sur la citation,
sans que l'item ait à stocker un horodatage par citation.

```
WEBVTT

00:42:10.000 --> 00:42:14.500
Première phrase de l'extrait.

00:42:14.500 --> 00:42:19.000
Seconde phrase de l'extrait.
```

Texte canonique dérivé : `Première phrase de l'extrait.\nSeconde phrase de l'extrait.`

## 3. Copie locale d'une source — `source.chemin_local`

Chemin relatif à la racine du dépôt, vers le document archivé tel quel : le PDF publié, la page HTML
capturée, le fichier audio ou vidéo. Jamais réécrit, jamais reformaté.

L'interface de validation **recalcule le sha256 de ce fichier avant tout affichage** et refuse
d'afficher en cas de divergence avec `source.sha256`. « La source telle qu'archivée » est ainsi une
propriété vérifiée à chaque affichage, pas une promesse tenue par convention.

## 4. Ce que l'interface de validation lit et écrit

| Chemin | Accès | Remarque |
| --- | --- | --- |
| `staging/items/*.json` | lecture seule | |
| `staging/mesures/*.json` | lecture seule | |
| `staging/textes/*.txt` | lecture seule | |
| `staging/transcriptions/*.vtt` | lecture seule | |
| `source.chemin_local` | lecture seule | servi après vérification d'empreinte |
| `validation/lots/*.json` | lecture ; écriture par `pnpm lots` uniquement | manifeste immuable une fois écrit |
| `validation/decisions/<annotateur>/*.jsonl` | ajout en fin de fichier uniquement | jamais de réécriture, jamais de suppression |
| `validation/brouillons/<annotateur>.json` | lecture et écriture | hors dépôt, hors publication |
| `validation/mesures/decisions.json` | lecture ; ajout par `pnpm mesures --ecrire` uniquement | registre publié des corrections de thème, en ajout seul : une entrée n'est jamais modifiée ni retirée, un revirement est une entrée de plus. `pnpm promote` le lit, ne l'écrit jamais |
| `data/` | **aucun** | seul `pnpm promote --ecrire`, lancé par un humain, y écrit |

## 5. Collecte des sources — `config/sources.toml`, `archives/`, `staging/sources/<sha256>.json`

La collecte (`pipeline/collecte`, `pnpm collecte config/sources.toml`) récupère une **liste
explicite** d'URL tenue par l'auteur, sans crawl ni suivi de liens. Pour chaque source, elle
télécharge le document, en copie les octets tels quels dans `archives/`, calcule leur SHA-256,
demande une sauvegarde à la Wayback Machine et écrit un manifeste. §4 du protocole : « la collecte
est horodatée et archivée (copie locale, empreinte SHA-256, sauvegarde Wayback Machine) ».

### 5.1 Liste des sources — `config/sources.toml`

Écrite à la main par l'auteur seul ; aucun script ne l'écrit. Exemple commenté :
`pipeline/collecte/exemples/sources.exemple.toml`. TOML parce que `tomllib` est dans la
bibliothèque standard de Python 3.12 et accepte les commentaires.

```toml
[[source]]
url = "https://example.org/candidat-a/programme-2027.pdf"
candidat_id = "candidat-a"
tier = "T1"
type_document = "programme_pdf"
date_source = 2026-09-01          # date TOML nue : ni guillemets, ni heure
publication = "publique"

[[source]]
url = "https://example.org/parti-b/propositions"
candidat_id = "candidat-b"
tier = "T1"
type_document = "site_parti"
date_source = 2026-08-15
publication = "publique"
site_parti_tient_lieu_de_campagne = true
```

| Champ | Obligatoire | Valeurs |
| --- | --- | --- |
| `url` | oui | URL `http` ou `https` avec un hôte |
| `candidat_id` | oui | `commun#/$defs/identifiant_court` |
| `tier` | oui | `commun#/$defs/tier` : `T1`, `T2`, `T3` |
| `type_document` | oui | énumération de `commun#/$defs/source/properties/type_document` |
| `date_source` | oui | date TOML nue `AAAA-MM-JJ` : date de la source elle-même (§4) |
| `publication` | oui | `publique` ou `interne` (§10, droit d'auteur) |
| `site_parti_tient_lieu_de_campagne` | si et seulement si `type_document = "site_parti"` | `true` ou `false` |

Aucune autre clé n'est admise, ni dans une source ni au premier niveau. Un seul problème (champ
manquant, inconnu, hors énumération, mal typé) **refuse tout le fichier avant le moindre
téléchargement** ; chaque problème est rapporté avec le numéro et l'URL de la source fautive. Aucune
valeur par défaut. Les énumérations sont lues dans `schema/commun.schema.json`, jamais recopiées.

### 5.2 Politesse

Norme du §6, appliquée à toute la collecte : respect de `robots.txt` et au plus une requête par
seconde **par hôte**, mesurée entre deux débuts de requête, `robots.txt` et redirections compris.
User-Agent : `BancEssai2027-collecte/0.1 (+https://github.com/AzurNow/DEMOCRACIE_2027)`.

| `robots.txt` répond | Effet |
| --- | --- |
| 2xx | règles appliquées ; une URL interdite est refusée et consignée, jamais contournée |
| 401 ou 403 | tout l'hôte est interdit |
| autre 4xx (404…) | pas de `robots.txt` : tout est permis |
| 5xx, erreur réseau, délai dépassé, contenu non UTF-8 | **erreur consignée**, jamais une autorisation |

`robots.txt` est lu une fois par origine et par lot ; son résultat, erreur comprise, vaut pour tout
le lot. Les redirections (301, 302, 303, 307, 308) sont suivies une à une, cinq au plus, chaque
étape repassant par la cadence et par le `robots.txt` de sa cible ; une cible hors `http`/`https`
est un échec.

### 5.3 Copie locale — `archives/<sha256[0:2]>/<sha256><extension>`

Hors Git (`.gitignore`). Octets reçus écrits tels quels : ni BOM retiré, ni fins de ligne
converties, ni réencodage ; le SHA-256 porte sur ces octets. L'extension vient d'une table fermée
de `Content-Type` (`pipeline/collecte/archivage.py`) ; un type absent de la table, ou un en-tête
absent, donne `.bin`, et le type reçu reste consigné dans le manifeste. Écriture atomique (fichier
temporaire `.<nom>.*.partiel` dans le même répertoire, puis renommage) : une interruption ne laisse
jamais de fichier partiel sous le nom définitif. Une archive n'est jamais écrasée.

### 5.4 Manifeste de collecte — `staging/sources/<sha256>.json`

Décrit par `schema/collecte.schema.json`. JSON UTF-8, indentation de deux espaces, ordre des clés
fixe, saut de ligne final. **Immuable une fois écrit.**

| Champ | Origine |
| --- | --- |
| `url`, `candidat_id`, `tier`, `type_document`, `site_parti_tient_lieu_de_campagne`, `date_source`, `publication` | repris de la liste des sources |
| `url_finale` | URL qui a servi les octets, après redirections |
| `sha256` | empreinte des octets archivés |
| `chemin_local` | chemin de l'archive, relatif à la racine du dépôt |
| `taille_octets` | nombre d'octets reçus, au moins 1 |
| `type_contenu_recu` | en-tête `Content-Type` tel que reçu, ou `null` s'il manquait |
| `date_collecte` | instant de fin du téléchargement, ISO 8601 avec décalage |
| `archive_url` | instantané daté renvoyé par Save Page Now — **ou** — |
| `echec_archivage` | `{service: "wayback_save_page_now", motif, tentatives}` quand la sauvegarde a échoué |

Exactement un des deux derniers est présent. `archive_url` n'est jamais fabriqué : seule une URL
`/web/<AAAAMMJJhhmmss>/…` renvoyée par le service (en-tête `Location` ou `Content-Location`) en
tient lieu. La sauvegarde est tentée trois fois, espacées de dix secondes ; en cas d'échec, le
manifeste est écrit sans `archive_url`, et une source sans `archive_url` ne peut pas s'afficher
(règle 2 de `CLAUDE.md`).

Ce que le manifeste **ne porte pas** : le texte canonique. `texte_sha256` (§1) sera produit par
l'extraction (sous-lot C2) dans un fichier à part, apparié par le même `sha256` ; le manifeste étant
immuable, il ne peut pas le recevoir après coup.

### 5.5 Cas de collecte

| Situation | Archive | Manifeste | Rapport, code de sortie |
| --- | --- | --- | --- |
| collectée, Wayback en succès | écrite | écrit, avec `archive_url` | « collecté », 0 |
| collectée, Wayback en échec | écrite | écrit, avec `echec_archivage` | « ARCHIVAGE EN ÉCHEC », 1 |
| même SHA-256 déjà manifesté | inchangée | **inchangé** | « déjà collecté », 0 |
| même URL, contenu différent | nouvelle | nouveau ; l'ancien reste | « collecté », 0 |
| HTTP autre que 200 après redirections, délai dépassé, erreur réseau, réponse de 0 octet, `robots.txt` interdit ou injoignable, redirection hors http(s) | aucune | aucun | « ÉCHEC » avec le motif, 1 |
| liste des sources invalide | aucune | aucun | erreurs sur la sortie d'erreur, 2, rien n'est téléchargé |

Un échec n'arrête pas le lot : les sources suivantes sont collectées, et le code de sortie final
est non nul.
