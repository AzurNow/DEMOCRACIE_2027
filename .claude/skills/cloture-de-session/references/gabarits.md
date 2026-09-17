# Gabarits

## Entrée de `docs/DETTE.md`

Une session = une entrée, insérée **en tête** du journal, juste après l'en-tête du fichier. Date au
format `AAAA-MM-JJ`, suivie de ce qui a été touché et de son chemin.

```markdown
## AAAA-MM-JJ — <ce qui a été fait> (`<chemin/>`)

### 1. <Le risque, en une phrase affirmative> — *haute | moyenne | basse*

<Ce qui est en cause. Deux à quatre lignes. Nommer les fichiers, les champs, les fonctions.>

**Pourquoi ça casse.** <Le scénario concret. Pas « risque d'incohérence » mais « une divergence sur
X fausse Y et personne ne le voit ».>

**Ce qu'il faut faire.** <L'action, et qui la décide si ce n'est pas l'agent.>
```

Le titre du point est une **affirmation**, pas un thème. « Les invariants inter-fichiers ne sont
vérifiés par personne » plutôt que « Validation ».

Quand un point est réglé, le barrer sur place et dire par quoi :

```markdown
### ~~2. <Le risque>~~ — réglé le AAAA-MM-JJ par <ce qui l'a réglé>
```

## Entrée de `LESSONS.md`

Une leçon tient en un paragraphe : un titre en gras à l'impératif, puis le cas concret qui l'a
produite.

```markdown
**<Règle à l'impératif, une ligne.>** <Le cas qui l'a payée : ce qui s'est passé, ce que ça aurait
coûté. Deux à quatre lignes. Citer le fichier ou l'exemple réel.>
```

Se ranger dans une section existante (*Modélisation des données*, *Tests*, *Outillage*, *Méthode*).
Créer une section seulement quand trois leçons au moins la peuplent.

## Exemples réels, à imiter

Dette, gravité haute, tirée de la session du 2026-09-17 :

> ### 1. Les invariants inter-fichiers ne sont vérifiés par personne — *haute*
>
> JSON Schema valide un fichier à la fois. Quatre cohérences essentielles échappent aux schémas :
> `question.grappe_id` doit être l'item `principal`, `notation.contexte` doit valoir celui de l'objet
> noté, tout item `F` doit pointer une mesure `fictive`, les deux validations d'un item doivent porter
> sur la même version.
>
> **Pourquoi ça casse.** Une divergence sur `grappe_id` fausse les grappes du bootstrap (§8) et donc
> tous les intervalles de confiance publiés, sans qu'aucune validation n'échoue.
>
> **Ce qu'il faut faire.** En faire des tests bloquants avec les tests de symétrie.

Leçon, section *Tests* :

> **Vérifier qu'un test échoue pour la bonne raison.** Un exemple invalide peut passer au rouge par
> accident (une virgule, un champ oublié) et sembler valider une règle qu'il n'atteint jamais. Lister
> **toutes** les erreurs de validation, pas seulement la première : sur `notation/invalide-02`, la
> règle visée ne produisait que la deuxième erreur du lot.
