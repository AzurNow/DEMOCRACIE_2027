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

## Méthode

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
