# Brief — lot gel, PR 2b : run précédent, ordre des instants, alias aveugles

## Agent

`codeur-opus`, isolation `worktree`, branche `lots/gel-precedent` à partir de `main` (après la
fusion de #130, PR 2a).

## Objectif

`pnpm geler` passe au tirage le run précédent (reprises à 80 %, §5), refuse un ordre d'instants
impossible, refuse des alias aveugles qui trahissent un outil, et lit le taux de l'échantillon
humain à un seul endroit.

## Contexte que tu ne peux pas deviner

- **`docs/PROTOCOLE.md` fait autorité** (0.16). Relis le §5, « Tirage » (reprises), le §6 (fenêtre)
  et le §7 (alias aveugles). `CLAUDE.md` : huit règles. Lis les en-têtes de `pipeline/gel/*.ts` tels
  que la PR 2a les a laissés.
- **D45**, dans `docs/feuille-de-route.json` (décision retenue sur les quatre points ; le point 1, l'ULID, est
  fait en 2a) :
  - **(2) Alias** saisis par l'auteur dans `config/gel.json` (déjà le cas). Ils sont refusés si l'un
    d'eux contient le nom ou l'éditeur **d'un** outil du périmètre (texte proposé pour la 0.17 :
    « un alias ne contient ni le nom ni l'éditeur d'un outil, et deux outils n'en partagent pas »),
    ou s'il est partagé par deux outils. Comparaison après normalisation fixe : NFKD, diacritiques
    retirés, minuscules, espaces repliés. Écris-la une fois et teste-la. Lis
    `pipeline/questions/charger-perimetre.ts` (`motifsAlias`) et `config/perimetre.yaml`, dont les
    commentaires donnent les champs d'un outil, pour savoir quels champs portent le nom et l'éditeur.
    Si un outil n'a pas de champ « nom » distinct de son libellé, prends ce qui existe et dis-le.
    Le contrôle vit avec les autres contrôles d'alias, pas dans le gel seul.
  - **(3) Run précédent** : le run de `runs/` dont la `date_gel` est la plus récente strictement
    avant la nôtre, hors `statut` `invalide` et hors `type_run` pilote. Il est inscrit dans
    `run.json`, et son absence est déclarée, jamais omise en silence. Ajoute au schéma `run` un champ
    obligatoire, par exemple `run_precedent` : objet {id, chemin du tirage, sha256 du tirage} ou
    `null` explicite. Exemples et manifeste à jour. Le gel construit `TiragePrecedent`
    (`pipeline/questions/tirage.ts`) à partir des fichiers de ce run (son `tirage.json` et son
    `questions.json`), vérifie le SHA-256 que son `run.json` déclare pour le tirage, et le passe à
    `tirer`. Lis `tirage.ts` (`TiragePrecedent`, `QuestionPrecedente`, signature des trois textes)
    pour savoir d'où vient chaque champ. Un run précédent illisible ou incohérent ⇒ refus nommé,
    jamais « pas de précédent ».
  - **(4) Ordre des instants** : gel refusé si l'instant d'exécution est antérieur à `date_gel`. La
    PR 2a refuse déjà un tour drand non émis ; fais-en un refus général nommé, contrôlé avant tout
    appel réseau. Fenêtre refusée si `fenetre.debut` < `date_gel`.
- **À ne pas inventer** : un gel exécuté après l'ouverture de sa propre fenêtre n'est réglé par
  aucune décision. Ne le refuse pas ; signale-le dans ton rapport comme trou à trancher.
- **Taux de l'échantillon humain** : `assemblage.ts:TAUX_ECHANTILLON_SANS_RETRAIT` (0,1) et
  `pipeline/notation/controle-croise.ts:tauxEchantillon` (0,1 / 0,25 en dur) disent la même règle
  du §7 à deux endroits. Une seule source : les deux constantes vivent dans un module, que les deux
  appelants importent. Comportement inchangé.
- Les statuts du run (`run:invalider`) sont la PR 3. Ici, tu **lis** `statut` ; tu ne l'écris pas.

## Fichiers

- À lire d'abord : `CLAUDE.md`, `pipeline/gel/*.ts`, `outils/geler.ts`, `tests/gel/`,
  `pipeline/questions/tirage.ts`, `pipeline/questions/charger-perimetre.ts`, `config/perimetre.yaml`
  (commentaires), `config/gel.json`, `pipeline/interrogation/fenetre.ts`,
  `pipeline/notation/controle-croise.ts`, `schema/run.schema.json`, `runs/README.md`.
- À créer : `pipeline/gel/precedent.ts` (logique pure, lecture à part et mince), tests sous `tests/gel/`.
- À modifier : `pipeline/gel/geler.ts`, `assemblage.ts`, `charger-perimetre.ts` (alias),
  `controle-croise.ts` (import), `schema/run.schema.json`, `schema/exemples/`, `runs/README.md`.
- À ne pas toucher : `data/`, `docs/PROTOCOLE.md`, `docs/feuille-de-route.json`, `prompts/`,
  `config/perimetre.yaml`, `pipeline/interrogation/` (hors lecture), `outils/run-dry.ts`.

## Contraintes du protocole applicables

- §5 : « 80 % des questions sont reprises du run précédent […] Une question est reprise si elle
  porte le même identifiant et les mêmes empreintes de texte qu'au run précédent. »
- Aucune valeur par défaut silencieuse ; aucun `if` propre à un outil ou à un candidat.
- Complexité : cyclomatique ≤ 9, cognitive < 15 ; compétence `complexite-maitrisee`.

## Cas limites à tester

1. Aucun run dans `runs/` ⇒ `run_precedent: null`, tirage sans reprise, inscrit.
2. Deux runs antérieurs ⇒ le plus récent ; un run à la même `date_gel` n'est pas précédent.
3. Le plus récent est `invalide` ⇒ on prend celui d'avant ; même chose pour un pilote.
4. Tirage précédent dont le SHA-256 ne correspond pas à son `run.json` ⇒ refus, rien écrit.
5. Run précédent présent : une question reprise a `reprise: true`, `run_origine_id` et
   `empreinte_texte_precedente` ; une question dont un texte a changé compte comme neuve.
6. Gel lancé 1 ms avant `date_gel` ⇒ refus, aucun appel réseau ; exactement à `date_gel` ⇒ accepté.
7. `fenetre.debut` < `date_gel` ⇒ refus ; égal ⇒ accepté.
8. Alias contenant le nom d'un **autre** outil, en casse et accents différents ⇒ refus ; alias
   contenant un éditeur ⇒ refus ; même alias pour deux outils ⇒ refus.
9. `controle-croise.ts` et le gel lisent la même constante (test qui échoue si l'une diverge).
10. Bout en bout : deux gels successifs sur un dépôt de fixture, le second reprend le premier, et
    `pnpm symmetry` passe sur la sortie.

## Ce qui ne doit pas bouger

- `pnpm symmetry` : comportement et codes de sortie inchangés.
- Aucune assertion affaiblie ; `git diff` filtré sur `expect` : ajouts seulement, sinon justifiés.
- `pnpm run:dry` passe.

## Définition de terminé

- `pnpm check && pnpm test` et `pnpm run:dry` passent, lancés par toi (binaires de
  `/Users/azur_now/Code/PROJETS_CODE/DEMOCRACIE_2027/node_modules/.bin` dans le PATH, aucun lien
  symbolique créé).
- Chaque cas limite a un test nommé. Aucune dépendance ajoutée.
- Un commit sur `lots/gel-precedent`, en français, terminé par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ne pousse pas, n'ouvre pas de PR.
- Rapport : fait, écarts et pourquoi, trous du protocole, deux lignes sur ce qui pourrait casser,
  SHA du commit.

## Questions déjà tranchées

- D45 (2), (3), (4) comme ci-dessus. Alias : jamais engendrés par le code.
- Si le protocole ou un schéma contredit ce brief : arrête-toi sur ce point, dis-le, continue le reste.
