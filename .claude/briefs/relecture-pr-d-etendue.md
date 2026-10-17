# Brief — D53 (1), PR D : relecture étendue et rattachement F ⇔ fictive (protocole 0.17)

## Agent

`codeur-opus`, isolation `worktree`, branche `lots/relecture-etendue` partie de `main` (27d992c).

## Objectif

Aligner le code de la relecture et du rattachement des mesures sur le §4 du protocole 0.17
(paragraphe « Mesure d'un item extrait », fusionné par la PR #148) :

1. l'empreinte de relecture couvre aussi `alias`, `origine_fictive` et `verification_fictivite` ;
2. `pnpm mesures --relire` imprime tout ce que la relecture atteste ;
3. `pnpm mesures --rattacher` refuse un item F vers une mesure non fictive, et un item P, A ou O
   vers une mesure fictive.

## Contexte que le sous-agent ne peut pas deviner

- Texte du protocole 0.17, §4, cité : « aucune mesure n'entre au jeu de données, ni dans une
  version nouvelle, sans que l'auteur en ait relu le contenu exact (libellé, thème, formulation
  canonique, caractère fictif, alias, et pour une mesure fictive son origine et la vérification de
  sa fictivité). […] Un item F ne se rattache qu'à une mesure fictive, un item d'un autre type qu'à
  une mesure qui ne l'est pas. »
- Les PR A (#146, verrou `sans_relecture` dans `validation/io/data-mesures.ts`) et B (#147,
  `--relire` / `--rattacher`) ont implémenté une relecture sur 4 champs seulement
  ({libelle, theme, formulation_canonique, fictive}) et aucun contrôle de type au rattachement.
- **Deux empreintes distinctes, décision de l'auteur :** `mesure.empreinte` (schéma
  `mesure.schema.json`, calculée dans `pipeline/extraction/assemblage.ts`) **reste** sur 4 champs
  et ne change pas. Seule l'empreinte **de relecture** s'étend. Pour qu'on ne les confonde plus :
  renommer `empreinteContenuMesure` en `empreinteRelecture` partout (code et tests), et réécrire
  l'en-tête de `relectures-mesure.ts` et la description du champ `empreinte` de
  `schema/relecture-mesure.schema.json` : elle n'est plus « la définition de `mesure.empreinte` »,
  c'est le sha256 de la forme canonique de {libelle, theme, formulation_canonique, fictive, alias,
  origine_fictive, verification_fictivite}, champs absents omis.
- **Absent ≠ vide.** Un champ absent n'entre pas dans l'objet canonisé (ne pas écrire
  `alias: undefined` qu'on espère voir disparaître : construire l'objet sans la clé). Un `alias: []`
  y entre. Les deux contenus diffèrent donc et ont des empreintes différentes. Pas de valeur par
  défaut (`?? []` interdit).
- Le type `Mesure` (`validation/domaine/types.ts`) n'a pas `alias` ; l'ajouter
  (`readonly alias?: readonly string[]`), conforme au schéma.
- Le registre `validation/mesures/relectures.json` n'existe encore nulle part : aucune relecture
  réelle à invalider, aucune migration.
- `--relire` : la sortie actuelle (`outils/mesures.ts`, fonction `relire`) imprime libellé, thème,
  fictive, formulation. Ajouter : alias (un par ligne, ou « absent », ou « liste vide »), origine
  fictive (ou « absente »), vérification de fictivité (date, corpus vérifiés, opérateur, résultat ;
  ou « absente »). Un champ absent est dit absent, jamais omis de la sortie. Mettre à jour le
  message final (« Toute modification ultérieure du libellé, du thème… ») pour couvrir tous les
  champs. Respecter la complexité : extraire une fonction de mise en forme pure si besoin.
- Rattachement : nouveau motif `type_incompatible` dans `MotifRefusRattachement` et une ligne de
  plus dans la table `CONTROLES` de `validation/domaine/rattachements-item.ts` — une donnée, pas un
  `if`. Règle : refus ssi `(item.type === "F") !== cible.fictive`. Le placer après `deja_rattache`
  et avant `publie` (il ne dépend que de l'item et de la cible, donc `rattacherItem` le refait
  aussi). Détail du message : type de l'item, caractère fictif de la cible, et la règle du §4.
  Mettre à jour la doc de l'union de motifs et l'en-tête de `outils/rattachement-mesure.ts` /
  `outils/mesures.ts` s'ils listent les refus.

## Fichiers

À lire d'abord : `validation/domaine/relectures-mesure.ts`, `validation/domaine/rattachements-item.ts`,
`validation/domaine/types.ts` (`Mesure`, `Item`, `TypeItem`), `outils/mesures.ts` (`relire`),
`outils/rattachement-mesure.ts`, `validation/io/data-mesures.ts` (usage de l'empreinte dans le
message de refus), `schema/mesure.schema.json`, `schema/relecture-mesure.schema.json`, tests
`tests/relectures-mesure.test.ts`, `tests/relire-mesure.test.ts`, `tests/rattacher-item.test.ts`,
`tests/rattachements-item.test.ts`, `tests/promote-mesures.test.ts`.

À modifier : les fichiers ci-dessus selon le contexte ; `schema/README.md` si la description de
l'empreinte de relecture y figure.

À ne pas toucher : `data/`, `docs/PROTOCOLE.md`, `prompts/`, `config/perimetre.yaml`,
`pipeline/extraction/` (y compris `assemblage.ts`), la définition de `mesure.empreinte` dans
`schema/mesure.schema.json`, `docs/DETTE.md`, `LESSONS.md`, `docs/feuille-de-route.json`.

## Contraintes du protocole applicables

- CLAUDE.md règle 3 : ces commandes n'écrivent jamais dans `data/` (`tests/ecriture-data.test.ts`).
- CLAUDE.md, « Jamais » : rien ne rédige ni ne modifie le contenu d'une mesure.
- Pas de valeur par défaut silencieuse ; erreurs nommées.
- Complexité : cyclomatique ≤ 9, cognitive < 15 (compétence `complexite-maitrisee`).
- Pas de nouvelle dépendance. Un test n'est jamais rendu vert en affaiblissant son assertion :
  un test qui figeait l'empreinte à 4 champs se met à jour sur la nouvelle définition, en le disant.

## Cas limites à tester

Empreinte de relecture (unitaires) :
1. Modifier seulement `alias` (ajout d'un alias) change l'empreinte.
2. `alias` absent et `alias: []` ont des empreintes différentes.
3. Modifier seulement `origine_fictive` change l'empreinte.
4. Modifier seulement un champ de `verification_fictivite` (par ex. `corpus_verifies`) change l'empreinte.
5. L'ordre des clés de l'objet mesure ne change pas l'empreinte (canonisation).
6. `mesure.empreinte` (champ porté) n'influe pas sur l'empreinte de relecture.

Bout à bout (`pnpm mesures --relire` puis `pnpm promote`) :
7. Alias ajouté à la main après `--relire --ecrire` ⇒ `promote` refuse (`sans_relecture`) ; une
   nouvelle `--relire --ecrire` débloque.
8. Même chose pour `origine_fictive` sur une mesure fictive.
9. `--relire` d'une mesure non fictive sans alias : la sortie dit les alias absents, l'origine
   absente, la vérification absente.
10. `--relire` d'une mesure fictive complète : la sortie contient chaque alias, l'origine, la date,
    les corpus, l'opérateur et le résultat de la vérification.

Rattachement :
11. Item F vers mesure non fictive ⇒ refus `type_incompatible`, rien d'écrit (registre et staging
    inchangés).
12. Item P vers mesure fictive ⇒ refus `type_incompatible`. Idem un item A et un item O (test
    paramétré sur P, A, O).
13. Item F vers mesure fictive ⇒ accepté (pas de régression).
14. `rattacherItem` appelé directement sur un couple incompatible lève `RattachementRefuse` de
    motif `type_incompatible`.

## Ce qui ne doit pas bouger

`mesure.empreinte` et son calcul dans l'extraction ; `empreinteContenuNotant` ; le comportement de
`promote` hors du verrou ; les autres refus du rattachement et leur ordre relatif ; le format des
entrées des deux registres (seule la valeur de l'empreinte change de définition).

## Définition de terminé

- `pnpm check && pnpm test` passent, lancés par le sous-agent.
- Chaque cas limite ci-dessus a un test nommé (« cas n : … »).
- Rien d'écrit hors des fichiers listés. Aucun commit.
- Rapport : fichiers modifiés, tests ajoutés, résultat de `pnpm check && pnpm test` (nombres),
  et en deux lignes ce qui pourrait casser plus tard.

## Questions déjà tranchées

- Deux empreintes distinctes ; `mesure.empreinte` inchangée ; renommage en `empreinteRelecture`.
- Absent ≠ vide.
- Le refus F ⇔ fictive est une ligne de `CONTROLES`.
