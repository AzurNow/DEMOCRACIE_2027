# Brief — lot extraction, suite : motif `lecture_illisible` dans le cœur

## Agent

`codeur-opus`, isolation `worktree`, branche `lots/extraction-lecture-illisible` partant de `main`
(07cf9f6 ou plus récent).

## Objectif

Qu'une réponse d'extracteur illisible (HTTP hors 2xx, sortie coupée, refus, enveloppe inattendue)
soit rejetée par le cœur sous un motif publié exact, `lecture_illisible`, portant la raison réelle,
au lieu d'arriver au cœur comme une chaîne vide rejetée en `json_invalide`.

## Contexte que tu ne peux pas deviner

- Lot extraction (décisions D52, D53, texte complet dans `docs/feuille-de-route.json`), trois PR
  fusionnées : #142 cœur pur (`pipeline/extraction/extraction.ts:extraireSource`), #143 éditeurs,
  #144 commande `pnpm extraire` (`pipeline/extraction/executer.ts`).
- D53 (2) : une sortie de modèle illisible ⇒ la source entière est refusée
  (`extraction_double_incomplete`). **Cette règle ne change pas.** Seul change le motif du rejet de
  portée `sortie` qui la précède.
- Le défaut actuel, décrit dans l'en-tête de `executer.ts` (point 4) et dans `sortieDe` :
  `extraireSource` n'accepte qu'une chaîne par modèle (`EntreeExtraction.sorties:
  ReadonlyMap<string, string>`), donc la commande lui passe `""` pour une lecture illisible ; le
  cœur publie `json_invalide`, qui est faux, et la vraie raison n'est qu'au journal
  (`reponseJournal`). Un garde dans `executer.ts:extraire` lève une erreur si une lecture illisible
  n'a pas refusé la source.
- La lecture d'une réponse est déjà typée : `LectureTexteModele` (défini dans
  `pipeline/reformulation/editeur.ts`, réexporté par `pipeline/extraction/editeur.ts`) =
  `{ lisible: true, texte } | { lisible: false, raison }`.
- Les motifs de rejet ne sont pas énumérés dans `docs/PROTOCOLE.md` : en ajouter un ne demande pas
  d'amendement. Ils le sont dans `pipeline/extraction/rejets.ts` (tableau d'en-tête),
  `lecture-sortie.ts:MotifRejetSortie` et `schema/journal-extraction.schema.json`.

## Conception attendue

1. Le cœur reçoit, par modèle, une sortie qui dit si elle est lisible :
   `EntreeExtraction.sorties: ReadonlyMap<string, SortieModele>` avec
   `SortieModele = { lisible: true; texte: string } | { lisible: false; raison: string }`. Le type
   vit côté cœur (`pipeline/extraction/types.ts` ou `extraction.ts`), le cœur n'importe rien de
   `reformulation/` ; `LectureTexteModele` doit lui être assignable sans conversion (vérifié par le
   typage, pas par un cast).
2. Dans `lireLesSorties`, une sortie illisible donne un `RejetSortie` de motif `lecture_illisible`,
   `detail` = la raison reçue, telle quelle. Une sortie lisible suit le chemin actuel (`lireSortie`)
   sans changement. Si les deux modèles échouent, chacun a son rejet (illisible pour l'un,
   `json_invalide` pour l'autre, par exemple), puis le rejet de source, comme aujourd'hui.
3. `executer.ts` : supprimer `sortieDe` et la chaîne vide, passer la lecture telle quelle ; mettre à
   jour le point 4 de l'en-tête. Le garde « une lecture illisible n'a pas refusé la source » : garde-le
   s'il reste une défense utile contre une régression du cœur, retire-le s'il est devenu impossible à
   déclencher par construction ; dis lequel et pourquoi dans le rapport.
4. Ajouter `lecture_illisible` au type des motifs de portée `sortie`, au tableau d'en-tête de
   `rejets.ts` et à l'énumération de `schema/journal-extraction.schema.json`. Le motif n'est **pas**
   ajouté à `lecture-sortie.ts:lireSortie`, qui ne lit que du texte : choisis où vit l'union
   (`MotifRejetSortie` élargi ou motif séparé) pour que `lireSortie` ne puisse pas le produire.
5. Corriger l'exemple `schema/exemples/journal-extraction/valide-02-refusee-sortie-illisible.json`
   pour qu'il montre `lecture_illisible`, et ajouter un exemple invalide si le schéma doit refuser
   une combinaison nouvelle (sinon n'en ajoute pas).

## Fichiers

À lire d'abord : `CLAUDE.md` ; `docs/PROTOCOLE.md` §4 ; `pipeline/extraction/extraction.ts`,
`rejets.ts`, `lecture-sortie.ts`, `executer.ts`, `editeur.ts`, `editeur-simule.ts` ;
`pipeline/reformulation/editeur.ts` (`LectureTexteModele`) ; `tests/extraction/extraction.test.ts`,
`commande.test.ts`, `aides.ts`, `aides-commande.ts`.

À modifier : les fichiers ci-dessus sous `pipeline/extraction/`, `schema/journal-extraction.schema.json`,
ses exemples, et les tests sous `tests/extraction/`. Tout appelant de `extraireSource` que le
typage signale.

À ne pas toucher : `pipeline/reformulation/` (y compris `LectureTexteModele`, partagé avec la
reformulation, et le motif `corps_illisible` de `proposition-formulation.schema.json`, qui est une
autre chaîne) ; `prompts/`, `config/`, `data/`, `docs/PROTOCOLE.md`, `docs/feuille-de-route.json`.

## Contraintes du protocole applicables

- Règle 7 : « Les réponses brutes sont immuables. » Rien ne change à l'écriture des réponses
  gardées ; la lecture reste en aval.
- Anti-pattern : « Valeurs par défaut silencieuses […] Une donnée absente doit être absente et
  visible, jamais remplacée par une valeur plausible. » La chaîne vide en est une : c'est l'objet de
  la PR.
- Complexité : cyclomatique ≤ 9, cognitive < 15, sans désactivation (compétence
  `complexite-maitrisee`).

## Cas limites à tester

1. Premier modèle illisible (HTTP 500), second lisible et conforme ⇒ rejet `sortie`
   `lecture_illisible` pour le premier avec la raison exacte, rejet `source`, aucun item ni mesure.
2. Même chose, second modèle illisible ⇒ symétrique (le rang n'est pas codé en dur).
3. Les deux illisibles ⇒ deux rejets `lecture_illisible`, un rejet de source.
4. Un illisible, l'autre lisible mais JSON invalide ⇒ `lecture_illisible` + `json_invalide` + source.
5. Lisible dont le texte est la chaîne vide ⇒ toujours `json_invalide` (le chemin lisible ne change
   pas).
6. Raison contenant guillemets typographiques et retour à la ligne ⇒ recopiée à l'identique dans
   `detail`.
7. Bout en bout par la commande simulée (`commande.test.ts`) : réponse HTTP non 2xx gardée ⇒ journal
   `refusee` validé par le schéma, avec `lecture_illisible`, et la réponse gardée inchangée.
8. Schéma : un journal portant `lecture_illisible` en portée `sortie` est valide ; le même motif en
   portée `item` est invalide.

## Ce qui ne doit pas bouger

- Le refus D53 (2) et le texte du rejet `extraction_double_incomplete`.
- `lireSortie` et ses motifs ; tous les tests existants des sorties lisibles.
- L'écriture, la reprise et le plafond de `pnpm extraire` ; le format des réponses gardées.
- Tout ce qui est sous `pipeline/reformulation/`.

## Définition de terminé

- `pnpm check && pnpm test` passent, lancés par toi (et `pnpm check:py && pnpm test:py` si un
  fichier lu par Python change, ce qui ne devrait pas être le cas).
- Chaque cas limite ci-dessus a un test nommé.
- Rien d'écrit hors des fichiers listés.
- Un commit sur la branche, message en français dans le style du dépôt (`extraction : …`), terminé
  par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pas de push, pas de PR : la session
  principale s'en charge.
- Rapport : ce qui a changé, le sort du garde de `executer.ts`, ce qui pourrait casser plus tard (deux
  lignes).

## Questions déjà tranchées

- Faut-il un amendement au protocole ? Non, les motifs n'y sont pas énumérés.
- Faut-il réécrire les journaux déjà produits ? Non : aucun `pnpm extraire` réel n'a tourné.
- Le nom du motif : `lecture_illisible`, sans variante par cause ; la cause est dans `detail`.
