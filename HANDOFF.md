# Passation — 2026-10-17

Pour une personne ou un agent qui reprend le dépôt sans contexte, pendant deux semaines d'absence
de l'auteur. Lire dans l'ordre : `CLAUDE.md` (règles et installation), ce fichier,
`docs/PROTOCOLE.md` (fait autorité sur tout), `docs/feuille-de-route.json` (état qui fait foi).

## Branche de départ

**`wip/handoff-2026-10-17`** = `main` au 2026-10-17 (#155 fusionnée, CI verte) + ce fichier, le
complément de `CLAUDE.md`, `.env.example`, `.nvmrc`, les scripts `dev` et `build`, et des
brouillons jusqu'ici non suivis (`.claude/briefs/*`, `scratch/`). Aucune ligne de code de mesure
n'y a changé.

Chaque lot part d'une branche neuve tirée de `wip/handoff-2026-10-17` et vise `main` dans sa PR.
Tant que la branche de passation n'est pas fusionnée, ses commits apparaissent dans chaque PR ; ils
disparaîtront du diff dès sa fusion. Ne **jamais** baser une PR sur la branche d'une autre PR non
fusionnée (c'est ainsi que #54 a manqué `main`, `LESSONS.md`).

## État actuel

- Protocole en **version 0.18**, pas encore gelé en 1.0. Le jalon J1 (15 octobre) est dépassé :
  les jalons sont repoussables, la qualité passe avant les dates.
- Code livré, de T2 à T3 selon les lots : schémas, interface de validation, collecte et
  archivage, extraction double, questions/tirage/symétrie, interrogation simulée, notation et
  notation humaine, test des liens, analyse §8, contestation/notification, go/no-go, gel, mesures
  validées, reformulation. **Pas encore écrits** : le site statique (T0), `pnpm run:live`,
  `pnpm analyze`, `pnpm build:site`.
- Aucune donnée réelle : `data/`, `staging/`, `site/` n'existent pas dans un clone. Aucun appel
  d'API réel n'a encore été fait.
- Vérifié le 2026-10-17 sur un clone neuf, Node 22.23.3 : `pnpm install --frozen-lockfile`,
  `pnpm check`, `pnpm test` (207 fichiers, 3 711 tests), `pnpm build`, `uv sync --frozen`, ruff,
  `pytest` (607 tests) : tout vert. La CI Linux (ubuntu, Node 22) est verte sur `main` (82c8374).
- Toutes les décisions D1 à D55 sont tranchées ; aucune n'attend l'auteur dans la feuille de route.

## Ce qui était en cours

La revue de code du 2026-10-17 (`docs/revues/2026-10-17.md`) a relevé 44 constats. L'auteur a
tranché le même jour ses 8 décisions (**D54**) et les 11 restées de la revue du 2026-10-12
(**D55**), option recommandée partout. Il restait à **coder les lots de correction**, une petite PR
chacune, en commençant par les gardes de sortie. Le texte au protocole de D54 (2), (4) et
D55 (4), (5), (9) est proposé dans `docs/TACHES-AUTEUR.md` : c'est à l'auteur de l'écrire.

## Prochaines tâches, par priorité

Critères communs à toutes : une PR par lot ; `pnpm check && pnpm test` (et `pnpm check:py &&
pnpm test:py` si du Python bouge) verts en local et en CI ; tests écrits **avant** le correctif
pour toute logique de mesure ; aucun écart aux huit règles ni écriture dans les zones d'arrêt de
`CLAUDE.md` ; colonne « Statut » du constat passée à « corrigé (#PR) » dans
`docs/revues/2026-10-17.md` ; entrée de dette ajoutée à la clôture (`cloture-de-session`).

1. **Lot 1 — gardes de sortie** (constats 6, 32). Acceptation : `pnpm reformuler --simule
   --sortie=data/...` et `pnpm extraire --simule` vers `data/` sont refusés par un refus nommé,
   testé ; un seul `cheminReel` partagé, l'extraction n'importe plus ses gardes d'un module de
   commande.
2. **Lot 4 — petites robustesses** (constats 7, 8, 18, 19, 20, 21, 23, 25, 27, 28 ; D54 (5) et
   (8)). Acceptation, entre autres : l'écran de notation humaine refuse un run invalidé ; relancer
   `run:invalider` sur le même motif répond « déjà inscrite », code 0 ; seul `.DS_Store` est
   ignoré en `staging/formulations/<id>/` (liste fermée en données) ; `run:dry` refuse une option
   inconnue ; chaque cas a son test.
3. **Lot 2 — registres de mesures** (constats 9, 11, 33, 26, puis 1 selon D54 (1)). Acceptation :
   écriture atomique avec contrôle de modification concurrente pour les trois registres, une
   frontière commune, précédence par l'ordre du registre et date contrôlée comme vraie date civile.
4. **Lot 5 — extraction, reprise** (constat 3, puis 2, 4, 17 selon D54 (2), (3), (7)).
   Acceptation : relance après arrêt sans doublon d'items ; 408/429/5xx = échec de transport,
   source reprise ; entrée à l'épinglage périmé refusée ; `model` servi ≠ épinglé ⇒
   `modele_different`.
5. **Lot reformulation** (constat 10 avec D54 (4), constat 5). Acceptation : une seule règle
   « formulation en vigueur » et un test d'accord reprise/relecture ; un état `sans_objet`
   n'affirme aucune position et ne bloque plus `tachesDe`.
6. **Lot 6 — structure du gel et du run** (constats 29, 30, 31, 34).
7. **Lot 7 — documentation** (constats 12 à 16, 35, 37 à 42), dont la description du thème dans
   `schema/commun.schema.json` (D54 (6), texte seul).
8. **Décisions D55 (1) à (10)** : un lot par point ou par groupe cohérent, tests d'abord ; détail
   dans `docs/feuille-de-route.json` (décision D55, champ `options`).
9. **Lot 8** : repris de la revue du 2026-10-12 (liste en fin de section « Lots de correction
   proposés » du rapport du 2026-10-17).

Le diff de `CLAUDE.md` demandé par D55 (11) est en partie fait sur cette branche (commandes
réelles, dossiers manquants) : il reste à dire l'exception `pipeline/` → `analysis/` ; l'auteur
relit et fusionne.

## Ce qu'il ne faut pas faire pendant l'absence

- Écrire dans `data/`, `docs/PROTOCOLE.md`, `prompts/judge-*`, `config/perimetre.yaml` ; changer
  une métrique, un seuil, une règle d'inclusion ; ajouter une dépendance ou un appel réseau ;
  déployer ; lancer un appel d'API réel. Proposer, documenter dans la PR, attendre l'auteur.
- Fusionner sans CI verte. Supprimer une branche autrement que par `git branch -d`.

## Questions ouvertes

1. **Qui fusionne pendant deux semaines ?** Le contrôle de Claude Code de l'auteur refusait
   `gh pr merge`. Sans fusion, les PR s'empilent : les garder petites, indépendantes, toutes
   tirées de la branche de passation.
2. **Brouillons rendus publics.** Le dépôt est public : `scratch/protocole-0.16/`,
   `scratch/prompts/judge-1.0.0*.md` et `scratch/perimetre/` (dossier des candidats, adresses de
   contact de campagne) sont maintenant poussés. À confirmer ou retirer par l'auteur.
3. **Gel du protocole 1.0** (J1) : signature, avocat, Zenodo, transmission aux institutions,
   fournisseur SMTP — tâches de l'auteur seul (`docs/TACHES-AUTEUR.md` §1).
4. **Linux** : vérifié par la CI ubuntu, pas sur une machine Linux interactive. La transcription
   (faster-whisper, 1,6 Go de poids) n'a pas été rejouée sur un clone neuf.

## Façon de travailler (consignes durables de l'auteur)

- Une décision qui revient à l'auteur se pose **complètement** : contexte, options réelles, coût
  de chacune, recommandation en premier. Jamais une demi-ligne.
- La session principale orchestre ; le code de mesure part aux agents `codeur-opus`, le code de
  routine à `codeur-sonnet`, avec un brief autonome d'après `.claude/briefs/GABARIT.md`.
- Qualité avant dates : un code propre et complet vaut mieux qu'un jalon tenu.
- CI obligatoire sur `main`, administrateurs compris.
- Ménage : branches fusionnées et worktrees d'agents supprimés avec `-d`, jamais `-D`.
- Fin de session : compétence `cloture-de-session` (`docs/DETTE.md`, `LESSONS.md`,
  `docs/feuille-de-route.json` puis `pnpm feuille-de-route`).
