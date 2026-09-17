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

## Outillage

**Valider avec ce qui est déjà là.** `jsonschema` était installé sur la machine : 40 exemples
vérifiés sans ajouter une seule dépendance au projet. Une dépendance de plus est une surface d'audit
de plus dans un projet dont la crédibilité repose sur l'auditabilité.

**Les scripts jetables vivent hors du dépôt.** Génération des exemples et validation : deux scripts
dans le répertoire temporaire de session, jamais dans `scratch/` ni dans le dépôt.

**Ne pas écrire de JSON accentué par heredoc.** Le heredoc `cat <<'JSON'` est mal digéré par
l'enveloppe shell de l'agent sur cette machine (erreur `unexpected EOF`). Pour tout contenu
multi-ligne avec accents et guillemets, utiliser l'outil d'écriture de fichier.

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

**Un trou du protocole se signale, il ne se comble pas en silence.** Trois contradictions relevées
cette session (candidat retiré, symétrie et Q-ATT, ajout fabriqué non contraire) sont documentées
comme candidates à un amendement, pas résolues d'autorité dans le code.
