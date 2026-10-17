# Brief — D53 (1), PR B : `pnpm mesures --relire` et `pnpm mesures --rattacher`

## Agent

`codeur-opus`, isolation `worktree`, branche `lots/relecture-rattacher` partie de `main` (7935fe7).

## Objectif

Donner à l'auteur les deux gestes qui débloquent la promotion d'un item extrait depuis la PR A
(#146, verrou `sans_relecture`) :

1. `pnpm mesures --relire=<mesure_id> [--date=AAAA-MM-JJ] [--ecrire]` : inscrit au registre
   `validation/mesures/relectures.json` la relecture du contenu **actuel** de la mesure en
   `staging/mesures/`.
2. `pnpm mesures --rattacher=<item_id> --a=<mesure_id> [--date=…] [--ecrire]` : rattache un item de
   staging à une autre mesure (existante), trace la décision dans un registre publié en ajout seul
   `validation/mesures/rattachements.json`, et réécrit l'item de staging sur la mesure cible.

Simulation par défaut ; `--ecrire` écrit. Aucun commit.

## Contexte que le sous-agent ne peut pas deviner

- D53 (1) (`docs/feuille-de-route.json`, `docs/DETTE.md` « 2026-10-16 — Lot extraction, PR 1 »
  point 1, et « D53 (1), PR A »). L'extraction crée une mesure de staging par item, avec le libellé
  du modèle comme `formulation_canonique`. La PR A refuse d'écrire dans `data/mesures/` toute mesure
  créée ou réécrite sans relecture `(id, version, empreinte)`. Il manque la commande qui écrit les
  relectures, et le moyen de faire partager une même mesure à plusieurs items.
- Décisions de l'auteur du 2026-10-16 (soir), à appliquer telles quelles :
  - **Rattachement = registre + staging.** La commande ajoute une entrée au registre publié, puis
    réécrit l'item de staging (`mesure_id`, `mesure_version` = version courante de la cible,
    `version` + 1, `empreinte` recalculée par `empreinteContenuNotant`, entrée d'historique avec le
    HEAD), sur le modèle exact de `repinglerSurMesure` / `--renvoyer`. L'empreinte d'un item couvre
    `mesure_id` et sa version : l'item que voient les annotateurs doit être celui qui sera promu.
    Pas de substitution au moment de `promote`.
  - **Item déjà annoté ⇒ renvoi en attente**, par le même mécanisme que `--renvoyer` : après
    rattachement, le lot qui l'épinglait ne le juge plus (`lotJugeEncore` faux), ses décisions
    restent au journal. Mêmes refus que le renvoi : item publié dans `data/items` ⇒ refus ; item
    dont le lot n'a pas fini (`decisions_incompletes` au sens de `sortDe`) ⇒ refus nommé, à relancer
    une fois le lot terminé ; item non `en_attente` ⇒ refus. Règle uniforme, pas d'exception.
  - **Formulation : relecture seule.** Pas d'option `--formulation`. Si la formulation est à
    reprendre, l'auteur édite à la main le fichier de `staging/mesures/` avant `--relire` ; le
    registre ne fige que ce qui a été relu (l'empreinte est recalculée par `relectureDe`).
- `--relire` imprime **en entier** le libellé, le thème, `fictive` et la `formulation_canonique`
  de la mesure, puis l'empreinte : c'est ce texte que l'auteur atteste avoir relu. Il ne réécrit
  jamais la mesure.
- La mesure de staging proposée qui n'est plus citée par aucun item après rattachement reste en
  `staging/` ; elle n'est pas promue (`planifierMesures` ne traite que les mesures citées). Ne pas
  la supprimer.

## Fichiers

À lire d'abord :
- `outils/mesures.ts` (options, `enregistrer`, `principal`), `outils/renvoi-mesure.ts`,
  `validation/domaine/renvoi-mesure.ts` (`planifierRenvois`, `sortDe`, `repinglerSurMesure`,
  `renvoyeDepuis`, `lotJugeEncore`, `CHANGEMENT_RENVOI`), `validation/io/staging-renvoi.ts`,
  `outils/garde-fous-git.ts`.
- `validation/domaine/relectures-mesure.ts` et `validation/io/relectures-fichier.ts` (PR A) ;
  `validation/io/mesures-fichier.ts` (`ajouterAuRegistre` : **modèle à imiter** pour l'écriture en
  ajout seul, atomique, relue après écriture).
- `schema/relecture-mesure.schema.json`, `schema/decision-mesure.schema.json`, `outils/schemas/noms.ts`,
  `schema/README.md`, `schema/exemples/manifeste.json`.
- `tests/` : les tests de `pnpm mesures`, de `--renvoyer`, `tests/aides/bac.ts`,
  `tests/relectures-mesure.test.ts`, `tests/ecriture-data.test.ts`.

À créer :
- `validation/io/relectures-fichier.ts` : ajouter `ajouterRelecture(repertoire, entree)` (ajout
  seul, même discipline que `ajouterAuRegistre`).
- `schema/rattachement-item.schema.json` : UNE entrée du registre des rattachements. Champs requis :
  `item_id` (ulid), `item_version` (version de l'item **avant** rattachement), `mesure_avant` (ulid),
  `mesure_apres` (ulid), `mesure_version_apres` (entier ≥ 1), `date` (date_civile) ;
  `additionalProperties: false` ; exemples valides/invalides au manifeste ; recensé dans `noms.ts`
  et `schema/README.md`.
- `validation/domaine/rattachements-item.ts` : pur. Type, validateur typé `validerEntreeRattachement`
  (accord testé avec le schéma), et la réécriture pure de l'item rattaché (sur le modèle de
  `repinglerSurMesure`).
- `validation/io/rattachements-fichier.ts` : lecture (absent ⇒ vide, corruption bloquante) et ajout seul.
- `outils/rattachement-mesure.ts` (si `outils/mesures.ts` dépasserait sinon la complexité ou
  deviendrait illisible) : orchestration de `--rattacher`, mêmes garde-fous que `renvoi-mesure.ts`.
- Tests : `tests/relire-mesure.test.ts`, `tests/rattacher-item.test.ts`, `tests/rattachements-item.test.ts`.

À modifier :
- `outils/mesures.ts` : options `relire`, `rattacher`, `a` ; en-tête de documentation ; aiguillage.
- `validation/domaine/renvoi-mesure.ts` : `renvoyeDepuis` doit reconnaître aussi l'entrée
  d'historique d'un rattachement (préfixe dédié, par exemple `CHANGEMENT_RATTACHEMENT`), pour que le
  lot qui épinglait l'ancienne version ne juge plus l'item. Une liste des changements qui renvoient,
  pas un `if` de plus par cas.
- `outils/promote.ts` : seulement si nécessaire pour mentionner les nouveaux registres dans le
  commentaire d'en-tête. Le comportement de `promote` ne change pas.

À ne pas toucher : `data/`, `docs/PROTOCOLE.md`, `prompts/`, `config/perimetre.yaml`,
`pipeline/extraction/` (y compris `assemblage.ts`, dont l'empreinte dupliquée est un autre lot),
`docs/DETTE.md`, `LESSONS.md`, `docs/feuille-de-route.json`.

## Contraintes du protocole applicables

- CLAUDE.md règle 3 : rien n'entre dans `data/` sans validation humaine. Ces commandes n'écrivent
  **jamais** dans `data/` (`tests/ecriture-data.test.ts` le garde).
- CLAUDE.md, « Jamais » : la commande ne rédige ni ne modifie le contenu d'une mesure ou d'une
  citation. `--relire` lit, `--rattacher` change un identifiant de rattachement, rien d'autre.
- §4 (protocole 0.13) : la version de la mesure fait partie du contenu notant d'un item ; changer
  de mesure change l'empreinte et renvoie en attente.
- Pas de valeur par défaut silencieuse : mesure introuvable, item introuvable, registre malformé ⇒
  erreur nommée, sortie en erreur.
- Complexité : cyclomatique ≤ 9, cognitive < 15 ; découper (compétence `complexite-maitrisee`).
- Pas de nouvelle dépendance.

## Cas limites à tester

`--relire`
1. Mesure introuvable en staging ⇒ erreur nommée, rien d'écrit.
2. Simulation (sans `--ecrire`) ⇒ affiche le contenu complet et l'empreinte, n'écrit rien.
3. `--ecrire` ⇒ une entrée `relectureDe(mesure, date)` ajoutée ; registre absent ⇒ créé.
4. Après `--relire --ecrire`, `pnpm promote` accepte la création de cette mesure (test d'intégration
   bout à bout avec le verrou de la PR A).
5. Formulation éditée après relecture ⇒ `promote` refuse à nouveau (`sans_relecture`) ; une
   nouvelle `--relire` débloque.
6. Mesure déjà relue dans ce contenu exact ⇒ message explicite, pas de nouvelle entrée (ne pas
   gonfler le registre ; deux entrées identiques restent néanmoins acceptées en lecture).
7. Registre existant corrompu ⇒ erreur bloquante, rien d'écrit.

`--rattacher`
8. Item introuvable en staging, ou mesure cible introuvable en `staging/mesures/` ⇒ erreur nommée.
9. Cible = mesure actuelle de l'item ⇒ refus explicite (rien à faire).
10. Item en attente, dans aucun lot ⇒ réécrit : `mesure_id` cible, `mesure_version` = version
    courante de la cible, `version` + 1, empreinte recalculée, historique avec le commit HEAD ;
    entrée ajoutée au registre.
11. Item dans un lot terminé (chaque annotateur a décidé) ⇒ rattaché, et `lotJugeEncore` devient
    faux pour ce lot ; les décisions restent au journal.
12. Item dans un lot inachevé ⇒ refus nommé, rien d'écrit (ni registre ni staging).
13. Item publié dans `data/items` ⇒ refus nommé.
14. Item non `en_attente` ⇒ refus.
15. Simulation ⇒ rapporte avant/après, n'écrit rien ; `--ecrire` sur un arbre Git sale ⇒ refus
    (garde-fous identiques à `--renvoyer`).
16. Ordre des écritures : si la réécriture de staging échoue, le registre n'a pas d'entrée
    orpheline (ou, si l'ordre inverse est retenu, le justifier et le tester). Choisir et tester.
17. Deux items rattachés à la même cible ⇒ `promote` ne planifie qu'une mesure ; l'ancienne mesure
    proposée, plus citée, n'est pas promue.
18. Relancer le même rattachement ⇒ cas 9 (la cible est déjà la mesure de l'item), rien d'écrit.
19. Accord schéma / validateur typé pour `rattachement-item`, comme `tests/corrections-mesure.test.ts`.
20. `--relire` et `--rattacher` ensemble, ou avec `--mesure` / `--renvoyer` ⇒ refus explicite
    d'arguments incompatibles.

## Ce qui ne doit pas bouger

- `pnpm mesures` sans argument, `--mesure … --decision …`, `--renvoyer` : comportement et messages.
- `pnpm promote` : comportement ; tous les tests existants verts sans assertion affaiblie.
- Le renvoi par correction de thème continue de fonctionner (ses tests restent verts après
  l'extension de `renvoyeDepuis`).

## Définition de terminé

- `pnpm check && pnpm test` passent, lancés par le sous-agent.
- Chaque cas limite ci-dessus a un test nommé.
- Rien d'écrit hors des fichiers listés.
- Aucun commit.
- Rapport : fichiers créés/modifiés, cas limites ↔ tests, ce qui pourrait casser plus tard (2 lignes),
  questions ouvertes (notamment : une cible présente dans `data/mesures/` mais absente de
  `staging/mesures/` — la refuser comme le cas 8 et le signaler, ne pas copier la mesure).

## Questions déjà tranchées

- Où vit le rattachement ? Registre publié + réécriture de staging. Pas de substitution à `promote`.
- Item déjà annoté ? Renvoi en attente, mêmes refus que `--renvoyer`.
- Qui corrige la formulation ? L'auteur, à la main en staging ; la commande ne fait que relire.
- Amendement du protocole ? Non : PR C, proposée par la session principale.
