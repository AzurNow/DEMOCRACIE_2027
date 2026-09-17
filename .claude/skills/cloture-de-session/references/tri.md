# Trier : risque réel ou précaution ?

Trois questions. Un point qui ne passe pas les trois n'entre pas dans `docs/DETTE.md`.

## 1. Quel est le scénario de casse, en une phrase concrète ?

Il faut pouvoir écrire *quand X arrive, Y devient faux*. Si la réponse est « ça pourrait poser
problème », ce n'est pas un risque identifié, c'est un malaise. Le garder pour soi ou aller le
vérifier.

- Non : « la validation des schémas pourrait être insuffisante ».
- Oui : « si `grappe_id` ne pointe pas l'item principal, le bootstrap groupe mal et tous les
  intervalles de confiance publiés sont faux ».

## 2. Est-ce que ça vient de **cette** session ?

La dette recense ce que *ce travail* a introduit ou aggravé. Une faiblesse préexistante qu'on n'a
pas touchée appartient à l'entrée de la session qui l'a créée, ou à personne.

Cas limite : une décision prise cette session qui rend visible un problème plus ancien. Elle entre,
en le disant — c'est cette session qui a rendu la facture exigible.

## 3. Comment saurait-on que c'est arrivé ?

C'est la question qui donne la gravité.

- Aucun test, aucune alerte, aucun symptôme visible → **haute**. Le projet publie des nombres ; une
  erreur muette dans une mesure est le pire cas possible.
- Un test échoue, un build casse, quelqu'un s'en aperçoit à la lecture → **moyenne**.
- On s'en aperçoit tout de suite, ça coûte du temps → **basse**.

## Les faux positifs fréquents

| Ce qu'on est tenté d'écrire | Ce que c'est vraiment |
| --- | --- |
| « Il faudrait plus de tests » | Un vœu. Nommer le test manquant et l'invariant qu'il garde, sinon rien. |
| « Cette dépendance pourrait devenir obsolète » | Une généralité vraie de toute dépendance. |
| « Le code n'est pas optimisé » | Pas de la dette tant qu'aucune contrainte n'est atteinte. |
| « Le protocole est ambigu sur ce point » | Un trou de protocole, à signaler à l'auteur, pas à mettre en dette. |
| « Il reste la fonctionnalité Z à écrire » | Un reste à faire, pas une facture différée. |

## Le cas du silence

Si aucun point ne passe les trois questions, écrire l'entrée quand même, d'une ligne :

```markdown
## AAAA-MM-JJ — <ce qui a été fait> (`<chemin/>`)

Aucun risque identifié : <pourquoi, en une phrase>.
```

Un journal qui saute les sessions calmes ne se distingue plus d'un journal oublié.
