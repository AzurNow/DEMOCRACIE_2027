# Dette et risques de casse

Journal des points qui peuvent casser plus tard **à cause de ce qui a été implémenté**. Une entrée
par session, la plus récente en tête. Un point n'est retiré que lorsqu'il est réglé : on barre la
ligne et on dit par quoi.

Ce fichier ne recense pas les bugs ouverts ni les fonctionnalités manquantes : seulement les
décisions dont la facture arrivera plus tard. Les trous du protocole lui-même (ce qui demande un
amendement §9) vivent à côté du code concerné — pour les schémas, en fin de `schema/README.md`.

Convention de gravité : **haute** = casse silencieuse d'une mesure publiée · **moyenne** = casse
visible, coûteuse à réparer · **basse** = friction.

---

## 2026-09-18 — Feuille de route générée (`docs/feuille-de-route.json`, `outils/feuille-de-route/`)

### 1. Le niveau de preuve d'un lot est déclaré, jamais mesuré — *moyenne*

`docs/feuille-de-route.json` porte pour chaque lot un `niveau` T0 à T4 saisi à la main par la
session principale. Rien ne le confronte au dépôt : un lot marqué T2 sans test, ou laissé à T0
après une session qui l'a livré, produit un graphe faux et des états « débloqué » ou « bloqué »
faux en cascade, puisque `graphe.ts:calculerEtats()` ne raisonne que sur ces niveaux.

**Pourquoi ça casse.** Une session qui saute la clôture laisse le niveau d'un lot en retard ; la
suivante lit « bloqué par outillage » alors que l'outillage est livré, et n'ouvre pas un lot qui
pouvait démarrer. Aucun chiffre publié n'en dépend, mais le pilotage du calendrier du §12 en
dépend entièrement, et seule une relecture du dépôt le révèle.

**Ce qu'il faut faire.** La procédure de clôture exige désormais de mettre à jour le niveau des
lots touchés et de régénérer le Markdown (`.claude/skills/cloture-de-session/SKILL.md`, étape 6).
Aller plus loin — dériver T2 de l'existence d'un fichier de test nommé — est une décision à
prendre quand le pipeline existera, pas avant.

### 2. Un Markdown périmé peut être commité — *basse*

`pnpm feuille-de-route --verifier` existe mais n'est branché ni sur `pnpm check` ni sur une CI.
Éditer le JSON sans relancer le générateur laisse `docs/FEUILLE-DE-ROUTE.md` en retard d'une
version, et c'est lui que GitHub affiche.

**Pourquoi ça casse.** L'auteur lit sur GitHub un graphe qui ne correspond plus au JSON que
l'agent lit. Les deux « sources » divergent, exactement ce que le générateur devait empêcher.

**Ce qu'il faut faire.** Brancher `--verifier` sur `pnpm check` dans le lot `outillage`, en même
temps qu'ajv. Le script tourne en moins d'une seconde et ne dépend de rien.

### 3. Une barre verticale dans un titre de lot casse le tableau — *basse*

`markdown.ts` assemble les lignes du tableau des lots par jointure sur ` | ` sans échapper le
caractère `|` dans les titres, notes et agents. Aucun titre actuel n'en contient.

**Pourquoi ça casse.** Le jour où un titre en contient un, la ligne se scinde en colonnes
supplémentaires et GitHub affiche un tableau décalé. Visible dès la lecture.

**Ce qu'il faut faire.** Échapper `|` en `\|` dans une fonction de cellule unique, avec un test
sur un titre contenant une barre. À faire au prochain passage sur le générateur.

---

## 2026-09-18 — Décisions de validation reportées dans le protocole (`docs/PROTOCOLE.md` v0.2)

### 1. Le protocole promet trois comportements que le code n'a pas — *moyenne*

Le §4 décrit désormais la réannotation par lot supersédant (« Réannotation »), le registre des
corrections de mesure lu par `promote` (« Correction de thème ») et le suivi du taux de « non
évaluable » par annotateur. Aucun des trois n'est implémenté : `pnpm lots` n'a pas de `--reannote`,
`pnpm mesures` n'existe pas, `promote` ne lit aucun registre et ne connaît pas la supersession.

**Pourquoi ça casse.** Si un lot est réannoté avant que la supersession existe, le journal, indexé
par item, porte deux décisions par annotateur pour les mêmes items, et `promote` promeut sur une
paire dont on ne sait pas de quel lot elle vient ; le kappa publié au titre du §12 peut être celui
du lot supersédé. Rien ne l'arrête : le protocole affirme une règle que le dépôt ne tient pas, et
seul un lecteur qui compare le §4 au code s'en apercevrait.

**Ce qu'il faut faire.** Implémenter les trois, dans l'ordre déjà écrit au point 2 bis de l'entrée
du 2026-09-17, **avant** le premier lot réel du 15 novembre. Tant que ce n'est pas fait, ne pas
réannoter un lot.

---

## 2026-09-17 — Interface locale de validation humaine (`validation/`, `outils/`, `tests/`)

### 1. Le client n'est couvert par aucun test, et il redéclare des constantes du domaine — *moyenne*

Les 8 900 lignes livrées sont testées côté domaine, IO et routes (120 tests), mais rien n'exerce
`validation/client/`. Deux points précis : `app.ts:grilleComplete()` réécrit à la main la liste des
cinq clés de la grille, que `domaine/grille.ts:CLES_GRILLE` détient déjà ; et `source.ts:rendreTexte()`
découpe le texte canonique en **points de code** aux offsets reçus du serveur, convention qui ne vit
que dans `docs/CONTRATS.md`.

**Pourquoi ça casse.** Un extracteur qui livrerait des offsets en unités UTF-16 ferait surligner un
passage décalé de quelques caractères sur toute source contenant un caractère hors du plan de base.
L'annotateur compare alors la citation à la mauvaise portion de la source et valide ce qu'il croit
avoir lu. Aucun test, aucune alerte : le seul symptôme est un surlignage qui « tombe à côté », que
trente heures de fatigue rendent facile à ignorer.

**Ce qu'il faut faire.** Faire importer `CLES_GRILLE` au client plutôt que de la recopier — le
serveur l'envoie déjà dans `vue.questions`. Et ajouter un test de `rendreTexte` sur une source
contenant un emoji, sur le modèle de `tests/verbatim.test.ts`, ce qui suppose de choisir un
environnement DOM pour Vitest, donc une dépendance : décision à prendre, pas à prendre seul.

*Décision du 2026-09-18 : pas d'environnement DOM. Extraire vers `domaine/` la logique pure du
client (découpage aux offsets, parseur WebVTT) et la tester comme `verbatim.ts`, avec le cas emoji.
Ce que les tests ne verront pas (focus clavier, page du PDF, ordre des boutons) fait l'objet d'une
liste de contrôle manuelle versionnée, courte, à dérouler avant la campagne d'annotation.*

### 2. Une correction de thème peut retenir un item indéfiniment — *moyenne*

`domaine/promotion.ts:correctionDeMesureEnAttente()` retient tout item dont une décision demande un
thème que la mesure ne porte pas encore. La commande qui appliquerait la correction au référentiel,
`pnpm mesures`, n'existe pas, et rien n'exprime un **refus** de l'auteur : une demande non satisfaite
et une demande refusée sont indiscernables dans les données.

**Pourquoi ça casse.** Les deux annotateurs corrigent le thème d'un item, l'auteur estime le thème
d'origine correct, et l'item reste en `correction_mesure_en_attente` à chaque exécution de
`pnpm promote` — jamais promu, jamais arbitré. Il sort du jeu de données sans décision. Si cela
frappe plusieurs items d'un même candidat, sa couverture passe sous le seuil de 10 items P du §4 et
il est rapporté « couverture insuffisante » pour une raison qui n'a rien à voir avec ses positions.
C'est visible dans le rapport de `promote` (`En attente : correction_mesure_en_attente : N`), à
condition de le lire.

**Ce qu'il faut faire.** Écrire `pnpm mesures`, et décider comment un refus s'enregistre — vraisem-
blablement en envoyant l'item en arbitrage, comme tout autre désaccord.

*Décision du 2026-09-18, reportée au §4 du protocole (« Correction de thème »).* Un refus est une
décision tracée. `pnpm mesures` écrit un registre en ajout seul, `validation/mesures/decisions.json`
(mesure, thème demandé, décision acceptée ou refusée, date, motif obligatoire sur un refus).
`promote` lit ce registre : acceptée **et** mesure portant effectivement le thème demandé →
promotion ; acceptée sans mesure modifiée → erreur bloquante ; refusée → arbitrage avec le motif
`correction_mesure_refusee` ; absente → attente, listée à part dans le rapport avec son âge en
jours. Jamais de refus implicite au bout de N jours.

### 2 bis. Rien ne relie un lot de réannotation à son lot d'origine — *moyenne*

Relevé le 2026-09-18. `Lot.reannote` est déclaré dans `domaine/types.ts` et affiché par le client,
mais aucun code ne le remplit : `pnpm lots` n'a pas de drapeau pour le poser. Le §12 fait du kappa du
lot final un critère go/no-go, et le lien entre les deux kappas d'un même lot n'est enregistré nulle
part.

**Pourquoi ça casse.** Un lot réannoté produit deux jeux de décisions pour les mêmes items dans un
journal indexé par item. Sans lien ni règle de supersession, `promote` peut mélanger une décision du
lot d'origine et une décision du lot de réannotation, et le kappa « du lot » est ambigu.

**Ce qu'il faut faire.** *Décision du 2026-09-18, reportée au §4 (« Réannotation »).* Ajouter
`--reannote=lot-XXX` à `pnpm lots`, qui exige une date de séance de calibration, crée un lot de
nature `reannotation` avec les mêmes items et remplit le champ. `promote` prend les décisions du
lot de réannotation et ignore celles du lot supersédé, qui reste publié mais ne compte plus. Aucun
bouton dans l'interface : l'alerte informe, l'auteur agit.

### 3. Deux règles nouvelles ne vivent que dans le code, pas dans les schémas — *basse*

`source.texte_sha256` et `absence.confirmation_initiale` ont été ajoutés en **facultatifs**, pour ne
pas invalider les 45 exemples de `schema/exemples/` ni brouiller les motifs de rejet que les fichiers
`invalide-*` sont censés isoler. L'obligation vit donc ailleurs : l'interface refuse d'afficher une
source sans texte canonique, et `promote` refuse de promouvoir un item A sans confirmation.

**Pourquoi ça casse.** Un item A écrit à la main dans `data/`, ou par un futur script, passe la
validation de schéma sans confirmation d'absence — c'est-à-dire sans la double confirmation que le §4
exige pour qu'une absence existe. Le contrôle est réel mais il est dans `promote`, que ce chemin-là
contourne.

**Ce qu'il faut faire.** Ajouter les conditionnelles au schéma (`verifie` + type `A` ⇒
`confirmation_initiale` requise) en même temps que le validateur de schémas du point 3 de l'entrée
« JSON Schema » ci-dessous : même lot, et les exemples se corrigent une seule fois.

### 4. La facture de la règle de complexité est désormais exigible — *basse*

L'entrée « Règle de complexité » ci-dessous annonçait le risque du report. Il s'est réalisé : le
dépôt contient maintenant 8 900 lignes écrites sans qu'aucun outil ne mesure quoi que ce soit.
J'ai compté les branches à la main et découpé quatre fonctions qui dépassaient (`construireItems`
des fixtures, les deux `lireOptions` des outils, `reinitialiserSaisie` du client), mais un comptage
manuel ne se rejoue pas.

**Pourquoi ça casse.** Pas de nombre faux. Le coût est que la mise en conformité, quand ESLint sera
branché, tombera d'un coup sur du code déjà écrit — dont `domaine/promotion.ts` et
`domaine/analyse-lot.ts`, c'est-à-dire là où un refactoring est le plus risqué.

**Ce qu'il faut faire.** Brancher `complexity` et `sonarjs/cognitive-complexity` sur `pnpm check`
maintenant que le socle TypeScript existe, plutôt qu'après le prochain millier de lignes.

*Décision du 2026-09-18 : ESLint, typescript-eslint et eslint-plugin-sonarjs autorisés, dans un
commit séparé de celui d'ajv, avec exactement deux règles actives en erreur : `complexity` à 9 et
`sonarjs/cognitive-complexity` à 15. Pas de preset « recommended », pas de règle de style. Toute
règle supplémentaire est une décision séparée.*

*Règle partiellement le point 1 de l'entrée « JSON Schema » ci-dessous : l'invariant « les deux
validations concordantes portent sur la même version » est désormais gardé par
`domaine/promotion.ts:memeVersionJugee()` et deux tests. Les trois autres invariants restent
non gardés.*

---

## 2026-09-17 — Stockage hors Git du volume des runs (`schema/run.schema.json`, `schema/tirage.schema.json`)

### 1. La reproductibilité dépend désormais d'un service tiers — *moyenne*

Les réponses brutes et les notations individuelles quittent Git pour une archive Zenodo, référencée
par DOI et SHA-256 depuis `run.depot`. Sans ce changement le dépôt aurait atteint plusieurs
gigaoctets et cessé d'être clonable ; avec lui, la commande unique de reproductibilité du §9 dépend
de la disponibilité de Zenodo.

**Pourquoi ça casse.** Si un dépôt Zenodo devient inaccessible, les métriques d'un run publié ne
sont plus rejouables, alors que Git continue d'affirmer qu'elles le sont. L'empreinte permet de
détecter une archive altérée, pas d'en retrouver une disparue.

**Ce qu'il faut faire.** Décider d'un second exemplaire — miroir sur un autre dépôt à DOI, ou copie
froide hors ligne — et le dire dans le rapport de run. Zenodo est adossé au CERN et annonce une
conservation longue, ce qui rend le risque faible mais pas nul pour un projet dont l'auditabilité
est l'unique actif.

### ~~2. `run.tirage[]` en tableau intégré~~ — réglé le 2026-09-17 par la sortie du tirage dans `tirage.schema.json`, référencé par chemin et empreinte

---

## 2026-09-17 — Règle de complexité (`CLAUDE.md`, `.claude/skills/complexite-maitrisee/`)

### 1. Aucun outil ne mesure la complexité, et la règle porte sur du code qui n'existe pas — *basse*

Les seuils — 9 en cyclomatique, 15 en cognitive — sont écrits dans `CLAUDE.md`, et la façon de s'y
conformer dans la compétence `complexite-maitrisee`. Rien ne le mesure : il n'y a ni `package.json`, ni ESLint, ni Ruff dans le
dépôt, et `pnpm check` n'existe pas encore. Les configurations sont prêtes à coller dans
`.claude/skills/complexite-maitrisee/references/outillage.md`, non installées.

**Pourquoi ça casse.** Pas de nombre faux : une fonction trop branchue ne ment pas, elle coûte. Le
risque réel est le report — la règle s'appliquera à des milliers de lignes écrites sans contrôle, et
la mise en conformité tombera d'un coup sur le code de notation et de métriques, c'est-à-dire là où
un refactoring est le plus risqué.

**Ce qu'il faut faire.** Brancher `complexity` (ESLint), `sonarjs/cognitive-complexity` et `C901`
(Ruff) sur `pnpm check` en même temps que le validateur de schémas du point 3 ci-dessous : même
décision, même lot de dépendances. D'ici là, mesurer à la main sur les fonctions de calcul.

---

## 2026-09-17 — Mécanisme de clôture de session (`.claude/skills/cloture-de-session/`)

### 1. Rien ne vérifie que la clôture a eu lieu — *basse*

`CLAUDE.md` pointe vers la compétence `cloture-de-session`, et la compétence décrit la procédure.
Mais aucun contrôle automatique ne vérifie qu'une session ayant modifié du code a bien complété
`docs/DETTE.md`. Un contributeur humain, ou un agent qui ne lit pas `CLAUDE.md`, ne verra rien.

**Pourquoi ça casse.** Pas de nombre faux : le journal cesse simplement d'être fiable, et un journal
incomplet est plus trompeur qu'un journal absent — on le croit exhaustif.

**Ce qu'il faut faire.** Décider si un contrôle en intégration continue (une entrée datée du jour
quand le diff touche `pipeline/`, `analysis/` ou `schema/`) vaut sa rigidité. Décision à prendre,
pas à prendre seul : un contrôle trop strict pousse à écrire des entrées vides pour le satisfaire.

---

## 2026-09-17 — JSON Schema des objets du projet (`schema/`)

### 1. Les invariants inter-fichiers ne sont vérifiés par personne — *haute*

JSON Schema valide un fichier à la fois. Quatre cohérences essentielles échappent donc aux schémas
et ne sont aujourd'hui garanties par aucun test :

- `question.grappe_id` doit être l'item marqué `principal` dans `question.items[]` ;
- `notation.contexte` et `verdict.contexte` doivent valoir celui de l'objet noté ;
- tout item de type `F` doit pointer une mesure dont `fictive` vaut `true` ;
- les deux validations concordantes d'un item doivent porter sur la **même version** de cet item.

**Pourquoi ça casse.** Une divergence sur `grappe_id` fausse les grappes du bootstrap (§8) et donc
tous les intervalles de confiance publiés, sans qu'aucune validation n'échoue. Un `contexte` mal
recopié fait entrer une réponse contrefactuelle dans une métrique primaire.

**Ce qu'il faut faire.** En faire des tests bloquants au moment d'écrire le pipeline, dans le même
lot que les tests de symétrie. Tant que ce n'est pas fait, aucune métrique publiée n'est fiable.

### ~~2. L'épinglage `version` + `empreinte` durcit toute correction d'item~~ — réglé le 2026-09-18 par la définition du contenu notant au §4 du protocole

La liste des champs entrant dans l'empreinte est figée et écrite dans le protocole : type, candidat,
mesure et sa version, dates de validité, position, citation normalisée, quantification, empreinte de
la source, corpus examiné pour un item A, date de changement et deux états pour un item O. La
**paraphrase est exclue** : corriger une coquille de paraphrase ne change plus l'empreinte ni la
reprise à 80 % du §5. Reste vrai, et voulu : corriger une citation ou une quantification change
l'empreinte, parce que c'est contre elles qu'une réponse a été jugée. Implémentation :
`validation/domaine/empreinte.ts:empreinteContenuNotant()`.

### 3. Les exemples ne sont pas encore exécutés en intégration continue — *moyenne*

`schema/exemples/manifeste.json` est une table de vérité complète (45 exemples, résultat attendu et
règle du protocole testée), vérifiée une fois à la main avec `jsonschema` 4.26. Aucun runner n'est
branché sur `pnpm check`.

**Pourquoi ça casse.** Un schéma assoupli par mégarde ne fera échouer aucun test. Les exemples
invalides sont les seuls gardiens des règles du protocole encodées dans les schémas.

**Ce qu'il faut faire.** Brancher un validateur sur `pnpm check`. Suppose de choisir un validateur
côté TypeScript, donc une dépendance : décision à prendre, pas un raccourci à prendre seul.

*Décision du 2026-09-18 : ajv et ajv-formats autorisés, dans leur propre commit, avant ESLint. Les
45 exemples du manifeste deviennent des tests bloquants de `pnpm check`. `jsonschema` côté Python
n'est plus installé sur la machine, le runner TypeScript est donc le seul.*

### 4. `commun.schema.json` crée un couplage fort — *basse*

Les neuf schémas référencent une bibliothèque `$defs` commune par URN. Tout validateur doit charger
les dix fichiers dans un registre ; un schéma pris isolément ne se résout pas.

**Pourquoi ça casse.** Un outil tiers qui charge `item.schema.json` seul échouera sans message
clair. En contrepartie, les dix thèmes et les six gabarits ne peuvent pas diverger entre fichiers —
le couplage est le prix de cette garantie, et il est assumé.
