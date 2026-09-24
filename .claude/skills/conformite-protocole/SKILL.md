---
name: conformite-protocole
description: Passe de conformité entre le code du Banc d'essai 2027 et docs/PROTOCOLE.md, dans les deux sens — chaque exigence du protocole est-elle implémentée et testée, et chaque règle du code qui influe sur une mesure est-elle écrite dans le protocole ? À utiliser quand l'utilisateur demande de vérifier la cohérence du code avec le protocole, un audit de conformité, une traçabilité protocole ↔ code, « refaire la conformité », avant une révision du protocole et obligatoirement avant le gel de la version 1.0. Pas pour la qualité du code (compétence revue-de-code). Produit un rapport daté dans docs/conformite/ et tient à jour la matrice docs/conformite/exigences.json ; ne corrige rien sans accord.
---

# Conformité au protocole

Le protocole fait autorité (CLAUDE.md). Mais rien ne garantit mécaniquement que le code dit la même
chose que lui : les écarts s'accumulent en silence, dans les deux sens. Le code peut **contredire**
une exigence, la **laisser sans test**, ou fixer une règle de mesure que le protocole **n'écrit
pas** — une convention de tirage, un seuil, un paramètre de décodage. Avant le gel, ce dernier sens
est le plus rentable : chaque règle non écrite trouvée est une révision à faire tant qu'elle est
encore gratuite.

La passe est reproductible parce que trois choses sont fixées : la façon d'extraire et de trier
(`references/extraction.md`), la matrice des exigences (`references/matrice.md`, fichier
`docs/conformite/exigences.json`), et la forme du rapport (`references/rapport.md`). Deux
relecteurs, ou un agent dans six mois, doivent aboutir à la même matrice.

Ce que cette passe ne fait pas : juger le protocole (ses choix de méthode appartiennent à
l'auteur), juger la qualité du code (`revue-de-code`), corriger quoi que ce soit.

## Procédure

1. **Partir d'un arbre propre**, sur une branche `qualite/conformite-AAAA-MM-JJ`. Relever le commit
   de départ, la version du protocole (§1) et son empreinte :
   `shasum -a 256 docs/PROTOCOLE.md`. `pnpm check`, `pnpm test`, `pnpm check:py`, `pnpm test:py`
   doivent passer ; sinon, le noter en tête du rapport.
2. **Relire la passe précédente** : le rapport le plus récent de `docs/conformite/` et la matrice.
   S'il n'y en a pas, c'est une **première passe** : aller à l'étape 3 sur tout le protocole.
   Sinon, `git diff <commit de la passe précédente> -- docs/PROTOCOLE.md` donne les sections à
   réextraire, et `git diff --stat <commit> -- ':!docs' ':!data'` le code à relire en détail.
3. **Extraire les exigences** des sections concernées (toutes à la première passe), selon
   `references/extraction.md`. Chaque exigence reçoit un identifiant stable et une citation exacte.
   Une exigence déjà dans la matrice garde son identifiant ; une exigence dont le texte a changé
   est mise à jour et repassée à `a-verifier`.
4. **Tracer chaque exigence** vers le code qui l'applique et le test qui la garde, par `grep` et
   lecture — jamais de mémoire ni d'après une docstring seule. Une docstring qui dit « §5 » n'est
   pas une preuve : lire le code. Attribuer le statut (`references/matrice.md`).
5. **Revérifier le reste de la matrice** : pour chaque exigence non réextraite, confirmer que les
   fichiers et tests cités existent encore et disent toujours la même chose. Un test renommé ou un
   fichier déplacé se met à jour ; un test disparu fait retomber l'exigence en `sans-test`.
6. **Lire dans l'autre sens** : parcourir le code qui produit, filtre, tire, note ou calcule
   (`pipeline/`, `analysis/`, `validation/domaine/`, `outils/promote.ts`, `outils/symmetry.ts`,
   `prompts/`, `schema/`) et relever chaque règle qui change un nombre publié sans être écrite dans
   le protocole (`references/extraction.md`, « Sens inverse »).
7. **Trier** chaque constat (gravité, et proposition : corriger le code, réviser le protocole, ou
   accepter) selon `references/extraction.md`.
8. **Écrire** `docs/conformite/AAAA-MM-JJ.md` au gabarit de `references/rapport.md`, mettre à jour
   `docs/conformite/exigences.json` (version et empreinte du protocole, commit, date), valider la
   matrice (`python3 -m json.tool` au minimum) et soumettre. **Ne rien corriger pendant la passe.**
9. **Après accord**, corriger par petites PR. Une contradiction se règle de deux façons, et le choix
   appartient **toujours** à l'auteur : corriger le code, ou réviser le protocole (avant gel) /
   l'amender (§9, après gel). Mettre à jour le statut des constats et de la matrice dans la PR qui
   corrige.

## Règles de la passe

- **Citer, ne pas paraphraser.** Chaque exigence porte la phrase exacte du protocole qui la fonde.
  Une exigence reformulée finit par dire autre chose que le texte.
- **Une preuve est un fichier et une ligne.** « Implémentée » exige un emplacement de code ;
  « testée » exige un test nommé qui échouerait si l'exigence était violée. Un test qui passe par
  hasard ne compte pas.
- **Absence n'est pas contradiction.** Une exigence d'un lot pas encore écrit (interrogation,
  notation, site) est `a-implementer` avec le lot nommé, pas un constat.
- **Ne jamais trancher un trou du protocole.** Si le protocole est ambigu ou muet sur un point que
  le code a dû fixer, c'est un constat « règle non écrite » ou « protocole ambigu », avec la lecture
  que le code a retenue. La décision revient à l'auteur (CLAUDE.md, « Signale les trous du
  protocole »).
- **Aucune écriture dans `docs/PROTOCOLE.md`, `data/`, `prompts/judge-*`, `config/perimetre.yaml`**
  pendant la passe. Les propositions de texte vont dans le rapport.

## Quand la lancer

- Avant chaque révision ou amendement du protocole : elle dit ce que la révision doit aussi couvrir.
- Après un lot qui touche une règle de mesure (tirage, symétrie, notation, métriques, collecte).
- **Obligatoirement avant le gel de la version 1.0** (jalon J1) : aucune exigence à `contredite`,
  et chaque « règle non écrite » tranchée (écrite dans le protocole ou acceptée par écrit).

## Après la passe

Si la passe a *payé* quelque chose (une contradiction trouvée par un chemin inattendu, une catégorie
d'exigence que l'extraction ratait), l'ajouter à `LESSONS.md` et, si c'est une règle d'extraction, à
`references/extraction.md`.
