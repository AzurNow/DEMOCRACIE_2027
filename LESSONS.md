# Bonnes pratiques — Banc d'essai 2027

Ce qui a été appris en travaillant sur ce dépôt, et qu'il serait coûteux de réapprendre. Complété au
fil des sessions. Une leçon n'entre ici que si elle a été **payée** : une décision prise, un piège
évité, une erreur commise.

`CLAUDE.md` dit comment travailler ; ce fichier dit ce que l'expérience a ajouté.

---

## Modélisation des données

**Encoder la règle dans le schéma, pas dans un commentaire.** « Au plus une page par seconde » (§6)
est devenu un `maximum: 1`. « Un juge n'attribue jamais *indéterminée* » (§7) est devenu une
restriction d'énumération conditionnelle, au lieu d'une phrase adressée au modèle dans le prompt —
un modèle finit toujours par ignorer une consigne en langage naturel, et la valeur serait alors
entrée dans les dénominateurs sans que personne ne la voie.

**Un identifiant ne doit rien signifier.** `2027-LEP-FISC-0012` encode le candidat et le thème :
il devient faux dès qu'un annotateur corrige le thème, ce que la grille de validation lui demande
explicitement de faire. Il fait aussi fuiter l'identité de l'outil vers un juge censé être aveugle.
Identifiants opaques, champs séparés, étiquette lisible décorative et gelée.

**Ne jamais stocker deux fois une valeur qui peut diverger.** La frontière d'obsolescence d'un item O
est portée par un champ unique (`date_changement`), pas recopiée dans les deux états. Deux dates
décrivant le même instant finissent toujours par ne plus coïncider.

**Un enum qui mélange des dimensions orthogonales est un bug qui attend.** Les sept statuts d'item du
protocole mêlaient validation, contestation et temporalité — alors qu'un item peut être vérifié,
contesté et obsolète en même temps. Trois champs indépendants, et l'obsolescence dérivée des dates.

**Une donnée absente reste absente.** Pas de `?? 0`, pas de `|| "inconnu"`, pas de recopie de
`modele_demande` dans `modele_renvoye` quand l'API ne renvoie rien. `null` est une information ;
une valeur plausible est un mensonge.

**Épingler la version de ce contre quoi on a jugé.** Git dit *quand* une donnée a changé, jamais
*contre quelle version* une mesure a été produite. Toute référence à un objet mutable porte son
numéro de version et son empreinte.

**Les bornes temporelles se déclarent.** Intervalles semi-ouverts partout (`debut <= t < fin`), un
instant de référence unique par run, et un décalage horaire explicite sur chaque horodatage. La
convention est même inscrite dans les données (`regle: "semi_ouvert"`), pour qu'un lecteur n'ait pas
à la deviner.

**Un offset n'existe pas sans son unité.** `projeter()` associait chaque caractère normalisé à sa
position en points de code, puis la recherche se faisait avec `indexOf`, qui compte en unités UTF-16.
Les deux coïncident jusqu'à la première source contenant un emoji ou un idéogramme, après quoi tout
le surlignage se décale d'un caractère — sans erreur, sans exception, sans test rouge. La correction
tient en une ligne (un index par unité UTF-16, valant le point de code d'origine) ; la trouver après
coup aurait supposé de soupçonner le surlignage plutôt que la source.

## Tests

**Les exemples invalides sont les vrais tests.** Un exemple valide vérifie qu'on n'a rien oublié ;
un exemple invalide vérifie qu'une règle du protocole est réellement gardée. Trois invalides pour
deux valides, et chacun cible une règle nommée.

**Un manifeste fait la table de vérité.** Chaque exemple est accompagné du résultat attendu et de la
règle testée. Sans lui, un fichier `invalide-*` ressemble à une donnée cassée qu'on « corrigera »
plus tard.

**Vérifier qu'un test échoue pour la bonne raison.** Un exemple invalide peut passer au rouge par
accident (une virgule, un champ oublié) et sembler valider une règle qu'il n'atteint jamais. Lister
**toutes** les erreurs de validation, pas seulement la première : sur `notation/invalide-02`, la
règle visée ne produisait que la deuxième erreur du lot.

**Faire échouer volontairement le test qui protège une propriété critique.** Le test d'aveuglement
énumère toutes les routes et vérifie qu'aucune ne laisse filtrer le journal de l'autre annotateur.
Écrit d'un trait, il passait — ce qui ne prouvait rien. En ajoutant une fuite délibérée dans deux
routes, on a vu qu'il tombait *et* qu'il nommait la route fautive. Un test de sécurité qu'on n'a pas
vu échouer est une décoration.

**Un test de symétrie qui compare trois appels d'une même expression ne teste rien.** La première
version de `gestesPourDecision()` calculait le même terme pour « accepter », « rejeter » et « non
évaluable » : le test d'égalité était une tautologie et serait resté vert quoi qu'on fasse. Le coût
de chaque décision vit maintenant dans une table de données, `COUT_DECISION`, dont la symétrie est
la propriété testée. Faire porter l'assertion sur la donnée, pas sur le code qui la relit.

**Un test d'accord entre deux validateurs doit nommer aussi ce qu'ils ne partagent pas.** Le
registre des corrections de thème a deux gardiens : `validerEntreeRegistre()`, frontière d'exécution
aux messages lisibles, et `decision-mesure.schema.json`, contrat publié plus strict. La tentation
était de les faire coïncider en apprenant les dix thèmes à la frontière — au prix d'une troisième
copie de la liste, ou d'un import de `pipeline/` depuis `validation/`. La divergence est devenue une
assertion commentée : le schéma rejette un onzième thème, la frontière l'accepte. Le jour où
quelqu'un resserre la frontière, ce test tombe et l'oblige à le dire.

**Un identifiant de fixture respecte la forme qu'il imite.** Les fabriques de test portaient des
identifiants de mesure `01JBANCESSAI…` contenant `I` et `U`, hors de l'alphabet Crockford base32 que
`commun.schema.json` impose aux ULID. Rien ne les validait, donc personne ne l'avait vu ; le premier
schéma qui les regarde les refuse. Les corriger a fait tomber huit tests d'un coup, parce que
`entree().mesure_id` et `mesure().id` doivent rester égaux pour que l'appariement du registre
fonctionne — le défaut dormait depuis l'écriture des fabriques.

**Tester une bibliothèque sur l'entrée qu'elle devrait refuser.** Deux défauts muets trouvés par un
test de refus, aucun par la documentation. `pymupdf.open(stream=…, filetype="pdf")` ignore
`filetype` quand il reconnaît du HTML : une page servie en `application/pdf` aurait été « extraite »
par son moteur HTML, sans erreur (garde ajoutée : `document.is_pdf`). Et `codecs.lookup("iso-8859-1").name`
vaut `iso8859-1`, pas `latin-1` : la règle WHATWG « latin-1 se lit en windows-1252 » ne
s'appliquait jamais, et l'apostrophe `’` devenait un caractère de contrôle.

## Outillage

**Valider avec ce qui est déjà là.** `jsonschema` était installé sur la machine : 45 exemples
vérifiés sans ajouter une seule dépendance au projet. Une dépendance de plus est une surface d'audit
de plus dans un projet dont la crédibilité repose sur l'auditabilité.

**Les scripts jetables vivent hors du dépôt.** Génération des exemples et validation : deux scripts
dans le répertoire temporaire de session, jamais dans `scratch/` ni dans le dépôt.

**Ne pas écrire de JSON accentué par heredoc.** Le heredoc `cat <<'JSON'` est mal digéré par
l'enveloppe shell de l'agent sur cette machine (erreur `unexpected EOF`). Pour tout contenu
multi-ligne avec accents et guillemets, utiliser l'outil d'écriture de fichier.

**Vérifier une fixture par ses propriétés, pas à l'œil.** Deux défauts silencieux dans le même
générateur : un identifiant dérivé d'un compteur sans largeur fixe faisait collisionner l'item 1 et
l'item 10 — dix items écrits, neuf fichiers sur le disque, aucune erreur ; et une `date_creation`
prise à l'heure courante rendait deux exécutions successives différentes, donc le jeu de
démonstration non reproductible. Compter les fichiers produits et comparer deux exécutions coûte
deux commandes, et les deux défauts sautent aux yeux.

**Enregistrer un schéma ne suffit pas à garder l'objet qu'il décrit.** La dette demandait d'ajouter
`decision.schema.json` au registre et de lui écrire des exemples : fait, et `pnpm check` les vérifie.
Le trou réel restait ouvert. Les exemples avaient été écrits à la main d'après le schéma, et
`JournalAnnotateur.ajouter()` sérialise toujours ce que le type TypeScript accepte, sans rien
valider : schéma et exemples restent d'accord entre eux pendant que le code s'en éloigne. Ce qui
garde un objet, c'est le chemin qui va du code qui l'écrit jusqu'au schéma — pas le schéma seul.

**Fixer les fins de ligne dans le dépôt, pas dans la configuration de chacun.** Sans
`.gitattributes`, `core.autocrlf=true` (réglage par défaut de Git pour Windows) convertissait les
fichiers dorés en CRLF au checkout : huit tests pytest échouaient sur `main` sous Windows, alors que
la CI Linux était verte. Le même mécanisme aurait changé l'empreinte et décalé les offsets de chaque
texte de `staging/textes/`. Un projet qui hache des fichiers texte déclare `eol=lf`, et `-text` pour
ce qui ne doit jamais être touché.

**Écrire les caractères invisibles par échappement, puis vérifier les octets.** L'outil d'écriture
de l'agent a transformé `́` en accent combinant brut, et un `\n` dans une chaîne TypeScript en
vrai saut de ligne (erreur de compilation). Le test restait juste mais illisible : rien ne distingue
à l'œil `été` composé de `été` décomposé. Pour U+0301, U+00A0, U+00AD, U+FB01 : échappement dans le
code, `String.fromCodePoint` en TypeScript, et un `grep` sur les octets après écriture.

## Méthode

**Suivre une règle jusqu'à tous ceux qui la lisent, pas seulement jusqu'au premier.** Le brief du
lot alignement-0-3 demandait de réintégrer l'item arbitré « au tirage » : le sous-agent l'a fait dans
`tirage.ts`, et l'engendrement comme la condition de symétrie continuaient de rejeter tout item
arbitré. Le premier item maintenu par le panel aurait bloqué le run sur un contrôle bloquant. Avant de
briefer un changement de règle, lister avec `grep` chaque endroit qui la lit (ici `statut_contestation`)
et les mettre tous dans le périmètre.

**Un brief ne contredit pas la définition de l'agent qui le reçoit.** Le brief demandait un commit
alors que `.claude/agents/codeur-*.md` l'interdit : les deux sous-agents ont suivi leur définition et
rendu un arbre non commité, ce qui était la bonne réponse mais a coûté un aller-retour. Le gabarit
`.claude/briefs/GABARIT.md` dit « Aucun commit » : s'y tenir, et commiter soi-même après relecture.

**Poser les questions bloquantes avant d'écrire la première ligne.** Sur un protocole préenregistré,
une hypothèse inventée coûte plus cher qu'une session de questions. Les décisions structurelles
(qu'est-ce qu'une « question » ? combien d'objets ?) changent la forme de tous les fichiers : les
trancher après coup, c'est tout réécrire.

**Séparer ce que je peux décider de ce qui appartient à l'auteur.** Précision d'implémentation :
je tranche et je le signale. Règle de mesure, seuil, règle d'inclusion : je propose, je n'exécute
pas, et je signale si un amendement (§9) est nécessaire.

**Enregistrer plus sans changer la métrique.** Face à un manque (la réponse partiellement correcte
n'existe pas dans la grille), ajouter un champ descriptif — `motif_inexactitude`,
`attribution{attendus, cites}` — plutôt que toucher à la catégorie primaire. Les métriques
préenregistrées ne bougent pas, et la nuance reste reconstructible en analyse exploratoire.

**Une contrainte qui s'applique en écrivant va dans `CLAUDE.md` ; une compétence ne porte que le
comment.** Le seuil de complexité doit être présent à chaque fonction écrite : le mettre dans une
compétence chargée à la demande, c'est garantir qu'il ne sera pas là au moment où il compte. Quatre
lignes dans `CLAUDE.md` pour la règle, la compétence `complexite-maitrisee` pour la façon de
découper sans violer les deux règles voisines du dépôt. Le critère de partage : *cette information
doit-elle être présente avant de savoir qu'on en a besoin ?*

**Chiffrer le volume avant de choisir le stockage.** « Fichiers JSON dans Git » se tenait jusqu'à
ce qu'on multiplie : 24 000 réponses par run, 20 runs, 4 à 12 Go. Le dépôt cessait d'être clonable,
donc vérifiable, ce qui supprimait la raison d'être du projet — et personne ne l'aurait vu avant la
première semaine de runs hebdomadaires. Trois multiplications valaient mieux qu'une intuition.

**Relire le texte qui fait autorité plutôt que le résumé qu'on en a fait.** Le protocole exige que
les réponses brutes soient *publiées* et que Git soit le journal des *modifications* : deux exigences
distinctes, fusionnées à tort en « tout dans Git ». La solution était déjà dans le §9, sous la forme
du DOI Zenodo imposé à chaque publication. Aucun amendement n'a été nécessaire.

**Un trou du protocole se signale, il ne se comble pas en silence.** Trois contradictions relevées
cette session (candidat retiré, symétrie et Q-ATT, ajout fabriqué non contraire) sont documentées
comme candidates à un amendement, pas résolues d'autorité dans le code.

**Reporter une décision de mesure dans le protocole dans la session qui la prend.** Six décisions
du 2026-09-17 (kappa à trois catégories, contenu notant, non-évaluabilité, grille par type) ont été
implémentées et testées, puis laissées hors du protocole. Les écrire le lendemain a exigé de relire
`kappa.ts`, `promotion.ts`, `grille.ts` et `empreinte.ts` pour retrouver exactement ce qui avait été
tranché : le code était devenu la seule source, alors que le protocole doit faire autorité sur lui.

**Poser une question ouverte, c'est souvent trouver un trou à côté.** En rédigeant les options sur
l'alerte de kappa, on a vu que `Lot.reannote` était déclaré, affiché, et jamais rempli : le vrai
manque n'était pas le bouton discuté, mais le lien entre un lot et sa réannotation, sans lequel le
critère go/no-go du §12 est ambigu. Vérifier ce que le code fait du champ avant de débattre de
l'écran qui le montre.

**Typer les dépendances avant de dessiner un graphe d'avancement.** La première idée de la feuille
de route était un arbre de compétences où un lot est verrouillé tant que ses prérequis ne sont
pas atteints. Sur ce dépôt, il aurait grisé l'extraction et la notation pendant des semaines, alors
que les deux se développent sur `validation/fixtures/` avant que la collecte existe. Deux types
d'arêtes, `bloque` et `informe`, et seul le premier entre dans le calcul de l'état ; le second se
dessine en pointillé pour dire « à relire quand l'amont change ».

**Générer une vue de pilotage, ne jamais l'éditer.** Un Markdown de suivi écrit à la main diverge
du réel en deux sessions, et un outil externe sort l'état du dépôt Git qui est le journal public du
projet. `docs/feuille-de-route.json` est la seule source, `pnpm feuille-de-route` la seule plume, et
`--verifier` dit quand les deux ne coïncident plus. Ce que l'agent lit et ce que l'auteur regarde
viennent du même fichier.

**Un brief qui liste ses cas limites en liste fermée et ses questions déjà tranchées revient sans
question.** Premier sous-agent lancé d'après `.claude/briefs/GABARIT.md` : 28 cas limites numérotés,
sept hésitations prévisibles réglées d'avance. Rapport rendu sans question ouverte, 29 tests verts
du premier coup, diff strictement dans le périmètre. Le temps passé à fermer la liste avant de
lancer se retrouve en tokens non dépensés à relancer.

**Écrire le code de mesure sur fixtures avant le gel : c'est la relecture la plus exigeante du
protocole.** Trois lots lancés en parallèle sur le §5 et le §8 ont remonté dix-sept questions que
deux lectures humaines n'avaient pas vues : item arbitré tirable ou non, Q-ORI sur un item obsolète
avant son changement, position conditionnelle face à une question fermée, valeur p absente pour une
famille où Holm est pourtant exigé, dénominateur de la confirmation de prémisse. Aucune n'était un
bug : chacune était une phrase du protocole qui ne se traduit pas en `if`. Le coût d'un amendement
après gel se paie en révision d'une ligne avant.

**Quand une décision exige deux commits, le brief exige deux fichiers de tests.** Le lot outillage
devait livrer ajv et ESLint « dans deux commits séparés ». Le sous-agent a livré un seul fichier de
tests mêlant les deux ; le premier commit, pris seul, ne compilait pas. Il a fallu scinder et
rejouer chaque commit dans un répertoire propre. Le brief disait « garde les deux travaux
séparables » ; il fallait dire quels fichiers.

**`eslint .` parcourt les worktrees des sous-agents.** Ils vivent sous `.claude/worktrees/`, à
l'intérieur du dépôt, et ESLint y a signalé quatre fonctions déjà découpées, en double, depuis des
copies périmées. Le répertoire est désormais ignoré par ESLint et par Git ; la surprise aurait été
plus coûteuse en CI, où le répertoire n'existe pas et où l'erreur n'aurait jamais été reproduite.

**Un garde-fou qu'on n'a pas vu attraper quelque chose ne garde rien.** L'extraction de la logique
pure du client l'a fait dépendre de `domaine/`, avec ce risque : un futur module de `domaine/`
important `node:*` casserait l'interface sans qu'aucun test ne le voie. J'ai ajouté la vérification
de types du client à `pnpm check`, puis j'ai délibérément glissé un `import { readFileSync } from
"node:fs"` dans `domaine/grille.ts` pour la voir tomber. Elle ne tombait pas : le client héritait des
types Node par `@types/node`. Il a fallu lui retirer (`"types": []`) pour que le garde-fou garde.
Même leçon que le test d'aveuglement, appliquée à l'outillage : écrire le garde-fou et le voir passer
au vert ne prouve rien.

**Durcir un parseur, c'est distinguer l'entrée malformée de l'entrée légale qu'on n'avait pas vue.**
`secondesDeHorodatage` rendait `NaN` sur « abc », `0` sur une chaîne vide et `1` sur « 1:2:3:4 » : un
lecteur positionné à la seconde zéro ferait vérifier à l'annotateur une autre portion de
l'enregistrement. En le durcissant, il refusait du même coup `00:00:08.000 align:start`, qui est du
WebVTT parfaitement légal. Les réglages de cue sont maintenant écartés avant l'analyse, et
l'horodatage nu refuse tout le reste. Un durcissement sans cette seconde moitié transforme un bug
silencieux en écran cassé sur des fichiers valides.

**Vérifier qu'un sous-agent n'a pas affaibli une assertion se lit dans le diff, pas dans son
rapport.** Le lot de réannotation changeait la signature de `Dossier`, donc `tests/promotion.test.ts`.
Un `git diff` filtré sur les seules lignes contenant `expect` a montré en une commande qu'aucune
attente n'avait bougé, seulement les appels. C'est deux secondes, et c'est la seule preuve que
l'anti-pattern « un test rendu vert en affaiblissant son assertion » n'a pas eu lieu.
