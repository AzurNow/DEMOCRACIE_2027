---
name: revue-de-code
description: Passe complète de robustesse et de propreté sur le code du Banc d'essai 2027, reproductible d'une fois sur l'autre. À utiliser quand l'utilisateur demande une revue du code, une passe de qualité, de maintenabilité ou de lisibilité, un audit de propreté, ou « refaire la revue » — pas pour relire un diff isolé. Produit un rapport daté dans docs/revues/, trié par gravité, qui repart du rapport précédent ; ne corrige rien sans accord.
---

# Revue de code

Le but est un code qu'un relecteur tiers lit d'une traite et qu'on maintient des années : simple,
sûr aux frontières, sans surprise. **Lisible veut dire simple, pas commenté.** Un commentaire qui
paraphrase le code est un défaut ; un commentaire qui dit *pourquoi* ce n'est pas fait autrement
est une qualité.

La revue est reproductible parce que trois choses sont fixées : la grille (`references/grille.md`),
le tri (`references/tri.md`) et la forme du rapport (`references/rapport.md`). Deux relecteurs, ou
un agent dans six mois, doivent trouver la même chose.

## Procédure

1. **Partir d'un arbre propre**, sur une branche `qualite/revue-AAAA-MM-JJ`. `pnpm check`,
   `pnpm test`, `pnpm check:py` et `pnpm test:py` doivent déjà passer ; sinon, le noter en tête du
   rapport comme constat.
2. **Relire le rapport précédent** (`docs/revues/`, le plus récent). Ce qui y est marqué *accepté*
   n'est pas re-signalé, sauf si le code a changé depuis ; ce qui est *à corriger* et ne l'a pas été
   est repris tel quel, avec sa date d'origine.
3. **Relever les signaux** : `pnpm proprete` (et `pnpm proprete --tout` pour les tests). Copier le
   tableau des comptes dans le rapport. Les signaux ne sont pas des constats : ils disent où lire.
4. **Lire tout le code de production**, module par module, avec la grille. Les signaux orientent la
   lecture, ils ne la remplacent pas : les défauts qui comptent (une règle définie deux fois, une
   frontière non validée) n'ont pas de signal.
5. **Lire les tests plus vite** : l'axe 4 de la grille seulement, plus les signaux `--tout`.
6. **Trier chaque constat** avec `references/tri.md` : gravité, et « corriger » ou « accepter ».
7. **Écrire le rapport** `docs/revues/AAAA-MM-JJ.md` au gabarit de `references/rapport.md`, et le
   soumettre. **Ne rien corriger pendant la passe** : l'auteur choisit ce qu'on corrige.
8. **Corriger par petites PR**, une par axe ou par module, après accord. Chaque PR garde `pnpm check
   && pnpm test` vert et ne change aucun comportement observable. Mettre à jour le statut des
   constats dans le rapport (`corrigé dans #NN`).

## Ce qu'une correction de revue ne fait jamais

- Changer une métrique, un seuil, un schéma, un contrat, un prompt ou une règle d'inclusion : ce
  sont des décisions de l'auteur (CLAUDE.md, « Arrêt obligatoire »). Le constat est rapporté, la
  décision proposée.
- Rendre un test vert en affaiblissant son assertion, ou relever un seuil de lint.
- Mélanger deux axes dans une PR. Une PR de revue se relit en dix minutes ou elle est trop grosse.
- Découper une fonction sans la compétence `complexite-maitrisee`.

## Après la passe

Si la revue a *payé* quelque chose (un défaut réel trouvé par un chemin inattendu, une règle de
grille qui manquait), l'ajouter à `LESSONS.md` et, si c'est une règle, à `references/grille.md` :
la grille s'enrichit de ce que chaque revue a appris. Un signal que `pnpm proprete` aurait pu
relever mécaniquement mérite d'y être ajouté, avec son test.
