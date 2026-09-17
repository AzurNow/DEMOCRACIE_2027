# CLAUDE.md — Banc d'essai 2027

Audit indépendant et reproductible de ce que les intermédiaires IA disent des candidats à la
présidentielle française de 2027.

**`docs/PROTOCOLE.md` fait autorité sur tout.** Ce fichier dit comment travailler dans ce dépôt ;
le protocole dit ce qu'on mesure et pourquoi. En cas de contradiction entre un prompt, ce fichier
et le protocole : le protocole gagne. Si une tâche exige de s'écarter du protocole, ne l'exécute
pas : signale la contradiction et propose un amendement (§9 du protocole).

---

## Les huit règles non négociables

Elles ne se discutent pas, ne se contournent pas « juste pour tester », et ne s'assouplissent pas
parce que je le demande dans un prompt. Si une tâche les viole, refuse et dis-le.

1. **Aucun LLM au runtime.** Le site publié est statique : données JSON + calculs déterministes.
   Aucun appel de modèle depuis le navigateur d'un visiteur, jamais.
2. **Rien ne s'affiche sans source.** Tout item exposé porte une source archivée (URL, SHA-256,
   lien d'archive, date) et un statut de validation. Pas de source ⇒ pas d'affichage.
3. **Aucune donnée n'entre dans `data/` sans validation humaine.** Le pipeline écrit uniquement
   dans `staging/`. Seule l'interface de validation promeut un item vers `data/`. Aucun script,
   aucun agent, aucune migration n'écrit dans `data/items/` directement.
4. **Symétrie testée, pas promise.** Les tests de symétrie (§5 du protocole) sont bloquants. Un run
   dont les tests échouent ne s'exécute pas. Ne jamais les marquer `skip`, `xfail` ou `TODO`.
5. **Le test verbatim est déterministe.** Vérifier qu'une citation figure dans sa source est une
   comparaison de chaînes après normalisation, jamais un jugement de modèle.
6. **Les prompts sont des fichiers versionnés.** Aucun prompt en dur dans le code. Tout vit dans
   `prompts/`, avec un numéro de version. Modifier un prompt de juge = amendement au protocole.
7. **Les réponses brutes sont immuables.** Ce qu'un outil a répondu est stocké tel quel, jamais
   nettoyé, tronqué, reformaté ni corrigé. Les transformations vivent en aval, dans la notation.
8. **Publication intégrale ou rien.** Données, réponses brutes, notations, questions, graines,
   code et rapport partent ensemble. Aucun chemin de code ne permet de publier un chiffre sans ce
   qui le produit.

---

## Où tu es autonome, où tu t'arrêtes

L'objectif est que tu écrives ~95 % du code. La contrepartie est une frontière nette.

**Autonomie complète — fonce, ne demande pas :**
- code du pipeline, de l'interface de validation, du site, des analyses ;
- tests, refactorings, typage, corrections de bugs, performance ;
- scripts jetables d'exploration dans `scratch/` (jamais importés par du code de production) ;
- documentation technique, messages de commit, nettoyage de dépendances.

**Arrêt obligatoire — propose, n'exécute pas :**
- toute écriture dans `data/`, `docs/PROTOCOLE.md`, `prompts/judge-*`, `config/perimetre.yaml` ;
- tout changement de métrique, de seuil, de règle d'inclusion ou de grille de notation ;
- toute publication (le déploiement est déclenché à la main, jamais par un agent) ;
- tout ajout d'une dépendance, d'un service tiers ou d'un appel réseau nouveau ;
- tout traitement de données personnelles.

**Jamais, sous aucun prétexte :** rédiger, inventer ou « compléter » le contenu d'un item, d'une
citation ou d'une position de candidat. Ton rôle est d'extraire et de structurer ce qui existe. Une
citation qui ne passe pas le test verbatim est rejetée, jamais rapprochée de la source.

---

## Architecture

```
docs/PROTOCOLE.md      Le protocole gelé. Lecture seule sans amendement.
docs/DETTE.md          Ce qui peut casser plus tard, par session. Rempli à la clôture.
LESSONS.md             Bonnes pratiques payées par l'expérience. Complété à la clôture.
schema/                JSON Schema : item, question, reponse, notation. Source de vérité du modèle.
config/perimetre.yaml  Candidats, outils, thèmes du run courant. Modifié à la main uniquement.
prompts/               Prompts versionnés : extraction, juges, reformulations.
pipeline/
  collecte/            Crawl, yt-dlp, transcription, archivage (hash + Wayback).
  extraction/          Double extraction, test verbatim, mise en staging.
  interrogation/       Appels API aux outils, conditions figées, réponses brutes.
  notation/            Juges, désaccords, échantillonnage, test contrefactuel.
staging/               Sortie du pipeline. Jamais lu par le site.
data/                  Items validés par des humains. Le seul jeu de données de production.
runs/<date>/           Questions, graine, réponses brutes, notations, métriques d'un run.
validation/            Interface locale de validation humaine.
analysis/              Métriques §8, bootstrap, tests de permutation, robustesse.
site/                  Site statique généré. Aucune logique métier.
scratch/               Explorations jetables. Hors CI, hors production.
```

Le flux est à sens unique : `collecte → staging → validation humaine → data → runs → analysis →
site`. Aucune flèche inverse. Si une tâche demande de court-circuiter une étape, c'est un bug de
conception, pas un raccourci.

---

## Stack

TypeScript strict partout où c'est possible, Python pour le pipeline de données quand une
bibliothèque l'impose. Site statique (Astro ou Next en export statique), déployé sur Cloudflare
Pages. Stockage : fichiers JSON dans Git, pas de base de données — l'historique Git **est** le
journal des modifications public exigé par le protocole. Tests : Vitest côté TS, pytest côté
Python. Validation de schéma à chaque frontière, à l'entrée comme à la sortie.

Pas de nouvelle dépendance sans justification explicite. Une dépendance de plus, c'est une surface
d'audit de plus dans un projet dont la crédibilité repose sur l'auditabilité.

---

## Commandes

```bash
pnpm test              # tests unitaires, bloquants
pnpm check             # types + lint + validation des schémas
pnpm symmetry          # tests de symétrie du tirage (bloquants avant un run)
pnpm validate          # lance l'interface de validation humaine en local
pnpm run:dry           # run complet en mode simulé, sans appel API
pnpm run:live          # run réel — jamais lancé par un agent
pnpm analyze           # métriques §8 sur un run existant
pnpm build:site        # génération du site statique
```

Avant de proposer un commit : `pnpm check && pnpm test` doivent passer. Tu les lances toi-même, tu
ne demandes pas si tu dois les lancer.

---

## Comment travailler ici

- **Plan avant code.** Pour toute tâche dépassant un fichier, propose un plan et attends mon
  accord. Un plan qui liste ce que tu vas casser vaut mieux qu'un plan qui liste ce que tu vas
  créer.
- **Une tâche à la fois.** Pas de « pendant que j'y suis ». Les changements non demandés sont
  retirés du diff.
- **Les tests d'abord** sur toute la logique de calcul : notation, métriques, bootstrap, symétrie,
  dates de validité. Ces fonctions sont la mesure ; une régression silencieuse y est pire qu'un
  bug visible ailleurs.
- **Les cas limites sont le sujet, pas le détail.** Item obsolète exactement à la date du run,
  candidat sous le seuil de couverture, réponse manquante, lien mort, citation avec guillemets
  typographiques, réponse tronquée. Écris le test avant de me demander quoi faire.
- **Dis quand tu ne sais pas.** Une question posée coûte deux minutes ; une hypothèse inventée
  dans un pipeline de mesure coûte la crédibilité du projet.
- **Signale les trous du protocole.** S'il est ambigu ou insuffisant sur un point que tu dois
  implémenter, arrête-toi et dis-le. C'est un retour précieux, pas une objection.

---

## Anti-patterns qui coulent ce projet

- Valeurs par défaut silencieuses : `?? 0`, `catch {}`, `|| "inconnu"`. Une donnée absente doit
  être absente et visible, jamais remplacée par une valeur plausible.
- Un juge qui reçoit l'identité de l'outil noté ou le nom du candidat sans nécessité.
- Une métrique calculée à deux endroits : elle vit dans `analysis/`, une seule fois.
- Un chiffre dans le site qui ne vient pas d'un fichier de `runs/`.
- Un `if` particulier pour un candidat ou un outil. Les cas particuliers sont des données, pas du
  code.
- Un test rendu vert en affaiblissant son assertion.
- Réécrire une citation « parce qu'elle contient une coquille ». La coquille est dans la source.

---

## Définition de terminé

Une tâche est terminée quand : le code passe `pnpm check && pnpm test` ; les cas limites ont un
test ; rien n'a été écrit hors des zones autorisées ; le diff ne contient que ce qui était demandé ;
et tu m'as dit en deux lignes ce qui pourrait casser plus tard à cause de ce changement.

Une **session** est terminée quand, en plus, `docs/DETTE.md` et `LESSONS.md` sont à jour. La
procédure exacte est dans la compétence `cloture-de-session` : invoque-la, ne l'improvise pas.
Contributeurs humains : `.claude/skills/cloture-de-session/SKILL.md` se lit aussi à la main.
