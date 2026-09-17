---
name: cloture-de-session
description: Clôture une session de travail sur le Banc d'essai 2027 en remplissant docs/DETTE.md (ce qui peut casser plus tard à cause de ce qui vient d'être fait) et LESSONS.md (bonnes pratiques payées par l'expérience). À utiliser quand une session ou une tâche substantielle se termine, quand l'utilisateur dit qu'on s'arrête là, que c'est bon, qu'on clôture, ou demande le bilan de session — et avant de proposer un commit de fin de travail.
---

# Clôture de session

Deux fichiers, deux objets différents. `docs/DETTE.md` regarde en avant : ce qui va coûter. `LESSONS.md`
regarde en arrière : ce qu'on ne veut pas réapprendre. Ne pas écrire la même chose dans les deux.

Le travail utile ici est le **tri**, pas la rédaction. Une entrée de dette générique (« il faudrait
plus de tests ») est pire que rien : elle dilue les vraies. Si une session n'a produit aucun risque
réel, écrire qu'il n'y en a pas et passer à autre chose.

## Procédure

1. **Relire le diff de la session**, pas sa mémoire. `git diff` et `git status` ; les fichiers
   ajoutés comptent autant que les modifiés.
2. **Extraire les risques réels.** Pour chaque décision prise, se demander : *qu'est-ce qui casse à
   cause d'elle, et comment le saurait-on ?* Un risque qui ne casse rien n'est pas un risque. Les
   trois questions de tri sont dans `references/tri.md`.
3. **Écrire l'entrée de `docs/DETTE.md`** au gabarit exact de `references/gabarits.md`, en tête du
   fichier, sous le titre. Une session = une entrée datée, même si elle ne contient qu'un point.
4. **Compléter `LESSONS.md`** — seulement si la session a *payé* quelque chose. Une session sans
   surprise n'ajoute aucune leçon, et c'est normal.
5. **Rayer ce qui est réglé.** Si la session a résolu un point de dette antérieur, barrer la ligne
   dans `docs/DETTE.md` et dire par quoi. Un journal qui n'est jamais purgé cesse d'être lu.
6. **Le dire en deux lignes** dans la réponse finale, sans recopier les fichiers.

## Ce qui va dans `docs/DETTE.md`, ce qui n'y va pas

| Va dans la dette | Ne va pas dans la dette |
| --- | --- |
| Une décision dont la facture arrivera plus tard | Un bug ouvert (il a sa place ailleurs) |
| Un invariant qu'aucun test ne garde | Une fonctionnalité pas encore écrite |
| Un couplage assumé mais coûteux | Une précaution générique sans cause identifiée |
| Une convention non écrite dont dépend la justesse d'un calcul | Un trou du **protocole** |

**Les trous du protocole ne sont pas de la dette.** Une ambiguïté ou une contradiction de
`docs/PROTOCOLE.md` se signale à l'auteur et se documente à côté du code concerné, comme candidate à
un amendement (§9). Exemple en place : la fin de `schema/README.md`.

## Gravité

- **haute** — casse silencieuse d'une mesure publiée. Un chiffre devient faux sans qu'aucun test
  n'échoue. C'est la seule catégorie qui justifie de retarder autre chose.
- **moyenne** — casse visible, coûteuse à réparer.
- **basse** — friction, surprise pour un nouvel arrivant.

Dans ce projet, la gravité se juge à une seule aune : *est-ce qu'un lecteur du site pourrait lire un
nombre faux sans que rien ne l'ait signalé ?*

## Critère d'entrée dans `LESSONS.md`

Une leçon n'entre que si elle a été **payée** : une décision tranchée après hésitation, un piège
évité de justesse, une erreur commise. Pas de vérités générales sur le génie logiciel. Le test :
quelqu'un qui n'a pas vécu la session doit pouvoir dire ce qui a failli mal tourner.

Ranger dans les sections existantes du fichier plutôt que d'en créer une nouvelle. Une leçon
formulée à l'impératif et suivie du cas concret qui l'a produite vaut mieux qu'un paragraphe.

## Gabarits et tri

- `references/gabarits.md` — la forme exacte d'une entrée de dette et d'une leçon. À lire avant
  d'écrire.
- `references/tri.md` — les trois questions qui séparent un vrai risque d'une précaution.
