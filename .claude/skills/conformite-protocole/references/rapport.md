# Gabarit du rapport — `docs/conformite/AAAA-MM-JJ.md`

Un fichier par passe, jamais réécrit une fois la passe close, sauf la colonne *Statut* que les PR
de correction mettent à jour. La passe suivante le lit en premier.

```markdown
# Conformité au protocole du AAAA-MM-JJ

Commit de départ : `<sha court>`. Protocole : version <x.y>, empreinte `<sha256 court>`.
Passe précédente : [AAAA-MM-JJ](AAAA-MM-JJ.md) (ou « aucune, première passe »).
Périmètre : <tout le protocole | sections réextraites : §4, §9 ; code relu en détail : …>.

## Bilan de la matrice

| Statut | Nombre | Depuis la passe précédente |
| --- | ---: | ---: |
| testee | | |
| sans-test | | |
| contredite | | |
| partielle | | |
| a-implementer | | |
| hors-code | | |
| retiree | | |

<Une ou deux phrases : ce qui a bougé et pourquoi.>

## Constats

| # | Gravité | Sens | Exigence | Où | Constat | Proposition | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | haute | protocole → code | §5.07 | `chemin:fonction` | <une phrase affirmative> | corriger le code | ouvert |
| 2 | haute | code → protocole | — | `chemin:fonction` | <la règle, et le nombre qu'elle change> | réviser le protocole | ouvert |
| 3 | basse | protocole → code | §8.03 | … | … | accepter : <pourquoi> | — |

## Détail des constats hauts et moyens

### 1. <le constat, en une phrase affirmative>

**Le protocole dit** : « <citation exacte> » (§x).
**Le code fait** : <ce qui se passe, fichier et fonction>.
**Ce que ça change** : <le nombre publié ou la décision qui en dépend, et le scénario>.
**Proposition** : <corriger le code : comment ; ou réviser le protocole : texte proposé, entre
guillemets, prêt à être relu par l'auteur>.

## Exigences sans test

<Liste des `sans-test` touchant une mesure, avec le test qui manquerait (son intitulé) — ou
« aucune ».>

## Repris de la passe précédente

<Constats encore ouverts, avec leur date d'origine ; ou « aucun ».>
```

Règles :
- Le titre d'un constat est une **affirmation** (« Le tirage départage les égalités par ordre
  d'identifiant, ce que le §5 n'écrit pas »), pas un thème (« Départage »).
- Les constats sont numérotés par gravité, puis par sens (protocole → code d'abord), puis par
  section.
- *Sens* : `protocole → code` (exigence contredite, partielle ou sans test) ou `code → protocole`
  (règle non écrite, ambiguïté que le code a tranchée).
- *Statut* : `ouvert`, `corrigé dans #NN`, `protocole révisé en <x.y>`, `abandonné : <pourquoi>`,
  `—` pour un constat accepté.
- Un texte de révision proposé est **complet et citable** : l'auteur doit pouvoir l'accepter tel
  quel.
