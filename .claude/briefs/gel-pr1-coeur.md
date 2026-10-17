# Brief — lot gel, PR 1 : cœur de `pnpm geler`, sur fixtures

## Agent

`codeur-opus`, isolation `worktree`, branche `lots/gel-coeur` à partir de `main`.

## Objectif

Une commande `pnpm geler` qui écrit, en une fois et tout ou rien, `run.json`, `tirage.json` et
`questions.json` d'un run dans un répertoire de sortie, à partir de `data/`, `config/` et du commit
courant, au statut `planifie`, et qui refuse d'écrire si la barrière de symétrie n'est pas verte.

## Contexte que tu ne peux pas deviner

- **`docs/PROTOCOLE.md` fait autorité** (0.16). Lis le §5 (gabarits, formulations, tirage, symétrie),
  le §6 (fenêtre) et le §9 (versions). `CLAUDE.md` à la racine : huit règles non négociables.
- **D41** (`docs/feuille-de-route.json`, décisions) : seul l'auteur gèle un vrai run. Un agent ou un
  test ne gèle que vers un répertoire temporaire. Le gel refuse un dépôt sale (`git status
  --porcelain` non vide, fichiers non suivis compris, sauf ce que `.gitignore` exclut), inscrit
  `versions.code_commit` et `versions.donnees_commit` (HEAD ; `data/` est dans le même dépôt),
  et refuse un répertoire `runs/<date>/` qui existe déjà : un gel s'invalide, il ne se refait pas.
- **D38** : les mesures validées vivent dans `data/mesures/`, un fichier par mesure, version
  courante ; `data/items/` de même. **D39, D42, D43** : les formulations relues vivent dans
  `data/formulations/<question_id>.json` ; `pipeline/reformulation/lecture-au-gel.ts:questionsAuGel`
  assemble les questions conformes au schéma ou lève `FormulationsEnDefautAuGel`.
- **D44** (tranchée le 2026-10-15) : `engendree_le` de chaque question **vaut `date_gel`**, pour que
  deux gels du même commit donnent des fichiers identiques octet pour octet. Les graines viennent
  d'une balise drand (D40), mais **pas dans cette PR** : ici les cinq graines arrivent par un port
  (interface `SourceDeGraines` ou nom équivalent) ; l'adaptateur réel est la PR 2. Fournis un
  adaptateur de test qui rend cinq graines fixes ; la commande CLI, faute d'adaptateur réel, exige
  `--graines-fixes=<fichier JSON>` et inscrit dans `run.json` rien qui prétende venir d'une balise.
  Si le schéma `run` exige un champ de provenance de graine, arrête-toi et dis-le.
- Disposition de `runs/<date>/` : `runs/README.md`. `<date>` = date de `date_gel` à Paris
  (`pipeline/interrogation/heure-paris.ts:dateParis`). **Écart à régler** : le README annonce
  `mesures.json` (tableau), mais depuis D38 `pnpm symmetry --mesures` lit un répertoire. Le gel ne
  copie pas les mesures : elles sont dans `data/mesures/` au commit `donnees_commit`, comme les
  items. Mets le README à jour en ce sens.
- La barrière existe déjà : `outils/symmetry.ts` (lis tout son en-tête), `pipeline/questions/symetrie.ts`,
  `completude.ts`, `invariants.ts`, `outils/items-au-gel.ts`. Le gel **appelle les mêmes fonctions**
  que `pnpm symmetry` ; il ne réécrit aucun contrôle. Factorise si nécessaire, sans changer le
  comportement de `pnpm symmetry`.
- Dette du 2026-10-15 (PR #118) : `items-au-gel.ts` recoupe `--items` avec `donnees_commit`, mais
  pas `--mesures`. Étends ce recoupement à `data/mesures` (même mécanisme), pour `pnpm symmetry`
  comme pour le gel.
- Périmètre : `pipeline/questions/charger-perimetre.ts:chargerPerimetre(chemin, contexte)` lit
  `config/perimetre.yaml` (ne le modifie pas) et rend `date_gel`, `perimetre`, `parametres_tirage`.
  Engendrement : `pipeline/questions/engendrement.ts`. Tirage : `pipeline/questions/tirage.ts:tirer`.
  Fenêtre : `pipeline/interrogation/fenetre.ts`.
- Ce que `run.json` exige et qui ne vient d'aucune source existante (juges, alias aveugles des
  outils, début de fenêtre, `type_run`, version du protocole) : un fichier `config/gel.json`,
  comme `config/reformulation.json` (valeurs `null` livrées, à remplir par l'auteur ; la commande
  refuse de partir sur une valeur `null` ou absente, en nommant le champ), plus `--type-run` en
  argument. Valide ce fichier par un JSON Schema ajouté dans `schema/` et enregistré comme les
  autres (exemples valides et invalides dans `schema/exemples/`, manifeste). Le protocole ne dit
  pas qui choisit les alias aveugles : prends-les en entrée, ne les engendre pas, et signale ce
  trou dans ton rapport.
- Identifiant du run : ULID, comme ailleurs dans le dépôt (cherche l'écrivain d'ULID existant ;
  n'ajoute aucune dépendance).

## Fichiers

- À lire d'abord : `CLAUDE.md`, `runs/README.md`, `outils/symmetry.ts`, `outils/items-au-gel.ts`,
  `pipeline/reformulation/lecture-au-gel.ts`, `pipeline/reformulation/entrees.ts` (`tachesDe`),
  `pipeline/questions/charger-perimetre.ts`, `schema/run.schema.json`, `schema/tirage.schema.json`,
  `config/reformulation.json` et son chargeur (modèle de config à remplir), `outils/run-dry.ts`
  (`exigerHorsDeRuns` : modèle de garde), `tests/ecriture-data.test.ts`.
- À créer : `pipeline/gel/` (logique pure : assembler le run à partir d'entrées déjà lues ;
  contrôles git et écriture à part, minces), `outils/geler.ts`, `config/gel.json`,
  `schema/config-gel.schema.json` (ou nom cohérent avec l'existant), tests sous `tests/gel/`.
- À modifier : `package.json` (script `geler`), `outils/items-au-gel.ts` (mesures),
  `outils/symmetry.ts` si factorisation, `runs/README.md`, `schema/exemples/manifeste.json`.
- À ne pas toucher : `data/`, `docs/PROTOCOLE.md`, `prompts/`, `config/perimetre.yaml`,
  `outils/run-dry.ts` et `pipeline/interrogation/` (PR 4), les statuts du run (PR 3).

## Contraintes du protocole applicables

- Règle 3 : rien n'écrit dans `data/`. Le gel lit `data/` ; il écrit sous `runs/` ou sous `--sortie`.
- Règle 4 : « Les tests de symétrie (§5 du protocole) sont bloquants. Un run dont les tests échouent
  ne s'exécute pas. » Statut global `rouge` ⇒ rien n'est écrit, code 1. `ecart_tolere` ⇒ écrit, avec
  l'écart dans `run.json#/symetrie`.
- §5 : « le jeu complet des questions engendrées au gel, publié avec le run ; un jeu incomplet est
  refusé. Ce jeu s'engendre sur les items du commit des données que le run inscrit au gel. »
- §5 : « N'entrent au tirage que les questions dont la réponse attendue est définie à la date de
  gel » (convention semi-ouverte : un item dont `valide_au` tombe exactement sur `date_gel` est
  déjà obsolète — voir la description de `date_gel` dans `schema/run.schema.json`).
- Anti-patterns de `CLAUDE.md` : aucune valeur par défaut silencieuse (`?? 0`, `catch {}`), aucun
  `if` propre à un candidat ou à un outil.
- Complexité : cyclomatique ≤ 9, cognitive < 15 par fonction ; compétence `complexite-maitrisee`.

## Cas limites à tester

1. Dépôt sale (fichier modifié ; fichier non suivi) ⇒ refus avant toute lecture coûteuse, rien écrit.
2. `runs/<date>/` existe déjà (même vide) ⇒ refus.
3. `--sortie` absent pour un agent : la commande n'écrit sous `runs/` que si `--sortie` est absent ;
   les tests passent toujours `--sortie` vers un temporaire et vérifient que `runs/` n'a pas bougé.
4. `date_gel` vers 00:30 heure de Paris, veille en UTC ⇒ répertoire à la date de Paris.
5. Item dont `valide_au` = `date_gel` exactement ⇒ exclu du tirage, compté à part.
6. Une question engendrée sans formulation relue ⇒ `FormulationsEnDefautAuGel`, rien écrit.
7. Position de l'item changée depuis la relecture (D43) ⇒ refus, rien écrit.
8. Symétrie `rouge` ⇒ code 1, rien écrit ; `ecart_tolere` ⇒ écrit, écart inscrit.
9. `config/gel.json` avec une valeur `null` ⇒ refus nommant le champ.
10. Mesure de `data/mesures/` modifiée après `donnees_commit` ⇒ `pnpm symmetry` et le gel refusent.
11. Deux gels du même commit vers deux sorties ⇒ `questions.json` et `tirage.json` identiques
    octet pour octet (seul `run.json#/id` peut différer ; dis-le dans le test).
12. Écriture tout ou rien : une erreur à l'écriture du troisième fichier ne laisse aucun fichier.
13. `run.json` écrit puis relu passe `pnpm symmetry` avec les cinq options sur la sortie (test de
    bout en bout de la PR, sur un dépôt Git de fixture en temporaire).

## Ce qui ne doit pas bouger

- Le comportement et les codes de sortie de `pnpm symmetry` (sauf le recoupement des mesures, ajouté).
- Aucune assertion existante affaiblie : avant de rendre, `git diff` filtré sur les lignes `expect`
  ne doit montrer que des ajouts.
- `pnpm run:dry` passe toujours.

## Définition de terminé

- `pnpm check && pnpm test` passent, lancés par toi ; `pnpm run:dry` aussi.
- Chaque cas limite ci-dessus a un test nommé.
- Rien d'écrit hors des fichiers listés. Aucune dépendance ajoutée.
- Un commit sur `lots/gel-coeur`, message en français, terminé par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ne pousse pas, n'ouvre pas de PR.
- Rapport : ce qui est fait, les écarts au brief et pourquoi, les trous du protocole rencontrés,
  et en deux lignes ce qui pourrait casser plus tard.

## Questions déjà tranchées

- `engendree_le` = `date_gel` (D44).
- Graines : port + adaptateur de test ; pas de drand ici.
- Mesures non copiées dans `runs/<date>/` ; recoupées avec `donnees_commit`.
- Paramètres sans source existante : `config/gel.json` à valeurs `null`, rempli par l'auteur.
- Si le protocole ou un schéma contredit ce brief : arrête-toi sur ce point, ne l'invente pas,
  et dis-le dans le rapport ; continue le reste.
