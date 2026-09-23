# Gabarit du rapport — `docs/revues/AAAA-MM-JJ.md`

Un fichier par passe, jamais réécrit une fois la passe close, sauf la colonne *Statut* que les PR de
correction mettent à jour. La revue suivante le lit en premier.

```markdown
# Revue de code du AAAA-MM-JJ

Commit de départ : `<sha court>`. Revue précédente : [AAAA-MM-JJ](AAAA-MM-JJ.md) (ou « aucune »).
Relecture : production entière, tests par l'axe 4.

## Signaux

<tableau des comptes copié de `pnpm proprete`, et une ligne de tendance par rapport à la revue
précédente : ce qui a baissé, ce qui a monté, pourquoi.>

## Constats

| # | Gravité | Axe | Où | Constat | Décision | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | haute | robustesse | `chemin:ligne` | <une phrase affirmative : ce qui ne va pas et ce que ça coûte> | corriger | ouvert |
| 2 | basse | lisibilité | `chemin` | … | accepter : <pourquoi> | — |

## Détail des constats hauts et moyens

### 1. <le constat, en une phrase affirmative>

<Ce qui est en cause, le scénario où ça coûte, la correction proposée. Quatre à huit lignes.>

## Lots de correction proposés

1. <axe ou module> — constats 1, 4, 7. Une PR.
2. …

## Repris de la revue précédente

<constats encore ouverts, avec leur date d'origine ; ou « aucun ».>
```

Règles :
- Le titre d'un constat est une **affirmation** (« Une erreur réseau s'affiche comme “aucune
  décision à annuler” »), pas un thème (« Gestion des erreurs »).
- Les constats sont numérotés dans l'ordre de gravité, puis d'axe.
- *Statut* : `ouvert`, `corrigé dans #NN`, `abandonné : <pourquoi>`, `—` pour un constat accepté.
