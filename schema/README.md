# schema/ — modèle de données du Banc d'essai 2027

`docs/PROTOCOLE.md` fait autorité. Ce répertoire le traduit en contraintes vérifiables par une
machine. Quand un schéma est plus strict que le protocole, c'est que le protocole laissait un trou
qu'il fallait combler pour pouvoir implémenter les sections 4 à 8 ; chaque comblement est motivé
dans le champ `description` du schéma concerné, et les comblements qui touchent une **règle de
mesure** sont listés plus bas comme candidats à un amendement (§9).

## Les douze fichiers

| Fichier | Objet | Pourquoi il existe |
| --- | --- | --- |
| `commun.schema.json` | bibliothèque de `$defs` | Les énumérations du protocole (dix thèmes, quatre types d'item, six gabarits, trois registres) vivent ici **une seule fois**. Ne décrit aucun objet stockable, donc pas d'exemples. |
| `item.schema.json` | item de référence | §4 |
| `question.schema.json` | question | §5 |
| `reponse.schema.json` | réponse d'outil | §6 |
| `notation.schema.json` | notation individuelle | §7 |
| `verdict.schema.json` | note retenue | §7, règle de décision |
| `mesure.schema.json` | référent partagé | §5 Q-ATT, §7 mauvaise attribution, §6 QR9 |
| `run.schema.json` | run | §9 publication, §5 symétrie, §12 go/no-go |
| `tirage.schema.json` | questions tirées d'un run | §5 tirage, §9 publication des questions |
| `lecture-comparateur.schema.json` | lecture d'un comparateur | §6, QR9 |
| `decision.schema.json` | entrée du journal de validation | §4, une ligne du journal append-only écrit par l'interface de validation humaine |
| `decision-mesure.schema.json` | arbitrage d'une correction de thème | §4, décision de l'auteur sur une demande de correction du thème d'une mesure, publiée dans `validation/mesures/decisions.json` |

Quatre objets étaient demandés ; il en a fallu neuf. Les quatre ajoutés ne sont pas des commodités :
sans `mesure`, la réponse attendue d'une Q-ATT n'est pas calculable ; sans `run`, les cinq graines et
le périmètre gelé n'ont pas de domicile et finiraient en dur dans un script, hors publication ; sans
`verdict`, l'analyse de robustesse §8(a) ne peut pas isoler la notation humaine ; sans
`lecture-comparateur`, la famille des comparateurs remplirait l'objet `reponse` de champs nuls et
imposerait un embranchement par famille d'outil dans le code de notation. `tirage` est sorti de
`run` dans un second temps : environ 400 entrées que tout contrôle go/no-go aurait dû charger
entières, alors qu'une référence par chemin et empreinte suffit.

## Le flux, et où chaque objet est écrit

```
mesure ─┐
        ├─> item (staging/ puis data/ après validation humaine)
        │
        └─> question ──> run.tirage[] ──> reponse ──> notation ──> verdict ──> analysis/
                             (gel)          (48 h)     (2 juges)   (résolution)
```

`data/items/` n'est écrit que par l'interface de validation. Les schémas n'y changent rien : ils
décrivent la forme, pas le droit d'écrire.

## Conventions qui ne se devinent pas

**Identifiants opaques (ULID).** L'annexe A proposait `2027-LEP-FISC-0012`. Un id qui encode le
candidat et le thème devient faux dès qu'un annotateur corrige le thème — ce que la grille de
validation du §4 lui demande explicitement de vérifier — et il fait fuiter l'identité de l'outil
vers un juge que le §7 veut aveugle. Les ids sont donc opaques, `libelle_lisible` est décoratif et
gelé, et `reponse.alias_aveugle` rend l'aveuglement auditable après coup.

**Temps.** Tout instant porte son décalage. `run.date_gel` est l'instant de référence **unique** d'un
run : une réponse obtenue à +47 h dans la fenêtre de 48 h est jugée contre le même instant que
celle obtenue à +2 min. Les intervalles de validité sont **semi-ouverts** : `valide_du <= date_gel <
valide_au`. Un item dont `valide_au` (ou `obsolescence.date_changement`) tombe exactement sur
`date_gel` est donc **déjà obsolète**, et la réponse attendue est « position modifiée ». §4 disait
« avant » et « après » sans jamais définir l'égalité.

**Versionnement et épinglage.** `item.version` + `item.empreinte` sont épinglés partout où un item
est utilisé (question, tirage, notation). Git dit *quand* un item a changé ; l'épinglage dit *contre
quelle version* une réponse a été notée. Sans lui, la robustesse §8(b) et toute relecture d'un run
publié sont impossibles.

**Statuts orthogonaux.** Les sept statuts du §4 mélangeaient trois dimensions. Ici :
`statut_validation` (en_attente, a_confirmer, verifie, rejete, non_evaluable, retire_par_panel),
`statut_contestation` (aucune, contestee, arbitree), et l'obsolescence **dérivée** des dates. Un item
peut être vérifié, contesté et obsolète en même temps, ce qu'un enum unique ne pouvait pas exprimer.

**Réponse brute immuable.** `brut` est opaque (`additionalProperties` libre), n'est jamais lu par la
notation, et `brut_sha256` rend l'immuabilité vérifiable. `normalise` est une projection
explicitement **avec perte**, produite par une fonction dont la version est stockée dans la réponse.
Un schéma commun typé sur les charges utiles des éditeurs aurait été un reformatage, donc une
violation de la règle 7.

**Ce que Git stocke, et ce qu'il ne stocke pas.** Un run produit de l'ordre de 24 000 réponses et
48 000 notations individuelles, soit plusieurs centaines de mégaoctets ; sur une saison d'environ
vingt runs, plusieurs gigaoctets. Dans Git, le dépôt cesserait d'être clonable, donc vérifiable —
exactement ce que le §9 exige qu'il reste. Git garde `data/`, `config/`, `prompts/`, le code, et par
run les questions, le tirage, les verdicts et les métriques. Le volume part en archive sur Zenodo,
avec le DOI que le §9 impose déjà, référencée depuis `run.depot` par DOI, empreinte SHA-256, taille
et nombre d'entrées. Aucun amendement n'est nécessaire : le protocole exige que les réponses brutes
soient **publiées**, jamais qu'elles soient dans Git. Effet de bord favorable sur la règle 7 — une
archive à DOI ne se réécrit pas.

**Ce qui n'alimente pas les métriques.** `contexte` vaut `run`, `pilote`, `jeu_or`,
`contrefactuel_candidat` ou `contrefactuel_outil`. Les 200 réponses permutées du test contrefactuel
(§7) sont des textes qu'aucun outil n'a produits. Le filtre `contexte == "run"` est la seule barrière
entre elles et un chiffre publié ; il vit dans `analysis/`, une fois.

**Contestation pendant un run.** Le tirage fige `statut_contestation_au_gel`. Une contestation reçue
après le gel n'entre pas dans le critère §12 — elle atterrit dans `run.contestations_posterieures[]`,
qui est exactement l'entrée de l'analyse de robustesse §8(b).

**Candidat entrant ou sortant.** `run.perimetre.candidats[]` est un instantané : `statut_au_gel`
(actif / nouveau / retire), `preuves_inclusion[]` (les deux sondages du §3, archivés, sans quoi la
règle d'inclusion est invérifiable par un tiers), `items_p_verifies` compté au gel et **stocké**, et
`interroge` (faux pour un candidat retiré). Le ratio de reprise 80/20 se calcule par candidat présent
aux deux runs ; un candidat `nouveau` en est exclu.

**Réponse partiellement correcte.** La catégorie primaire reste binaire, donc les métriques
préenregistrées ne bougent pas. `notation.motif_inexactitude` et `notation.attribution{attendus,
cites}` enregistrent en plus de quoi reconstruire la nuance en analyse exploratoire : bonne position
avec mauvais chiffre, ajout fabriqué non contraire, liste d'attribution juste à 4 candidats sur 5.

**Plusieurs items pour une même question.** `question.items[]` porte un `role` par entrée, avec
exactement un `principal`, et `grappe_id` **stocke** la grappe du bootstrap (§8 : « la grappe étant
l'item ») au lieu de laisser l'analyse la recalculer.

## Exemples et table de vérité

`exemples/manifeste.json` liste les 55 exemples avec, pour chacun, le résultat attendu de la
validation et la règle du protocole qu'il teste. Les fichiers `invalide-*` **doivent** être rejetés :
ce sont eux les tests. Les rejets attendus, objet par objet :

| Objet | Ce que les trois exemples invalides vérifient |
| --- | --- |
| item | source T3 déclarée vérifiée · item vérifié avec une seule validation · item d'absence portant une citation de position |
| mesure | mesure fictive sans vérification contre les corpus T1 · thème hors des dix · identifiant lisible au lieu d'opaque |
| question | deux items principaux · Q-ATT nommant un candidat · deux formulations au lieu de trois |
| reponse | réponse manquante portant un contenu · réponse d'API sans mode · artefact contrefactuel sans traçabilité |
| notation | juge attribuant « indéterminée » · drapeau sur une réponse exacte · note non exacte sans extrait justificatif |
| verdict | fabrication retenue sans revue humaine · verdict sans notation source · désaccord avec une seule source |
| run | graine sans algorithme nommé · symétrie rouge publiée sans mention provisoire · candidat à 8 items P déclaré au-dessus du seuil |
| tirage | entrée d'attribution nommant un candidat · deux items principaux dans une entrée · question reprise sans run d'origine |
| lecture-comparateur | absence d'affichage portant un extrait · affichage sans extrait · cadence supérieure à une page par seconde |
| decision | annulation portant une décision · decision=corriger avec corrections vide · item O portant reponses_grille au lieu de reponses_par_etat |
| decision-mesure | refus sans motif · theme_demande hors des dix thèmes fixes du §3 |

Vérification faite avec `jsonschema` 4.26 (draft 2020-12) : 12/12 schémas conformes au méta-schéma,
55/55 exemples conformes au manifeste. Le runner vit dans `outils/schemas.ts` (ajv 8.20.0 et
ajv-formats 3.0.1, draft 2020-12) : `pnpm schemas` le lance seul, `pnpm check` l'exécute avec les
types et ESLint.

## Points restés ouverts, qui demandent un amendement (§9)

Ces schémas les rendent *représentables* sans trancher la règle de mesure :

1. **§3, candidat retiré.** « Sort des runs suivants » et « ses items d'obsolescence servent à
   mesurer si les outils l'ont remarqué » sont contradictoires. Retenu : conservé, non interrogé
   (`interroge: false`). La seconde moitié de la phrase est à supprimer ou à préciser.
2. **§5, symétrie et Q-ATT.** « Même nombre de questions par candidat » ne peut pas s'appliquer aux
   questions d'attribution, que le même §5 interdit d'attribuer à un candidat. La condition
   `nombre_questions_par_candidat` porte donc sur les cinq autres gabarits.
3. **§7, ajout fabriqué non contraire.** Une réponse qui affirme la bonne position **et** une
   position inventée non contradictoire n'est ni « exacte » au sens plein ni « incompatible » au sens
   littéral. Le champ `motif_inexactitude: ajout_fabrique` permet de l'enregistrer dans les deux
   sens ; la règle de classement appartient au prompt du juge et reste à écrire.
4. **§6, troncature.** Retenu : une réponse tronquée est obtenue et notée telle quelle, avec
   `normalise.troncature`. Reste à décider si elle entre dans les métriques primaires.
5. **§12, kappa et seuils.** `taux_echantillon_humain` n'accepte que 0,10 et 0,25, les deux seules
   valeurs prévues par le §7. Tout autre taux exige un amendement, et c'est voulu.
6. **Annexe A, `obsolescence.date_changement`.** La frontière est portée par un champ unique, et non
   dupliquée dans les deux états, pour qu'aucune divergence ne soit possible entre deux dates
   décrivant le même instant.
