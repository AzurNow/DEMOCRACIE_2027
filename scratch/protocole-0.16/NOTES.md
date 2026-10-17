# Proposition 0.16 : notes d'application (deuxième passe)

Proposition d'agent, 2026-10-15, mise à jour après les décisions de l'auteur transmises par la session
principale (contrefactuel, placements validés, textes à rédiger en projet, trois corrections de la 0.15,
points de forme). Rien n'est écrit dans `docs/`, `prompts/`, `config/`, `data/` ; aucun commit.

Fichiers :
- `PROTOCOLE-0.16.md` : 0.15 + textes appliqués + « version 0.16 » au §1 + ligne de révision 0.16.
- `protocole-0.16.diff` : `diff -u docs/PROTOCOLE.md scratch/protocole-0.16/PROTOCOLE-0.16.md`, régénéré.

Le script d'application exige que chaque ancre figure exactement une fois dans le texte en cours :
toutes les ancres l'ont fait.

Légende de l'état : **texte de l'auteur** = repris mot pour mot de `docs/TACHES-AUTEUR.md` ou du message
de l'auteur ; **rédaction de l'agent, à relire** = formulation écrite par l'agent, avec sa source.

## 1. Table des applications

| Décision | Section | Ancre utilisée | État |
| --- | --- | --- | --- |
| §6 (2026-10-02) | §6 | à la place de « Une requête est tentée au plus trois fois […] (section 7). » | appliqué, texte de l'auteur |
| D13 | §7 contrefactuel | inclus dans le texte de D14 | appliqué |
| D14 (1) | §7 contrefactuel | à la place de « Les notations déjà rendues par le juge retiré […] revue par un humain. » | appliqué, **définition du changement remplacée** par le texte de l'auteur du 2026-10-15 (voir 2.1) |
| D14 (2) | §7 conflit d'intérêts | « … des noms d'outils dans les métadonnées » | appliqué |
| D15 (1) à (4) | §7 juges, règle de décision | « (texte, liens, citations) » ; « Accord des deux juges : note retenue. » ; « de chaque run » (point échantillon) ; fin du point extrait | appliqué (voir 2.2 pour la cohérence) |
| D16 | §7 contrefactuel | après « … dans l'item de référence » ; après « Une note qui change avec le nom seul révèle un biais du juge. » | appliqué ; la phrase « Si les deux juges dépassent 3 % » déplacée après la règle générale (forme, 3) |
| D17 | §7 règle de décision ; §11 | « identiques sur tout ce que lisent […] soutenant). » ; fin de la définition de la fraîcheur | appliqué |
| D18 | §7 annotateurs, échantillon, calibration | « (sans voir l'outil, ni l'autre annotateur) » ; « arbitrée par un troisième humain » ; « 300 réponses issues d'un run pilote » | appliqué ; (1) placé dans la parenthèse (forme, 3) |
| D19 (1) | §7 contrefactuel | après la phrase de D14 sur les réponses éligibles (placement validé) | appliqué, texte de l'auteur : « Un refus de l'API n'y entre pas : il n'a pas de texte à permuter. » |
| D19 (2) | §7 sourçage | après « Un lien mort ne soutient jamais rien » | appliqué |
| D20 | §7 sourçage | après la phrase d'énumération (« … (juge, puis audit humain). »), placement validé | appliqué, texte de l'auteur + mention `config/test-liens.toml` (voir 4.2) |
| D21 | §7 sourçage | à la suite de D20 | appliqué, texte de l'auteur |
| D24, D25 | §12 | « … échantillon de 10 % est ≥ 0,75 » ; fin du paragraphe | appliqué |
| D26 (1), (2) | §3 | fin du paragraphe Candidats, après D28 ; « figurant dans le top des applications de la catégorie » | appliqué ; redondance de (2) corrigée (forme, 3) |
| D27 (1) | §7 juges | « la date du run, et la grille » | appliqué |
| D27 (2) | §7 juges | après « Il rend une sortie structurée… » (placement validé) | appliqué, texte de l'auteur |
| D29 | §7 juges | première phrase à la suite de D27 (2) ; **seconde phrase non écrite** (décision de l'auteur, redondante avec la nouvelle définition du changement) | appliqué en partie, comme décidé |
| D30 (1) | §7 contrefactuel | porté par la nouvelle définition du changement | appliqué |
| D30 (2) | §7 juges | à la suite de D29 | appliqué, texte de l'auteur |
| D28 | §3 ; §8 | après la phrase sur les primaires ; après « … côte à côte » | appliqué ; virgule avant « sauf » (forme, 3) |
| D32 + D33 (2) | §7 | paragraphe après la liste de la règle de décision ; D33 (2) jointe par « ; » (placement validé) | appliqué |
| D33 (1) | annexe C | « extrait justificatif obligatoire pour toute note autre qu'exacte » | appliqué |
| D34 (1) | §7 sourçage | fin du paragraphe Sourçage | appliqué, texte de l'auteur, **placement de l'agent** (voir 4.1) |
| D34 (2) | §7 juges | à la suite de D30 (2), dans « Juges automatiques » | appliqué, texte de l'auteur, **placement de l'agent** (voir 4.1) |
| D27 (3) annexe D | annexe D | squelette remplacé | **rédaction de l'agent, à relire** (voir 4.3) |
| Corrections 0.15 | §3, §7 | voir 5 | appliqué, formulation de l'auteur |
| Révision | §1 | ligne « - 0.16, 2026-10-15 : … » | appliqué ; clauses ajoutées : rédaction de l'agent (voir 6) |

Bilan : les 20 entrées sont appliquées. D29 ne l'est qu'en partie, sa seconde phrase étant écartée par
l'auteur. Trois textes sont rédigés par l'agent et attendent relecture : la mention de
`config/test-liens.toml`, l'annexe D, et les clauses ajoutées à la ligne de révision. Les deux placements
de D34 sont aussi de l'agent.

## 2. Contrefactuel et cohérence avec D15

### 2.1 Nouvelle définition du changement (décision de l'auteur)
La phrase de D14 « Une note change lorsqu'elle diffère sur l'un des éléments que lisent les métriques
primaires : catégorie, drapeaux, fraîcheur de l'obsolescence, sourçage valide. » est remplacée par
« Une note change lorsqu'elle diffère sur la catégorie, sur l'un des drapeaux ou sur la fraîcheur de
l'obsolescence ; le sourçage n'y entre pas, les pages citées n'étant pas permutées. »
Vérifié contre `analysis/note-lue.ts:notesContrefactuellesConcordent`, qui compare catégorie, ensemble des
drapeaux et fraîcheur, avec un sourçage neutralisé. Les deux concordent. La seconde phrase de D29 n'est
pas écrite.

### 2.2 D15 reste-t-elle cohérente ? Non, dans les termes. À signaler, sans trancher
D15 (2) : « Si les deux notations s'accordent sur **ce que lisent les métriques primaires** mais diffèrent
sur un autre champ que porte la note retenue (motif d'inexactitude, citation d'une source, existence d'un
lien), la réponse est notée par un humain. » Or D17, désormais dans le même point de la règle de décision,
écrit que les drapeaux mauvaise attribution et déformation ne sont **pas** lus par les métriques primaires.
- Lecture A : l'accord des juges porte sur la liste de D17 (catégorie, tous les drapeaux, fraîcheur,
  sourçage valide). C'est ce que fait le code : `decision.ts` s'appuie sur `notationsConcordent`, et
  `NoteLue` porte tous les drapeaux. L'incise de D15 est alors inexacte.
- Lecture B : l'incise de D15 vaut à la lettre. Deux juges qui ne diffèrent que sur la mauvaise attribution
  « s'accordent sur ce que lisent les métriques primaires » et « diffèrent sur un autre champ ».
Les deux lectures envoient la réponse à un humain, donc **le résultat ne change pas**. Seul le texte se
contredit. Correction possible, non faite : remplacer dans D15 « ce que lisent les métriques primaires »
par « la catégorie, tous les drapeaux, la fraîcheur et le sourçage valide », ou par « ce sur quoi deux
notations s'accordent (ci-dessous) ». Ailleurs, la définition du changement contrefactuel ne mentionne
plus les métriques primaires : la contradiction relevée en première passe entre D14 et D17 disparaît.

## 3. Points de forme corrigés (sens inchangé)
1. **§6** : la phrase « Si un incident technique invalide un run, … avec la raison. » termine désormais le
   premier paragraphe (tentatives, refus) et non le second (fenêtre, ordre).
2. **D26 (2)** : « classement archivé sur les stores en France à la date de gel » devient « classement archivé,
   à la date de gel ». Le texte disait déjà « de l'App Store ou de Google Play en France ».
3. **D28 (2)** : virgule ajoutée, « côte à côte, sauf pour un outil … ».
4. **D18 (1)** : la mention passe dans la parenthèse : « (sans voir l'outil, ni l'autre annotateur, ni la note
   des juges : un humain reçoit exactement ce que reçoit un juge). »
5. **D16** : « Si les deux juges dépassent 3 %, … invalide (section 12). » suit désormais la règle générale
   « Le taux de changement est publié ; au-delà de 3 %, le juge concerné est retiré … 25 %. »

Signalés seulement, car la correction toucherait le texte de l'auteur :
- D15 (4) : « la réponse est alors notée par un humain ; la notation humaine porte alors ce motif » répète
  « alors », et « ce motif » n'a pas d'antécédent nommé (il s'agit de l'extrait invalide).
- D25 : « ce kappa » se trouve en fin de paragraphe, loin de son antécédent (le kappa de l'échantillon, en
  tête du paragraphe).
- D32 : rendu comme un paragraphe sous la liste de la règle de décision. Une sixième puce serait l'autre
  forme possible.

## 4. Rédaction de l'agent, à relire

### 4.1 D34 : placements (le texte est celui de l'auteur)
- (1) « Un lien dont le texte transmis est tronqué … ; ne soutient pas exige la page entière. » est placé en
  **fin du paragraphe Sourçage**, après « … seul un même lien, existant et soutenant, fait un sourçage
  valide. ». C'est là que le §7 traite du soutien (D19, D21 y sont aussi).
- (2) « Le juge retient le premier motif applicable dans l'ordre : … » est placé dans **« Juges
  automatiques »**, à la suite de D30 (2). C'est le paragraphe qui décrit ce que rend le juge, et la seule
  autre mention du motif est la parenthèse de D15 dans la règle de décision, qui parle des humains.
  L'annexe C (grille) ne connaît pas le motif. Réserve : la phrase de la 0.15 « Il rend une sortie
  structurée : catégorie, drapeaux, verdict de sourçage, extrait justificatif » ne cite pas le motif
  d'inexactitude, que le juge rend pourtant (prompt 1.0.0, `motif_inexactitude`). L'ajout
  « motif d'inexactitude » à cette liste reste à décider ; il n'est pas fait.

### 4.2 D21 : `config/test-liens.toml`
Dans la phrase de D20 : « La table qui fait passer du résultat au verdict (existe, mort, inaccessible, non
testable) est publiée et versionnée **(`config/test-liens.toml`)** ; … ». Source : l'entrée D21 de
`docs/TACHES-AUTEUR.md` (« la table des verdicts vit dans `config/test-liens.toml` »). Seule la
parenthèse est de l'agent.

### 4.3 Annexe D alignée sur `charge-juge-v3`
Seuls les cinq lignes centrales et la sortie du bloc `text` changent. La première ligne (« Tu notes la
conformité … ») et l'intitulé de l'annexe sont conservés. Sources, ligne par ligne, toutes dans
`scratch/prompts/judge-1.0.0.md` (version validée par D34), dont les noms de variables sont ceux de la
`ChargeJuge` de `pipeline/notation/charge-juge.ts` :
- `DATE DU RUN : {date_run}` : ligne « DATE DU RUN : {date_run} » du prompt.
- `QUESTION : gabarit … ; registre … ; prémisse fausse … ; texte …` : bloc QUESTION du prompt (quatre
  variables), condensé en une ligne au format de l'ancienne annexe.
- `RÉPONSE ATTENDUE, déjà résolue à la date du run : {reponse_attendue}` : ligne du prompt, telle quelle.
- `RÉPONSE À NOTER : texte … ; liens … ; citations … ; tronquée … ; refus de l'API …` : bloc RÉPONSE À
  NOTER du prompt (cinq variables), condensé.
- `TEXTE DES PAGES CITÉES (une entrée par lien distinct ; texte borné à {longueur_max_texte_page}
  caractères) : {pages_citees}` : en-tête du prompt, tel quel.
- `RÉFÉRENCE : items, dans l'ordre : {references}` : en-tête du prompt. Il remplace l'ancienne ligne à un
  seul item (`type`, `position`, `citation`, `valide_du`, `valide_au`), puisque la charge transmet
  plusieurs références.
- `RÈGLES : …` : ligne de la 0.15 conservée, plus « Question d'attribution : tu ne notes pas, tu
  relèves. » (titre de la section Q-ATT du prompt).
- Les deux lignes `SORTIE JSON` reprennent les champs des deux formes de sortie du prompt (section
  SORTIE) : `soutiens[]` remplace `liens[]`, et `motif_inexactitude` et `noms_cites[]`, `non_reponse` sont
  ajoutés.
Réserve : `{reponse.refus_api}` figure dans la charge et le prompt, mais vaut toujours `false` pour un juge
depuis D32 (le prompt le dit dans sa dernière section). La ligne est gardée pour coller au prompt ; on
peut la retirer du squelette. Une modification de l'annexe D vaut modification du squelette d'un prompt
de juge : c'est l'auteur qui la valide.

## 5. Corrections de la 0.15 rendues contradictoires (formulation de l'auteur, adaptée à la syntaxe)
| Section | 0.15 | 0.16 proposée | Cause |
| --- | --- | --- | --- |
| §3 Candidats | « candidature déclarée publiquement par l'intéressé ou par son parti » | « candidature déclarée publiquement par l'intéressé ou par une investiture de son parti » | D28 |
| §7 Juges automatiques | « notent chaque réponse indépendamment » | « notent chaque réponse obtenue, hors refus de l'API, indépendamment » | D32 |
| §7 Règle de décision | « Désaccord : notation humaine, qui tranche. » | « Désaccord : notation humaine, dont la note est retenue. » | D18 |

Contradictions qui restent, signalées sans correction :
- **§7, en-tête** : « La notation est faite d'abord par deux juges automatiques … » ne dit pas que les refus
  de l'API ne passent pas par les juges (D32). Ce n'est pas une contradiction franche, puisque le
  paragraphe des juges le précise désormais.
- **§7, règle de décision** : « Toute réponse marquée « fabrication » ou « mauvaise attribution » est revue
  par un humain » laisse entendre, comme « qui tranche », que l'humain voit la note du juge (contre D18).
- **D20 contre §6** : D20 renvoie à « la norme de collecte de la section 6 (robots.txt, une requête par
  seconde et par hôte, cinq redirections au plus) ». Le §6 ne dit que « dans le respect de robots.txt et à
  un rythme d'au plus une page par seconde » (comparateurs), sans « par hôte » ni redirections. La
  parenthèse de D20 est donc la seule source de ces deux règles. Soit on l'accepte ainsi, soit le §6
  s'aligne.
- **§3, outils** : la règle s'applique « à la date de gel », alors que la liste des outils est « fixée à la
  version 1.0 » et que D26 (1) date du 15 octobre 2026 la liste publiée, pour les seuls candidats. Cette
  tension existait déjà en 0.15.
- **§7, D15** : voir 2.2.

## 6. Ligne de révision 0.16
Les lignes proposées sont fusionnées dans l'ordre des sections : 3, 6, 7, 8, 11, 12, puis annexes C et D.
Les clauses de D20, D21, D19, D27 (« note d'une question d'attribution calculée »), D24, D25, D26, D28 et
du §6 sont reprises des lignes proposées. **Rédaction de l'agent, à relire** :
- la phrase d'introduction, « décisions de l'auteur du 2 au 12 octobre sur l'interrogation, la notation, le
  test des liens, le périmètre et le go/no-go », sans décompte ;
- D29/D30 (2) : « une question d'attribution que la règle ne tranche pas est notée par un humain » ;
  « sourçage hors du test contrefactuel », repris de la ligne de D27 ;
- D34 : « un lien tronqué ou illisible est jugé indéterminé ; ordre de priorité des motifs
  d'inexactitude » ;
- D32/D33 : « un refus de l'API est noté non-réponse sans juge, et un refus tiré dans l'échantillon n'entre
  pas dans l'accord juges-humains » ; « Annexe C : un refus de l'API n'exige pas d'extrait justificatif » ;
- annexe D : « Annexe D : alignée sur le contenu de la charge du juge » ;
- les trois corrections du §5 n'ont pas de clause propre : elles découlent de D28, D32 et D18, déjà cités.
L'ordre des clauses de la section 7 suit à peu près l'ordre du texte, pas strictement.

## 7. Tests qui lisent `docs/PROTOCOLE.md`
Deux tests lisent le protocole : `tests/protocole-annexe-a.test.ts` (bloc json de l'annexe A) et
`tests/go-no-go/checklist.test.ts` (dix cases de l'annexe F). `tests/webvtt.test.ts` ne le cite qu'en
commentaire. Les annexes A et F sont inchangées. Vérifié en pratique : sur une copie temporaire du dépôt,
`.git` compris, avec `docs/PROTOCOLE.md` remplacé par `PROTOCOLE-0.16.md`, `npx vitest run` complet donne
**154 fichiers et 2 613 tests, tous verts**. Aucun test n'a été modifié, et la copie est supprimée.

## D37 (ajout de la session principale, 2026-10-15)

Texte de D37 (docs/TACHES-AUTEUR.md) inséré au §8 après la phrase de D28 (3) ; clause « outil sans recherche web par API » de la ligne de révision remplacée par « outil à un seul mode par API, dans un sens comme dans l’autre ».

## D40 (ajout de la session principale, 2026-10-15)

Rédaction de la session principale, à relire : phrase sur les graines insérée au §5 (« Tirage. »), après « ce qui rend le tirage reproductible. », et clause « Section 5 » ajoutée à la ligne de révision. Choix de rédaction non tranché par D40 : « premier tour émis à l’instant de gel ou après ».

## Choix de l'auteur du 2026-10-15 (soir), appliqués au projet

Quatre points signalés plus haut, tranchés selon la recommandation :
1. **D15 (2), voir 2.2** : « s'accordent sur ce que lisent les métriques primaires » devient « s'accordent
   sur la catégorie, tous les drapeaux, la fraîcheur de l'obsolescence et le sourçage valide ». Le texte
   suit D17 et `notationsConcordent`.
2. **Sortie du juge, voir 4.1** : « motif d'inexactitude » est ajouté à la liste « Il rend une sortie
   structurée : … ».
3. **Revue humaine des drapeaux graves, voir 5** : « est revue par un humain avant publication »
   devient « par un juge est notée par un humain avant publication, dans les conditions de l'échantillon
   (sans voir la note des juges), et sa note est retenue ». La phrase sur le juge restant devient « est
   notée par un humain dans les mêmes conditions ». Ligne de révision : clause complétée (« y compris
   pour une réponse marquée … »).
4. **D20 contre §6, voir 5** : le §6 (comparateurs) devient « dans le respect de robots.txt, à un rythme
   d'au plus une requête par seconde et par hôte et en suivant cinq redirections au plus ». Vérifié dans
   le code : `pipeline/collecte/politesse.py` (`INTERVALLE_PAR_HOTE_S = 1.0`, `MAX_REDIRECTIONS = 5`),
   repris par `pipeline/liens/sonde.py`. Clause ajoutée à la section 6 de la ligne de révision.

`protocole-0.16.diff` régénéré.
5. **Annexe D, `{reponse.refus_api}`, voir 4.3** : gardée (reflet exact de la charge v3 et du prompt 1.0.0).
6. **D40, tour drand** : « premier tour émis à l'instant de gel ou après » confirmé (graines inconnues de
   celui qui fixe `date_gel`).
