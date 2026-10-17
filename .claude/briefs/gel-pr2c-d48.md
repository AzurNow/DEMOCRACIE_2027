# Brief — lot gel, PR 2c : décision D48 (gel tardif, alias élargis, empreinte des questions, statut du précédent)

## Agent

`codeur-opus`, isolation `worktree`, branche `lots/gel-d48` à partir de `main` (après la fusion de
#131, PR 2b, et #132, D48 : `main` = `b22ba51` ou plus récent).

## Objectif

Appliquer les cinq points de D48 à `pnpm geler` : refuser un gel tardif, élargir le contrôle des
alias aveugles, engager `questions.json` par empreinte dans `run.json`, n'admettre comme run
précédent qu'un run publié.

## Contexte que tu ne peux pas deviner

- **`docs/PROTOCOLE.md` fait autorité** (0.16 ; les textes de D45 à D48 seront écrits en 0.17 par
  l'auteur, pas par toi). `CLAUDE.md` : huit règles. Lis D48 dans `docs/feuille-de-route.json`
  (`"id": "D48"`), puis les en-têtes de `pipeline/gel/*.ts` tels que la PR 2b les a laissés.
- **(1) Gel tardif** : gel refusé si son instant d'exécution est **postérieur ou égal** à
  `fenetre.debut`. Troisième refus nommé de `pipeline/gel/instants.ts` (motif par exemple
  `gel_apres_ouverture_fenetre`), contrôlé avant tout appel réseau, au même endroit que
  `exigerGelApresDateGel`. Retire de l'en-tête la phrase « n'est réglé par aucune décision ».
  Raison (à mettre en commentaire) : des réponses obtenues avant le gel ne seraient couvertes par
  aucun tirage publié.
- **(2) `outil_id` comparé aux alias** : `CHAMPS_REVELATEURS` (`pipeline/questions/charger-perimetre.ts`)
  compare aujourd'hui `libelle` et `editeur`. Ajoute `outil_id`, avec la même règle que ci-dessous.
  `outil_id` est une clé stable (`config/perimetre.yaml`, commentaires) : ses séparateurs (tiret,
  souligné) découpent des mots comme les espaces. Si cela fait refuser un alias de
  `config/gel.json` ou d'une fixture existante, ne modifie pas `config/gel.json` : dis-le.
- **(3) Variantes d'un nom** : un alias est refusé s'il contient, après `normaliserAlias` :
  - un **mot significatif** (3 lettres au moins après normalisation) du libellé, de l'éditeur ou de
    l'`outil_id` d'un outil du périmètre ; « Mistral AI » → `mistral` (« ai » ignoré), « Le Chat »
    → `chat` ;
  - ou le libellé, l'éditeur ou l'`outil_id` **sans espaces ni séparateurs** : `lechat`, `mistralai`.
  L'inclusion de la chaîne entière actuelle est couverte par ces deux règles ; garde une seule
  fonction de comparaison, testée seule. Un mot de 3 lettres est significatif, un de 2 ne l'est
  pas. Le découpage en mots se fait sur ce qui n'est ni lettre ni chiffre, après normalisation.
  Message de refus : nommer l'alias, l'outil, le champ, et le mot ou la forme collée trouvés.
- **(4) Empreinte des questions** : `run.json` déclare aujourd'hui son tirage par chemin et
  SHA-256, pas son `questions.json`, qui décide pourtant des reprises. Ajoute au schéma `run` la
  déclaration de `questions.json` (chemin + `sha256`, au même endroit et dans le même style que
  celle du tirage ; champ obligatoire), écrite par l'assemblage (`pipeline/gel/assemblage.ts`) à
  partir des octets exacts écrits. Ajoute-la aussi dans `run_precedent`, à côté de `tirage`.
  Au gel, `pipeline/gel/precedent.ts` recalcule l'empreinte des octets du `questions.json` du run
  précédent et la compare à celle que son `run.json` déclare : différente ou absente ⇒ refus nommé
  (motif par exemple `questions_empreinte`), jamais « pas de précédent ». Exemples de
  `schema/exemples/` et manifeste à jour ; `runs/README.md` à jour.
- **(5) Statut du précédent** : `STATUTS_EXCLUS = {invalide}` devient une liste d'**admis** :
  `publie` et `publie_provisoire`. Un run plus récent que tout précédent admissible, de statut
  `planifie` ou `en_cours`, est **refusé nommément** (le gel s'arrête, motif par exemple
  `precedent_non_publie`) ; il n'est pas sauté. Un `invalide` reste sauté (le run d'avant est pris),
  comme un pilote. Mets à jour la description de `run_precedent` dans `schema/run.schema.json`.
  Si le choix « refusé et non sauté » pour `planifie`/`en_cours` te paraît contredire D48 à la
  lecture, arrête-toi sur ce point et dis-le.
- Les statuts du run (`run:invalider`) sont la PR 3. Ici, tu **lis** `statut` ; tu ne l'écris pas.

## Fichiers

- À lire d'abord : `CLAUDE.md`, D48 dans `docs/feuille-de-route.json`, `pipeline/gel/*.ts`,
  `tests/gel/`, `pipeline/questions/charger-perimetre.ts`, `config/perimetre.yaml` (commentaires),
  `config/gel.json`, `schema/run.schema.json`, `runs/README.md`.
- À modifier : `pipeline/gel/instants.ts`, `geler.ts`, `precedent.ts`, `assemblage.ts`,
  `pipeline/questions/charger-perimetre.ts`, `schema/run.schema.json`, `schema/exemples/`,
  `runs/README.md`, tests sous `tests/gel/` et ceux de `charger-perimetre`.
- À ne pas toucher : `data/`, `docs/PROTOCOLE.md`, `docs/feuille-de-route.json`, `prompts/`,
  `config/perimetre.yaml`, `config/gel.json`, `pipeline/interrogation/` (hors lecture),
  `outils/run-dry.ts`.

## Contraintes du protocole applicables

- §5 : « Une question est reprise si elle porte le même identifiant et les mêmes empreintes de
  texte qu'au run précédent. » §7 : juges aveugles à l'identité de l'outil.
- Aucune valeur par défaut silencieuse ; aucun `if` propre à un outil ou à un candidat.
- Complexité : cyclomatique ≤ 9, cognitive < 15 ; compétence `complexite-maitrisee`.

## Cas limites à tester

1. Gel exécuté 1 ms avant `fenetre.debut` ⇒ accepté ; exactement à `fenetre.debut` ⇒ refus ; après
   ⇒ refus ; dans les deux refus, aucun appel réseau, rien d'écrit.
2. Alias contenant `outil_id` d'un autre outil, avec séparateurs ⇒ refus.
3. « Mistral » contre l'éditeur « Mistral AI » ⇒ refus (mot) ; « LeChat » contre « Le Chat » ⇒
   refus (forme collée) ; casse et accents différents ⇒ même résultat.
4. Mot de 2 lettres (« ai », « le ») présent dans un alias ⇒ pas de refus pour lui seul ; mot de
   exactement 3 lettres ⇒ refus.
5. Un alias légitime (aucun mot, aucune forme collée) ⇒ accepté ; les alias de `config/gel.json`
   passent ou le rapport dit lesquels échouent.
6. `run.json` écrit par le gel déclare `questions.json` avec l'empreinte de ses octets exacts.
7. Précédent dont `questions.json` a été modifié d'un octet ⇒ refus nommé ; empreinte absente de son
   `run.json` ⇒ refus nommé (le schéma l'exigeant, un tel run.json est aussi non conforme : dis
   quel refus part en premier et teste-le).
8. Précédent le plus récent `planifie`, puis `en_cours` ⇒ refus nommé ; `publie_provisoire` ⇒ pris ;
   `invalide` ⇒ sauté, le run d'avant `publie` est pris.
9. Bout en bout : deux gels successifs sur un dépôt de fixture, le premier passé `publie` à la main
   dans la fixture, le second le reprend ; `pnpm symmetry` passe sur la sortie.

## Ce qui ne doit pas bouger

- `pnpm symmetry` : comportement et codes de sortie inchangés.
- Aucune assertion affaiblie ; `git diff` filtré sur `expect` : ajouts seulement, sinon justifiés
  (un test 2b qui prenait un précédent `planifie` change d'attendu : dis-le).
- `pnpm run:dry` passe.

## Définition de terminé

- `pnpm check && pnpm test` et `pnpm run:dry` passent, lancés par toi (binaires de
  `/Users/azur_now/Code/PROJETS_CODE/DEMOCRACIE_2027/node_modules/.bin` dans le PATH, aucun lien
  symbolique créé).
- Chaque cas limite a un test nommé. Aucune dépendance ajoutée.
- Un commit sur `lots/gel-d48`, en français, terminé par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ne pousse pas, n'ouvre pas de PR.
- Rapport : fait, écarts et pourquoi, trous du protocole, deux lignes sur ce qui pourrait casser,
  SHA du commit.

## Questions déjà tranchées

- D48, option 1 sur les cinq points, comme ci-dessus. Alias : jamais engendrés ni corrigés par le code.
- Si le protocole ou un schéma contredit ce brief : arrête-toi sur ce point, dis-le, continue le reste.
