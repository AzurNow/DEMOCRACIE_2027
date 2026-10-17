# Brief — Gel, PR 4 : `pnpm run:dry` depuis un run gelé, écriture de `en_cours` (D51 (1))

## Agent

`codeur-opus`, isolation `worktree`, branche `lots/gel-run-dry` créée depuis `main` (49a0577 ou plus
récent).

## Objectif

Que `pnpm run:dry --run=<répertoire>` interroge en simulé un run produit par `pnpm geler --sortie`
— périmètre, fenêtre, identifiant et questions lus du gel, empreintes vérifiées — et écrive
`statut: en_cours` dans son `run.json` avant la première tentative ; le mode actuel sans `--run`
(fixtures) reste tel quel.

## Contexte que tu ne peux pas deviner

Dernière PR du lot `gel`. Les PR 1 à 3 sont fusionnées : `pnpm geler` (`pipeline/gel/`) écrit
`run.json`, `tirage.json`, `questions.json`, `balise/`, `engagement/` au statut `planifie` ;
`pipeline/run/statut.ts` fournit `demarrer` (pure, `planifie ⇒ en_cours`, refuse tout autre statut
et un run qui porte une `invalidation`) ; `pipeline/run/ecriture.ts:ecrireParRenommage` écrit un
`run.json` par temporaire exclusif synchronisé puis renommé.

Décision **D51 (1)** de l'auteur (2026-10-16) : « `en_cours` écrit par l'interrogation avant la
première tentative ». Personne ne l'écrit encore ; c'est l'objet de cette PR. `run:live` n'existe
pas et n'est pas à créer.

Plan validé par l'auteur le 2026-10-16 :

1. **Entrée.** `--run=<répertoire>` (et `--run <répertoire>`) désigne un run gelé. Un répertoire sous
   `runs/` du dépôt est refusé avant toute lecture ou écriture (réutilise
   `pipeline/notation/garde-simule.ts:exigerHorsDeRuns`) : un run simulé n'est jamais un vrai run.
   Les réponses et tentatives s'écrivent dans `<répertoire>/volume/…`, disposition de
   `runs/README.md` (le répertoire gelé par `--sortie` est déjà `<sortie>/<date>/` : vérifie ce que
   `pipeline/gel/destination.ts` produit et aligne `dispositionRun` dessus, sans dupliquer la date).
2. **Intégrité d'abord.** Lire `run.json` (validé contre `schema/run.schema.json`), puis vérifier
   les octets de `tirage.json` et de `questions.json` contre les SHA-256 que `run.json` déclare
   (`tirage.sha256`, `questions.sha256`). **Réutilise** la vérification de `pipeline/gel/precedent.ts`
   (`runDeRuns`, `cheminDuTirage`, `cheminDesQuestions`, `tiragePrecedentVerifie` ou ce qu'elle
   appelle) : factorise-la dans un module partagé si besoin, n'en écris pas une seconde. Tout écart :
   refus nommé, rien n'est écrit (ni `run.json`, ni `volume/`).
3. **Plan depuis le gel, plus depuis les fixtures.** Outils interrogés, modes, `modele_demande`,
   alias aveugles : `run.json#/perimetre/outils` ; fenêtre : `run.json#/fenetre` ; `run_id` :
   `run.json#/id` ; questions : celles des entrées de `tirage.json`, prises dans `questions.json`
   (avec leurs formulations). Vérifie dans `schema/tirage.schema.json` (`$defs/entree_tirage`) et
   `pipeline/questions/tirage.ts` comment une entrée désigne sa question. Seuls restent en fixture
   les profils de l'éditeur simulé et la clé d'API fictive (un run réel ne les porte pas) : un
   fichier dédié sous `tests/interrogation/fixtures/`, profils indexés par `outil_id` ; un outil
   interrogé sans profil ⇒ refus nommé, jamais de profil par défaut.
4. **`en_cours`.** Après la vérification et la construction du plan, avant la première tentative :
   `demarrer(run)`, validation au schéma, `ecrireParRenommage`. **Reprise** : un run déjà `en_cours`
   reprend sans nouvelle transition ni réécriture de `run.json` (le dépôt de réponses sait déjà
   reprendre). `publie`, `publie_provisoire`, `invalide`, ou un run qui porte une `invalidation` :
   refus nommé (celui de `demarrer` convient), rien n'est écrit.
5. **Le mode sans `--run` ne bouge pas** : fixtures `tests/interrogation/fixtures/run-simule/`,
   répertoire temporaire ou `--sortie`. `--run` et `--sortie` ensemble : refus nommé.

## Fichiers

- À lire d'abord : `CLAUDE.md`, `outils/run-dry.ts`, `pipeline/interrogation/run-simule.ts`,
  `pipeline/interrogation/stockage.ts` (`dispositionRun`, `DepotReponses`), `executer.ts`, `plan.ts`,
  `pipeline/run/statut.ts`, `pipeline/run/ecriture.ts`, `pipeline/run/invalidation.ts` (modèle
  lecture-transition-écriture), `pipeline/gel/precedent.ts`, `pipeline/gel/destination.ts`,
  `pipeline/questions/charger-perimetre.ts` (`OutilDeRun`), `schema/run.schema.json`,
  `schema/tirage.schema.json`, `tests/gel/fixtures.ts` et `tests/gel/jeux.ts` (geler un jeu nominal
  sur fixtures, ports réseau simulés `tests/gel/reseau-fixture.ts`), `tests/interrogation/`,
  `runs/README.md`.
- À créer : le lecteur du run gelé pour l'interrogation (par ex. `pipeline/interrogation/run-gele.ts`),
  la fixture des profils simulés, des tests sous `tests/interrogation/` (bout en bout : geler un jeu
  nominal vers un répertoire temporaire, puis `run:dry --run`).
- À modifier : `outils/run-dry.ts`, `pipeline/interrogation/run-simule.ts` (partager ce qui est
  commun aux deux modes, sans dupliquer), `pipeline/gel/precedent.ts` si tu factorises la
  vérification, `runs/README.md` (section `run:dry` : les deux modes, `en_cours`),
  `docs/feuille-de-route.json` (note du lot `gel` : PR 4 livrée ; puis `pnpm feuille-de-route`).
- À ne pas toucher : `data/`, `docs/PROTOCOLE.md`, `prompts/`, `config/perimetre.yaml`,
  `config/gel.json`, `runs/` du dépôt, `schema/` (aucun changement de schéma n'est prévu : si tu en
  crois un nécessaire, arrête-toi sur ce point et dis-le), la logique de notation et de go/no-go.

## Contraintes du protocole applicables

- §6 : « aucune tentative ne part hors de la fenêtre » ; la fenêtre est celle du gel, parcourue en
  temps virtuel comme aujourd'hui.
- Règle 3 : rien n'écrit dans `data/`. Règle 7 : les réponses brutes sont écrites une fois, jamais
  réécrites ; `run.json` n'est réécrit que par la transition `planifie ⇒ en_cours`, une seule fois.
- Règle 8 et « Un chiffre dans le site qui ne vient pas d'un fichier de `runs/` » : un run simulé
  n'écrit jamais sous `runs/`.
- Aucune valeur par défaut silencieuse (`?? 0`, `catch {}`, profil par défaut, alias inventé).
- Aucun `if` propre à un outil ou à un candidat. Complexité : cyclomatique ≤ 9, cognitive < 15 ;
  compétence `complexite-maitrisee`. Validation de schéma à chaque frontière.

## Cas limites à tester

1. Bout en bout : jeu nominal gelé vers un temporaire, `run:dry --run` ⇒ `run.json` au statut
   `en_cours`, valide au schéma, seul `statut` a changé (comparaison champ à champ) ; réponses
   valides au schéma, `run_id` = `run.json#/id` ; une réponse par (outil, mode, question tirée,
   formulation, échantillon) prévue par le plan.
2. Seules les questions des entrées du tirage sont interrogées : une question présente dans
   `questions.json` mais non tirée n'apparaît dans aucune requête.
3. Entrée du tirage absente de `questions.json` ⇒ refus nommé, rien d'écrit.
4. `tirage.json` modifié d'un octet ⇒ refus nommé ; idem `questions.json` ; `run.json` intact
   (octets identiques), `volume/` absent.
5. `run.json` invalide au schéma ⇒ refus à la frontière.
6. Statut `publie`, `publie_provisoire`, `invalide` ; `planifie` portant une `invalidation` (posée
   par `invaliderRun`) ⇒ refus nommé, rien d'écrit, octets de `run.json` identiques.
7. Reprise : interrompre (ou relancer) sur un run déjà `en_cours` ⇒ pas de nouvelle transition,
   `run.json` octets identiques, réponses déjà écrites non réécrites (`deja_ecrites` > 0).
8. `--run` sous `runs/` du dépôt ⇒ refus avant toute lecture ; `--run` sans valeur ; `--run` vers un
   répertoire sans `run.json` ; `--run` et `--sortie` ensemble ⇒ refus nommés.
9. Outil interrogé du périmètre gelé sans profil simulé ⇒ refus nommé, rien d'écrit (ni
   `run.json`, ni `volume/`).
10. Un temporaire `run.json.<suffixe>` laissé par une écriture interrompue ⇒ échec nommé, pas
    d'écrasement (comportement de `ecrireParRenommage`, à vérifier dans ce chemin).
11. Non-régression : `pnpm run:dry` sans `--run` donne le même bilan qu'avant (mêmes fixtures).

## Ce qui ne doit pas bouger

- `pnpm run:dry` sans `--run`, `pnpm symmetry`, `pnpm geler`, `pnpm notation:dry`,
  `pnpm run:invalider` : comportements inchangés.
- Le choix du précédent par `precedent.ts` : si tu factorises, ses tests passent sans changement.
- Aucune assertion affaiblie ; `git diff` filtré sur `expect` : ajouts seulement, sinon justifiés.

## Définition de terminé

- `pnpm check && pnpm test`, `pnpm run:dry` et `pnpm notation:dry` passent, lancés par toi
  (binaires de `/Users/azur_now/Code/PROJETS_CODE/DEMOCRACIE_2027/node_modules/.bin` dans le PATH,
  aucun lien symbolique créé).
- Chaque cas limite a un test nommé. Aucune dépendance ajoutée. Aucun appel réseau, y compris en
  test (ports simulés du gel).
- Un commit sur `lots/gel-run-dry`, en français, terminé par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ne pousse pas, n'ouvre pas de PR.
- Rapport : fait, écarts et pourquoi, trous du protocole, deux lignes sur ce qui pourrait casser,
  SHA du commit.

## Questions déjà tranchées

- D51 (1) : c'est l'interrogation qui écrit `en_cours`, pas une commande `run:demarrer`.
- Reprise d'un run `en_cours` : admise, sans transition (c'est « avant la première tentative » qui
  compte, et elle a déjà eu lieu).
- Le mode fixtures sans `--run` est conservé (CI, démonstration).
- Pas de `run:live`, pas d'adaptateur d'éditeur réel, pas d'écriture des statuts `invalide`,
  `publie`, `publie_provisoire`.
- Si le protocole ou un schéma contredit ce brief : arrête-toi sur ce point, dis-le, continue le reste.
