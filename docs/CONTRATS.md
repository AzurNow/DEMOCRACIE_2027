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
