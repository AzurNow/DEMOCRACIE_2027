# Brief — Gel, PR 3 : statuts du run, `run:invalider`, réexécution (D51)

## Agent

`codeur-opus`, isolation `worktree`, branche `lots/gel-statuts` créée depuis `main` (75e3857 ou plus
récent).

## Objectif

Qu'un run ait des transitions de statut écrites, testées et refusées nommément hors des chemins
admis : `planifie → en_cours` (fonction pure, appelée par l'interrogation en PR 4),
l'enregistrement d'une invalidation par `pnpm run:invalider`, l'inscription automatique de
l'invalidation par la notation quand les deux juges sont retirés (D16 (3)), et le lien d'une
réexécution vers le run qu'elle remplace, écrit au gel.

## Contexte que tu ne peux pas deviner

Décision **D51** de l'auteur (2026-10-16), option recommandée sur les quatre points :

1. **`planifie → en_cours` par l'interrogation.** `run:dry` / `run:live` écriront `en_cours` dans
   `run.json` avant la première tentative ; cela arrive en PR 4. Ici : la fonction de transition
   pure et testée, rien de plus. Elle refuse tout statut de départ autre que `planifie`, et un run
   qui porte une `invalidation`.
2. **Invalidation en deux temps.** L'invalidité est connue dès l'incident, avant le dépôt Zenodo ;
   or le schéma exige qu'un run `invalide` porte `publication` et `depot` (§12 : « un run invalide
   […] déclare sa publication et son dépôt comme tout run publié »). Donc :
   `pnpm run:invalider` écrit `invalidation: { motif, date }` et **laisse le statut inchangé**
   (`planifie` ou `en_cours`). Le passage au statut `invalide` se fera avec le dépôt, dans une PR
   de publication ultérieure : **hors périmètre ici**. Un run qui porte `invalidation` est refusé
   par la notation et par `pnpm go-no-go`. Le schéma s'ajuste : `invalidation` est permise pour
   `planifie`, `en_cours` et `invalide` (exigée pour ce dernier, comme aujourd'hui), interdite pour
   `publie` et `publie_provisoire` ; `invalidation.date` (instant) devient exigé.
3. **Pointeur arrière au gel.** Un run de `type_run` `reexecution` porte `run_remplace_id` (ULID),
   exigé pour ce type et interdit pour les autres. `pnpm geler --remplace=<id>` l'écrit, après avoir
   vérifié que `runs/` contient un run de cet `id` qui porte une `invalidation` ; `--remplace` sans
   `--type-run=reexecution`, ou l'inverse, est refusé. Le run invalidé n'est jamais réécrit par le
   gel. `invalidation.run_remplacant_id` reste dans le schéma, facultatif, et **aucun code ne
   l'écrit** dans cette PR.
4. **Invalider depuis `planifie` ou `en_cours` seulement.** `publie`, `publie_provisoire` et
   `invalide` : refus nommé. Un défaut découvert après publication serait un erratum, que le
   protocole ne prévoit pas.

Vocabulaire : `run.json` est le fichier de tête du run sous `runs/<date>/` ; le gel l'écrit
(`pipeline/gel/`), la notation et le go/no-go y fusionnent des champs (modèle d'écriture :
`pipeline/notation/inscription-contrefactuel.ts`, validation contre le schéma puis fichier
temporaire synchronisé et renommé).

Le D16 (3) : quand les deux juges dépassent 3 % au test contrefactuel, « la notation du run
s'arrête et le run est marqué invalide, avec cette raison » (§7). Aujourd'hui
`inscrireContrefactuel` lève `InscriptionImpossible` faute de pouvoir écrire `invalide`. Avec D51,
la notation inscrit le test contrefactuel **et** `invalidation { motif: <raison>, date }`, statut
inchangé, en une seule écriture validée.

## Fichiers

- À lire d'abord : `CLAUDE.md`, `schema/run.schema.json` (`statut`, `invalidation`, `type_run`, le
  `allOf` final), `pipeline/gel/geler.ts`, `pipeline/gel/precedent.ts` (lecture des autres runs de
  `runs/`), `outils/geler.ts` (analyse des arguments), `pipeline/notation/inscription-contrefactuel.ts`,
  `pipeline/notation/chaine.ts` (issue `run_invalide`), `pipeline/go-no-go/go-no-go.ts` (`refuser`),
  `outils/notation-dry.ts`, `runs/README.md`, `tests/gel/`.
- À créer : `pipeline/run/statut.ts` (transitions pures : `demarrer`, `invalider`, refus typés),
  l'écriture mince à côté (ou réutilise celle de l'inscription si tu la factorises),
  `outils/run-invalider.ts`, script `run:invalider` dans `package.json`, tests sous `tests/run/`.
- À modifier : `schema/run.schema.json` et `schema/exemples/` concernés, `pipeline/gel/`
  (`--remplace`, `run_remplace_id`), `outils/geler.ts`, `pipeline/notation/inscription-contrefactuel.ts`
  et `chaine.ts` (D16 (3) inscrit l'invalidation ; refus d'un run qui porte `invalidation`),
  `pipeline/go-no-go/go-no-go.ts` (refus), `runs/README.md`, `docs/feuille-de-route.json` (ajoute
  D51, ci-dessous, et `"D51"` aux décisions du lot `gel`).
- À ne pas toucher : `data/`, `docs/PROTOCOLE.md`, `prompts/`, `config/perimetre.yaml`,
  `config/gel.json`, `outils/run-dry.ts` et `pipeline/interrogation/` (PR 4).

Entrée D51 à ajouter telle quelle à `decisions` de `docs/feuille-de-route.json` :

```json
{
  "id": "D51",
  "statut": "tranchee",
  "question": "Statuts du run (PR 3 du lot gel) : qui écrit en_cours, comment enregistrer une invalidation connue avant le dépôt Zenodo, comment relier une réexécution au run invalidé, depuis quels statuts invalider.",
  "contexte": "Personne n’écrit en_cours. Le schéma exige d’un run invalide sa publication et son dépôt (§12), inconnus au moment de l’incident ; la notation lève donc InscriptionImpossible en D16 (3). Le seul lien est invalidation.run_remplacant_id, inconnu à l’invalidation.",
  "options": [
    "(1) en_cours écrit par l’interrogation avant la première tentative ; invalidation {motif, date} enregistrée tout de suite, statut inchangé, invalide écrit avec le dépôt ; run_remplace_id exigé d’une reexecution et écrit au gel ; invalider depuis planifie ou en_cours seulement.",
    "Variantes : commande pnpm run:demarrer ; invalide écrit en une fois avec le dépôt ; pointeur avant rempli après ; invalider aussi après publication."
  ],
  "recommandation": "Option 1 sur les quatre points.",
  "retenu": "Option 1 sur les quatre points. Dans la PR 3 du lot gel ; à écrire aux §6 et §12.",
  "date_decision": "2026-10-16"
}
```

Puis `pnpm feuille-de-route` pour régénérer `docs/FEUILLE-DE-ROUTE.md`.

## Contraintes du protocole applicables

- §6 : « Si un incident technique invalide un run, le run entier est réexécuté et les deux runs sont
  publiés, le premier marqué invalide avec la raison. »
- §7, D16 (3) : « Si les deux juges dépassent 3 %, la notation du run s'arrête et le run est marqué
  invalide, avec cette raison (section 12). »
- §12 : « un run invalide ne porte aucune décision de publication, mais déclare sa publication et
  son dépôt comme tout run publié ».
- Règle 7 : rien n'est réécrit en silence. Une `invalidation` déjà présente n'est jamais écrasée :
  identique (forme canonique) ⇒ rien n'est écrit, l'issue le dit ; différente ⇒ refus.
- Aucune valeur par défaut silencieuse. `--motif` est obligatoire et non vide. La date
  d'invalidation est l'horloge au moment de la commande, injectée dans la fonction pure pour les
  tests ; elle est refusée si elle précède `date_gel`.
- Aucun `if` propre à un outil ou à un candidat. Complexité : cyclomatique ≤ 9, cognitive < 15 ;
  compétence `complexite-maitrisee`.

## Cas limites à tester

1. `demarrer` : `planifie` ⇒ `en_cours` ; `en_cours`, `publie`, `publie_provisoire`, `invalide` ⇒
   refus nommé ; `planifie` portant une `invalidation` ⇒ refus nommé.
2. `run:invalider` sur `planifie` et sur `en_cours` ⇒ `invalidation {motif, date}` écrite, statut
   inchangé, `run.json` valide au schéma.
3. `run:invalider` sur `publie`, `publie_provisoire`, `invalide` ⇒ refus nommé, rien d'écrit.
4. Deuxième `run:invalider` au même motif et à la même date ⇒ rien n'est écrit, issue « déjà
   inscrite » ; motif différent ⇒ refus, fichier intact (octets identiques).
5. `--motif` absent ou vide ; date d'invalidation avant `date_gel` ; exactement à `date_gel`
   (dis ce que tu choisis et pourquoi, en t'alignant sur la convention semi-ouverte du dépôt).
6. Schéma : `invalidation` sur `publie` ⇒ invalide ; sur `invalide` sans `date` ⇒ invalide ;
   `reexecution` sans `run_remplace_id` ⇒ invalide ; `run_remplace_id` sur un `hebdomadaire` ⇒
   invalide.
7. Gel `--type-run=reexecution --remplace=<id>` : run trouvé avec invalidation ⇒ écrit ; run
   introuvable, run sans invalidation, `--remplace` sans `reexecution`, `reexecution` sans
   `--remplace` ⇒ refus nommés, avant tout appel réseau, rien d'écrit. Le run remplacé : octets
   identiques après le gel.
8. Notation D16 (3) (deux juges retirés) : `run.json` porte le contrefactuel et l'invalidation
   (motif = la raison), statut inchangé ; relancée ⇒ reprise sans réécriture.
9. Notation sur un run qui porte déjà une `invalidation` (posée par `run:invalider`) ⇒ refus avant
   toute écriture. `pnpm go-no-go` sur un tel run ⇒ `GoNoGoRefuse`.
10. Le choix du précédent au gel (`precedent.ts`) saute toujours un run `en_cours` invalidé (test
    de non-régression).

## Ce qui ne doit pas bouger

- `pnpm symmetry`, `pnpm run:dry`, `pnpm notation:dry` passent, comportements inchangés hors D16 (3).
- Aucune assertion affaiblie ; `git diff` filtré sur `expect` : ajouts seulement, sinon justifiés
  (les tests D16 (3) qui attendaient `InscriptionImpossible` changent d'attendu : dis-le).
- `go-no-go` n'écrit toujours jamais `statut`.

## Définition de terminé

- `pnpm check && pnpm test`, `pnpm run:dry` et `pnpm notation:dry` passent, lancés par toi
  (binaires de `/Users/azur_now/Code/PROJETS_CODE/DEMOCRACIE_2027/node_modules/.bin` dans le PATH,
  aucun lien symbolique créé).
- Chaque cas limite a un test nommé. Aucune dépendance ajoutée.
- Un commit sur `lots/gel-statuts`, en français, terminé par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ne pousse pas, n'ouvre pas de PR.
- Rapport : fait, écarts et pourquoi, trous du protocole, deux lignes sur ce qui pourrait casser,
  SHA du commit.

## Questions déjà tranchées

- D51, option 1 sur les quatre points, comme ci-dessus.
- Pas de commande `run:publier` ni d'écriture du statut `invalide`, `publie` ou `publie_provisoire`
  dans cette PR.
- Si le protocole ou un schéma contredit ce brief : arrête-toi sur ce point, dis-le, continue le reste.
