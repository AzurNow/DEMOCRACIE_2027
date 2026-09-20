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

## 2026-09-20 — Lot schemas-decision : `decision` et `decision-mesure` au registre, manifestes de lots validés (`schema/`, `outils/schemas/`, `validation/io/`)

### 1. Le journal de validation est gardé par ses exemples, pas par le code qui l'écrit — *moyenne*

`decision.schema.json` est au registre ajv avec six exemples, et `pnpm check` les vérifie. Ce qui
manque est le lien entre le schéma et le code : `JournalAnnotateur.ajouter()` sérialise ce que le
type `EntreeJournal` de `validation/domaine/types.ts` accepte, `analyser()` recaste sans valider, et
les six exemples ont été écrits à la main d'après le schéma. Schéma et exemples restent donc
d'accord entre eux pendant que le code peut s'en éloigner. `decision-mesure`, lui, a la paire
`validerEntreeRegistre()` + test d'accord.

**Pourquoi ça casse.** Ajouter un champ à `EntreeDecision` — une sixième question spécifique, par
exemple — compile, s'écrit dans les journaux, et `additionalProperties: false` rend alors non
conforme à son propre schéma publié un journal que le §9 publie précisément pour qu'un tiers le
vérifie. `pnpm check` reste vert : rien n'y confronte une entrée **produite par le code** à son
schéma.

**Ce qu'il faut faire.** Le test d'accord écrit pour `decision-mesure`, transposé : fabriquer une
`EntreeDecision`, une `EntreeAnnulation` et un `EntreeRetrait` depuis `tests/aides/fabriques.ts`,
les valider contre `urn:banc-essai-2027:schema:decision`. Suppose le point 3 corrigé d'abord.
Valider à l'écriture dans `ajouter()` serait plus fort, mais mettrait ajv dans le chemin d'exécution
de l'interface de validation : à trancher seulement si le test ne suffit pas.

### 2. `lireLot()` refuse désormais un manifeste que `ecrireLot()` accepte d'écrire — *moyenne*

La validation ajoutée cette session est en lecture seule. `ecrireLot()` écrit tout objet `Lot` que
le type TypeScript accepte, et un manifeste n'est jamais réécrit (`LotDejaExistant`,
`docs/CONTRATS.md` §4). Aujourd'hui `pnpm lots` compose toujours un lot complet ; rien ne garantit
que le prochain appelant le fera.

**Pourquoi ça casse.** Un lot de nature `reannotation` composé sans `date_calibration` s'écrit sans
broncher, puis devient illisible au premier `lireLot()` : le fichier est à la fois invalide et
censé ne jamais être réécrit. La réparation suppose de violer l'immutabilité du manifeste ou de
jeter un lot dont la graine et la composition étaient la garantie de reproductibilité du kappa.

**Ce qu'il faut faire.** Appeler la même validation dans `ecrireLot()`, avant l'écriture, le jour où
un second appelant que `pnpm lots` apparaît. Les fonctions existent déjà (`validerNature`,
`validerReannotation`) : c'est un appel, pas un mécanisme.

### 3. La moitié des identifiants de fixtures reste hors de l'alphabet Crockford — *basse*

Cette session a corrigé les identifiants de **mesure** des fabriques de test (`I` et `U`, hors
Crockford base32) parce que le schéma neuf les refusait. Ceux des **items** portent le même défaut
et n'ont pas été touchés : `01JBANCESSAI00000000ITEM04`, `01JBANCESSAI00000ITEM${rang}`. Rien ne les
valide aujourd'hui.

**Pourquoi ça casse.** Le jour où un test confronte une fixture d'item à `item.schema.json`, ou une
entrée de journal fabriquée à `decision.schema.json` — exactement ce que demande le point 1 —, il
échoue sur la forme de l'identifiant avant d'atteindre la règle qu'il visait. Le lecteur du test
conclut que la règle est fausse. La demi-correction d'aujourd'hui aggrave le piège : elle fait
croire que les identifiants restants sont volontaires.

**Ce qu'il faut faire.** Les corriger dans le lot qui écrira le test d'accord du journal, pas avant :
un renommage de fixtures isolé ne se relit pas et ne prouve rien.

---

## 2026-09-19 — Lot dette-validation : réannotation, registre des mesures, logique pure du client (`validation/domaine/`, `outils/`, `validation/client/`)

### 1. Deux kappas coexistent pour un même lot, et rien ne choisit encore lequel compte — *haute*

Le §4 dit : « le kappa retenu pour les critères de la section 12 est celui du lot de réannotation ».
Depuis cette session, un lot peut être supersédé, donc deux kappas existent pour les mêmes items.
`domaine/analyse-lot.ts:diagnostiquerLot()` les calcule tous les deux, volontairement, et **aucun
code ne sélectionne le dernier maillon** : le dépôt n'évalue pas encore les critères du §12.

**Pourquoi ça casse.** Le lot qui écrira les critères go/no-go lira la liste des lots et en tirera un
kappa. S'il ne filtre pas sur `domaine/lot.ts:supersediteurDe(lots, lot_id) === null`, le kappa du
lot supersédé — celui qui, précisément, était sous 0,80 et a motivé la réannotation — entre dans un
critère de publication et dans les diagnostics publiés au titre du §9. Aucun test ne tombe : les
deux kappas sont justes, c'est le choix entre eux qui est faux.

**Ce qu'il faut faire.** Dans le lot go/no-go, filtrer sur `supersediteurDe(...) === null` et nulle
part ailleurs, et ne jamais recalculer un kappa hors de `diagnostiquerLot`. Les données pour le
faire existent désormais : `Lot.reannote`, `supersediteurDe`, `lotsApresSupersession`.

### ~~2. La supersession repose sur un champ de manifeste que rien ne valide à l'écriture~~ — réglé le 2026-09-20 par la validation de `lireLot()`

`promote` ne déduit la chaîne de supersession que du champ `reannote` des manifestes de
`validation/lots/`. Un lot de réannotation écrit à la main sans ce champ redonne deux jeux de
décisions pour les mêmes items ; un `reannote` pointant un identifiant absent lève `LotIntrouvable`.

**Pourquoi ça casse.** Le manifeste est immuable une fois écrit (`docs/CONTRATS.md` §4) : un champ
oublié se répare en réécrivant un fichier censé ne jamais l'être. Le symptôme n'apparaît qu'au
lancement de `promote`, longtemps après la séance d'annotation.

**Ce qu'il faut faire.** Valider le champ à la lecture dans `validation/io/lots-fichier.ts:lireLot()`,
en même temps que le schéma du registre du point 3 : un lot de nature `reannotation` sans `reannote`
ni `date_calibration` est un manifeste invalide, pas un lot ordinaire. *Fait ; reste le versant
écriture, entrée du 2026-09-20, point 2.*

### ~~3. Le registre des corrections de mesure n'est gardé par aucun schéma~~ — réglé le 2026-09-20 par `schema/decision-mesure.schema.json` et le test d'accord

`validation/mesures/decisions.json` est publié au titre du §9, et sa forme n'est tenue que par
`domaine/corrections-mesure.ts:validerEntreeRegistre()`, écrite à la main. Aucun des 45 exemples ne
le concerne, `pnpm check` ne le regarde pas.

**Pourquoi ça casse.** C'est exactement le défaut déjà relevé au point 5 de l'entrée du 2026-09-18
pour `decision.schema.json` : un champ renommé ne fait échouer que la commande qui le lit. Deux
objets publiés échappent maintenant à la validation de schéma, là où les neuf autres sont couverts.

**Ce qu'il faut faire.** Un seul petit lot : `schema/decision-mesure.schema.json` et
`decision.schema.json` enregistrés, leurs exemples au manifeste, `mesures-fichier.ts` validant
contre le schéma. À faire avant le premier lot réel du 15 novembre.

### 4. Un registre en tableau JSON se réécrit en entier à chaque ajout — *basse*

« Ajout seul » est ici une propriété du module — `validation/io/mesures-fichier.ts` n'expose ni
modification ni suppression — et non du format : ajouter une entrée réécrit le fichier entier.
Le journal des annotateurs, lui, est en `.jsonl` et sait détecter une écriture interrompue.

**Pourquoi ça casse.** Une écriture interrompue tronque le registre entier, pas sa dernière ligne.
Le fichier est alors illisible, ce que `lireRegistre` signale — donc bruyant, pas silencieux — mais
les décisions déjà tranchées sont perdues et ne se retrouvent que dans l'historique Git.

**Ce qu'il faut faire.** Basculer en `.jsonl` si le registre dépasse quelques dizaines d'entrées.
Le nom `decisions.json` vient d'une décision de l'auteur du 2026-09-18 : le changer est sa décision.

### 5. Le champ `registre_corrections_mesure` est obligatoire, mais un tableau vide est accepté — *basse*

`Dossier.registre_corrections_mesure` est requis par le type, ce qui force tout futur appelant
d'`evaluerPromotion` à le fournir. Rien ne force à le **remplir**.

**Pourquoi ça casse.** Un appelant qui passerait `[]` par facilité transformerait toutes les
demandes refusées en demandes en attente : des items partiraient en attente au lieu de l'arbitrage,
sans qu'aucun test ne tombe. Visible seulement en comparant le rapport de `promote` au registre.

**Ce qu'il faut faire.** Quand un second appelant apparaîtra, lui faire charger le registre par la
même fonction que `promote`, plutôt que de construire un `Dossier` à la main.

---

## 2026-09-18 — Trois lots en parallèle : outillage, analyse, questions (`outils/schemas/`, `eslint.config.js`, `analysis/`, `pipeline/questions/`)

### 1. Les graines de l'analyse sont textuelles, celles du run sont des entiers — *haute*

`analysis/bootstrap.ts` et `analysis/permutation.ts` amorcent `validation/domaine/alea.ts` avec une
graine **textuelle**, alors que `run.graines.bootstrap.valeur` et `run.graines.permutation.valeur`
sont des entiers dans `schema/run.schema.json`. Aucune fonction unique ne fait la conversion.

**Pourquoi ça casse.** Si l'appelant qui branchera `pnpm analyze` convertit l'entier autrement que
par `String(valeur)`, les intervalles publiés restent déterministes mais ne sont plus rejouables par
un tiers depuis le run publié. Pour un lecteur, un intervalle qu'il ne peut pas rejouer est
indistinguable d'un intervalle faux, et rien ne le signale.

**Ce qu'il faut faire.** Un unique `amorceDepuisGraine(run.graines.x)` dans `analysis/`, testé
contre une valeur attendue écrite, utilisé par le bootstrap, la permutation et l'échantillon humain.
À faire dans le lot qui écrit `pnpm analyze`.

### 2. Le tirage fige quatre conventions que le protocole n'écrit pas — *moyenne*

`pipeline/questions/` a retenu le comportement le plus restrictif sur quatre points non tranchés :
date civile comparée à `date_gel` à **minuit UTC** ; item `arbitree` exclu du tirage, contre
l'annexe E ; Q-ORI sur un item O avant son changement résolue par l'état en vigueur ; budget de
reprise 80 % appliqué aussi aux Q-ATT. Les décisions sont listées en D7 de
`docs/FEUILLE-DE-ROUTE.md`.

**Pourquoi ça casse.** Si l'auteur tranche autrement après un premier run réel, le jeu de questions
change entre deux runs et les « questions communes » de la tendance §8 se réduisent sans que le
lecteur sache pourquoi. C'est visible dans le rapport de reprise, à condition de le lire.

**Ce qu'il faut faire.** Trancher D7 **avant** le run pilote du 22 novembre et écrire chaque réponse
dans le protocole ou `schema/README.md`, section Temps. Chaque changement est une ligne dans un
prédicat nommé (`questionTirable`, `itemEngendreDesQuestions`, la table des résolveurs).

### 3. Le contrat d'entrée de l'analyse précède la disposition de `runs/` — *moyenne*

`analysis/types.ts:EntreesAnalyse` suppose une entrée de tirage par `question_id` et exactement un
item principal par question, et `analysis/filtre.ts:assembler()` lève sur tout écart. La
disposition de `runs/<date>/` n'existe pas encore.

**Pourquoi ça casse.** Quand le lot interrogation fixera les fichiers d'un run, tout écart imposera
un adaptateur plutôt qu'un chargement direct ; et un thème absent d'une entrée de tirage fait
sortir l'unité de la ventilation par thème avec `theme: null`, visible dans le type mais muet dans
les chiffres.

**Ce qu'il faut faire.** Écrire `runs/README.md` avec la disposition des fichiers dans le lot
interrogation, et faire lire ces fichiers par `assembler()` sans couche intermédiaire.

### 4. ajv tourne en `strict: "log"` et compte ses avertissements sans les lire — *moyenne*

`outils/schemas/registre.ts` passe ajv en `strict: "log"` parce que le mode strict refuse des
combinaisons `if`/`then`/`not`/`contains` légitimes du draft 2020-12 utilisées par six schémas. Les
135 avertissements sont comptés dans le rapport, jamais catégorisés.

**Pourquoi ça casse.** Une coquille dans un mot-clé de schéma (`requird`, `additionalProperty`)
est exactement ce que le mode strict attrape. En `log`, elle rejoint les 135 autres et `pnpm check`
reste vert, tant qu'aucun exemple `invalide-*` ne vise précisément la règle affaiblie.

**Ce qu'il faut faire.** Catégoriser les avertissements par code ajv et n'ignorer que les codes
connus, en erreur sur tout code nouveau. Petit lot Sonnet.

### ~~5. `decision.schema.json` n'est ni enregistré ni exemplifié~~ — réglé le 2026-09-20 par son entrée au registre et ses six exemples

`schema/` contient onze fichiers ; `schema/README.md` et le manifeste en connaissent dix.
`decision.schema.json`, ajouté avec le journal de validation, n'a aucun exemple et n'est pas dans
le registre d'`outils/schemas/noms.ts`.

**Pourquoi ça casse.** Le journal de validation, publié au §9, est le seul objet du dépôt dont la
forme n'est gardée par aucun test. Un champ renommé dans `validation/domaine/journal.ts` ne fera
échouer que la lecture croisée de `promote`, jamais `pnpm check`.

**Ce qu'il faut faire.** Cinq exemples au manifeste, une ligne dans le README, le fichier ajouté
au registre. Petit lot Sonnet, en même temps que le point 4. *Fait ; reste à relier le schéma au code qui
écrit les journaux, entrée du 2026-09-20, point 1.*

### 6. Les gabarits de questions vivent dans le code, pas dans `prompts/` — *basse*

`pipeline/questions/gabarits.ts` porte les six textes de l'annexe B en table de données, et
`question.version_gabarits` vaut `"annexe-B/protocole-0.2"`. `CLAUDE.md`, règle 6, dit « aucun
prompt en dur dans le code », et `schema/question.schema.json` décrit `version_gabarits` comme la
version d'un fichier de `prompts/`.

**Pourquoi ça casse.** Un changement de gabarit est un amendement (§9) ; dans le code, il se noie
dans un diff ordinaire. Visible à la relecture, mais après coup.

**Ce qu'il faut faire.** Déplacer la table vers `prompts/gabarits-1.0.0.json` dans le lot
`perimetre-prompts`, que seul l'auteur écrit ; `gabarits.ts` devient une lecture de fichier.

### 7. Deux gardes pour le même invariant, et un test qui recopie sa configuration — *basse*

`validation/domaine/promotion.ts:memeVersionJugee()` (privée) et
`pipeline/questions/invariants.ts` gardent la même règle « deux validations concordantes, même
version ». `tests/lint.test.ts` redéclare les deux règles d'`eslint.config.js` au lieu de l'importer.

**Pourquoi ça casse.** Deux copies d'une règle divergent ; un seuil changé dans la configuration
resterait testé à l'ancienne valeur. Visible à la lecture.

**Ce qu'il faut faire.** Exporter `memeVersionJugee` et l'appeler depuis `invariants.ts` ; faire
importer la configuration réelle par le test (`allowJs` ou déclaration de type minimale).

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

### ~~1. Le protocole promet trois comportements que le code n'a pas~~ — réglé le 2026-09-19 par `--reannote`, la supersession dans `promote` et `pnpm mesures`

*Correction du 2026-09-19 : ce point en annonçait trois, il n'y en avait que deux. Le suivi du taux
de « non évaluable » par annotateur était **déjà implémenté** dans `outils/promote.ts:imprimerNonEvaluables()`,
avec le commentaire qui cite le §4 ; il lui manquait seulement un test, désormais écrit. Une entrée
de dette qui décrit un manque inexistant use la confiance qu'on accorde aux autres.*

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

### ~~1. Le client n'est couvert par aucun test, et il redéclare des constantes du domaine~~ — réglé le 2026-09-19 par l'extraction vers `domaine/decoupage.ts` et `domaine/webvtt.ts`, l'import de `CLES_GRILLE`, et `docs/CONTROLE-MANUEL.md` pour ce que les tests ne verront jamais

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

### ~~2. Une correction de thème peut retenir un item indéfiniment~~ — réglé le 2026-09-19 par `pnpm mesures` et le registre lu par `promote`, un refus étant désormais une décision tracée

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

### ~~2 bis. Rien ne relie un lot de réannotation à son lot d'origine~~ — réglé le 2026-09-19 par `--reannote` et `--calibration`, qui remplissent `Lot.reannote` et `Lot.date_calibration`, et par `lotsApresSupersession` dans `promote`

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
