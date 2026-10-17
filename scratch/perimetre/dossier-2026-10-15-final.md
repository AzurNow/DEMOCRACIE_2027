# Dossier de périmètre FINAL : date de référence (gel) du 2026-10-15

Relevés faits le **2026-10-15** entre **10 h 34 et 10 h 46 UTC** par un agent, pour la date de
référence du **2026-10-15** (décision D26). Ce dossier remplace, pour les verdicts, le dossier
provisoire `dossier-2026-10-15.md` (relevés du 2026-10-09), qui n'a pas été modifié.

Les règles appliquées sont celles du §3 du protocole, complétées par la **décision D28** de
l'auteur. Elle a été tranchée le 2026-10-09 et n'est **pas encore recopiée dans le protocole**.
Ses quatre points :

1. **D28-1** : un candidat éliminé au premier tour d'une primaire est retiré dès la proclamation
   du résultat.
2. **D28-2** : seule compte une déclaration explicite (« je suis / serai candidat ») de
   l'intéressé, ou une investiture de son parti. Une intention (« je veux être candidat ») ne
   compte pas.
3. **D28-3** : un assistant qui remplit la règle d'inclusion mais dont l'API n'offre pas de
   recherche web est inclus, avec le seul mode sans web.
4. **D28-4** : Gemini est inclus, avec la clause restrictive signalée et le mode web suspendu
   jusqu'à l'avis de l'avocat.

Ce dossier n'écrit rien dans `config/`, `data/`, `docs/` ni `prompts/`, et n'archive rien : les
URL à archiver sont dans `urls-a-archiver-2026-10-15.txt`. Les relevés bruts horodatés sont dans
`releves-2026-10-15/` :

| Fichier | Contenu |
|---|---|
| `cds-liste-2027-presidentielle.html` | liste thématique de la Commission des sondages, 10:34 UTC |
| `notices-index-sha256.txt` | notices n° 2246 à 2335 : code HTTP, URL de redirection, SHA-256 |
| `notices-iv-noms-extraits.txt` | noms relevés dans les 20 notices d'intention de vote, et dans les notices du 8 au 15 octobre écartées |
| `apple-rss-top-gratuit-productivite-fr.json` | flux officiel Apple |
| `apple-lookup-assistants-fr.json` | lookup Apple (prix, langues) |
| `appbrain-top-gratuit-productivite-fr.html` et `.txt` | classement Google Play relevé par AppBrain |
| `choisir2027-accueil-http.html` | page de parking Gandi servie le 15 octobre |
| `wayback-choisir2027-20261010173102.html` (+ `.raw.gz`) | copie Wayback existante du 10 octobre, lue et non créée |
| `place-publique-accueil.html` | annonce du résultat de la primaire par Place publique |
| `francoisruffin.fr.html`, `marinetondelier.fr.html`, `nicolasdupontaignan.fr.html`, `debout-la-france.fr.html`, `lafrancehumaniste.fr.html`, `lesecologistes.fr.html` | pages des candidats et partis |
| `syntec-etudes.html`, `syntec-membres.html` | listes des membres de Syntec Conseil |
| `comparateurs-releve.txt` | relevé des comparateurs citoyens |
| `wikipedia-candidatures-2027-raw-2026-10-15.txt` | source secondaire |

Conventions (identiques à celles du 9) :
- **lu** : fait constaté sur la page dont l'URL est donnée, le 2026-10-15 sauf mention contraire ;
- **déduit** : conclusion que je tire, et non texte de la page ;
- **secondaire** : seule une source de presse ou une encyclopédie a été trouvée ;
- **non trouvé** : cherché sans résultat (ce qui a été cherché est indiqué) ;
- **relevé du 9, non relu** : fait repris du dossier provisoire et non revérifié aujourd'hui.

---

## 0. Incertitudes et trous

### 0.1 Ce qui reste ouvert au moment du relevé (10 h 46 UTC le 15 octobre)

1. **Le jour du gel n'est pas terminé, et ce relevé ne peut pas être définitif (trou du
   protocole).** Le §3 lit une date de publication « à minuit UTC », bornes comprises. Il dit
   aussi : « La déclaration de candidature date au plus tard du jour du gel, lue de même. »
   - **Déduit** : un sondage publié ou une déclaration faite **plus tard dans la journée du 15**
     se lit comme daté du 2026-10-15 00:00 UTC, donc dans la fenêtre.
   - La Commission des sondages met en ligne les notices avec un à deux jours de retard. Exemple
     lu : 2327, publiée le 14 octobre, figure dans la liste le 15 au matin. Un sondage publié le 15
     peut n'apparaître que le 16 ou le 17.
   - Le protocole ne dit pas **quand le relevé doit être fait** pour être réputé complet.
   - **À trancher par l'auteur** : par exemple, relire la liste de la Commission et les
     déclarations le 2026-10-17, en ne retenant que ce qui est daté au plus tard du 15. Je ne
     tranche pas.
   - Cas concrets :
     - Bruno Le Maire avait annoncé une réponse « en octobre » ;
     - une notice 2331 ou suivante a répondu 404 à 10 h 36 UTC.
2. **Primaire PS–Place publique–GRS : terminée au premier tour.** Raphaël Glucksmann l'a emportée
   dès le premier tour (détails et sources en §1.3). Le second tour des 16-17 octobre n'a donc pas
   lieu (déduit). Conséquences :
   - par le §3 (« le vainqueur seul reste ensuite ») et par D28-1, Faure, Royal, Guedj et Maurel
     sont retirés ;
   - le point 0.1-2 du dossier provisoire est donc sans objet.

   Ce qui reste incertain :
   - **la proclamation officielle n'a pas été lue**. Le site de la primaire, `choisir2027.fr`,
     refuse les connexions HTTPS le 15 octobre. En HTTP, il sert une page de parking Gandi
     (« choisir2027.fr is unavailable »), lue et copiée dans `choisir2027-accueil-http.html`. La
     dernière copie Wayback existante (2026-10-10 17:31 UTC) ne contient aucun résultat ;
   - **les chiffres divergent** :
     - 66,17 % selon Place publique et Wikipédia ;
     - 66,13 % selon Touteleurope ;
     - pour Guedj, 5,83 % selon Wikipédia et 5,80 % selon Touteleurope ;
   - **le calendrier diverge** :
     - la FAQ de choisir2027 (copie du 10 octobre) annonçait un premier tour « du vendredi
       9 octobre 2026 à 8 h 00 au samedi 10 octobre 2026 à 20 h 00 » ;
     - le même site annonçait aussi « 9, 10 et 11 octobre Premier tour de la primaire » ;
     - Place publique et la presse placent la désignation au dimanche 11 octobre.

   Rien de cela ne change un verdict : la proclamation date au plus tard du 11 octobre, avant le
   gel.
3. **Primaire de la gauche unitaire (annoncée pour le 11 octobre)** :
   - **source primaire non trouvée** sur son déroulement ou son annulation. J'ai cherché un
     résultat ou une annonce d'annulation (recherche web « primaire gauche unitaire 11 octobre
     2026 Tondelier Ruffin »), et le site des Écologistes répond 403 ;
   - en **secondaire** : Wikipédia EN la dit « Cancelled » avec la mention « Citation needed » ;
     Wikipédia FR parle d'un « projet non abouti », « de facto abandonné à partir de juillet
     2026 ».

   Ruffin et Tondelier affichent toujours leur candidature sur leurs sites (lu, voir §1.3). D28-1
   ne s'applique donc pas : aucun résultat de premier tour n'a été proclamé.
4. **Adhésion des instituts** :
   - **un nouvel institut apparaît : Odoxa** (sondage 2325). Odoxa ne figure pas dans les listes
     de Syntec Conseil (lu). Je n'ai trouvé **aucune mention d'association professionnelle** sur
     <https://www.odoxa.fr/> ;
   - pour Cluster17 et YouGov, il n'y a toujours **aucune preuve** :
     - <https://cluster17.com/> et <https://fr.yougov.com/> ne contiennent ni « ESOMAR » ni
       « Syntec » (lu) ;
     - l'annuaire ESOMAR (<https://directory.esomar.org/>) est rendu en JavaScript, et ses pages
       par pays ne listent rien sans navigateur ;
     - la recherche web « directory.esomar.org YouGov France OR Cluster17 OR Odoxa » n'a rien
       donné.

   Cela ne change **aucun verdict** : chaque inclus a au moins deux sondages d'instituts membres
   de Syntec (§1.4).

### 0.2 Ambiguïtés de la règle rencontrées le 15 octobre (à porter en amendement si l'auteur le juge utile)

- **Statut des perdants d'une primaire jamais passés par un run.** Le §3 dit qu'un candidat qui
  se retire « reste dans le jeu de données (statut « retiré ») ». Faure et Royal étaient
  « inclus » dans le dossier provisoire du 9, mais aucun run n'a eu lieu. Faut-il les créer dans
  le jeu de données avec le statut « retiré », ou ne jamais les y faire entrer ? Même question
  pour Guedj et Maurel, qui n'ont jamais rempli la condition des deux sondages. **À trancher.**
- **Date de publication d'une notice ancienne entrée tard dans la liste.** Les notices 2257 et
  2258 (OpinionWay pour POLLITICS) n'étaient pas dans la liste thématique le 9 ; elles y sont le
  15 (lu). Leurs libellés n'ont pas d'année :
  - 2257 : « 10166A Pres IV OPINIONWAY LOpinion 30 mars » ;
  - 2258 : « 9889A Pres IV OPINIONWAY Challenges 18 septembre ».

  La notice 2258 porte « Septembre 2024 » (lu). Lu sans année, « 18 septembre » pourrait passer
  pour 2026, donc dans la fenêtre. Je retiens l'année de la notice : **les deux sont hors
  fenêtre**. 2258 teste Arthaud, Roussel, Mélenchon, Glucksmann, Attal, Philippe, Le Pen et
  Zemmour, déjà tous inclus : aucun effet. **La règle ne dit pas quelle date prime** quand la
  liste et la notice divergent.
- **Intention de vote utilisée seulement comme variable de tri croisé.** La notice 2315 (Verian,
  « stature présidentielle ») contient des tableaux ventilés par « Intention de vote présidentielle
  2027 », mais ne publie pas les résultats d'une question d'intention de vote. Elle est écartée,
  comme le 9. La règle ne tranche pas ce cas ; il n'a aucun effet ici.
- **Question « bon ou mauvais candidat ».** La notice Odoxa 2325 (Q5) présente Hollande, Royal,
  Guedj, Maurel, Faure, de Villepin et Lisnard, mais pas dans une question d'intention de vote. Je
  ne la compte pas pour eux, par la même convention que le 9.
- **Assistant dont l'API ne permet que le mode avec web.** D28-3 couvre le cas inverse (pas de
  recherche web). Pour Perplexity :
  - la désactivation de la recherche (`disable_search`) n'est attestée qu'en secondaire (résultat
    de recherche citant la documentation) ;
  - la page de documentation correspondante redirige le 15 octobre vers « Migrate from Sonar to the
    Agent API » (lu).

  Si le mode sans web s'avérait impossible, aucune règle ne dit quoi faire. **À trancher si le
  cas se confirme.**
- **Rang 50 exactement.** Sur Google Play (AppBrain), « Chatbot App - AI Assistant » (TapSuite,
  application tierce) est au rang **50**. Je lis « 50 premières » (D26) comme incluant le rang 50.
  Sans effet : l'application est exclue faute d'API officielle.
- **Trou dans la source tierce.** Le classement AppBrain du 15 octobre n'a **pas de rang 6** : le
  HTML passe de la ligne 5 (Meta AI) à la ligne 7 (Free) (lu). Le rang réel des applications
  suivantes est donc incertain d'une unité. Aucun assistant n'est près du seuil sur Google Play
  au point que cela compte (déduit).
- **Restent ouverts depuis le 9** (non tranchés, rappel) :
  - Gemini Notebook et Grok Bot sont-ils des « assistants conversationnels » ?
  - libellé « Le Chat » ou « Vibe by Mistral » ;
  - lecture de « sans exécution de scripts tiers » pour les comparateurs ;
  - nom à utiliser pour la barrière de symétrie (« de Villepin »), désormais sans objet puisqu'il
    est exclu.

### 0.3 Constats qui touchent d'autres sections du protocole (à signaler, pas à trancher ici)

- **Gemini** : D28-4 est appliquée (mode web suspendu). Les citations des conditions de l'API sont
  celles du 9 (§2.3 du dossier provisoire), **relevé du 9, non relu**.
- **DeepSeek** : la page d'accueil de la documentation de l'API (<https://api-docs.deepseek.com/>)
  ne contient aucune occurrence de « search » (lu). Par D28-3, l'outil est inclus avec le seul
  mode sans web.
- **Grok** : sur l'App Store, l'artiste affiché dans le flux de classement est désormais
  « X Corp. ». Le lookup donne toujours le vendeur « TWITTER INTERNATIONAL UNLIMITED COMPANY », et
  AppBrain affiche « SpaceXAI » (lu). Les éditeurs nommés diffèrent selon la source.
- **Bruno Le Maire** : Wikipédia (secondaire) lui attribue la fonction de « Ministre d'État,
  Ministre des Armées » en 2026. Non vérifié, et sans effet sur la règle.

---

## 1. Candidats (régime `avant_liste_officielle`)

Fenêtre des sondages : **du 2026-08-16 00:00 UTC au 2026-10-15 inclus** (60 jours avant le gel,
bornes comprises, date de publication lue à minuit UTC). Elle a été observée jusqu'au
2026-10-15 à 10 h 34 UTC (voir 0.1-1).

**Sondages sortis de la fenêtre au début : aucun.** La fenêtre est la même que le 9, puisque la
date de référence est fixe. La première intention de vote de la fenêtre reste 2248 (24 août) ;
avant elle, la dernière notice de la liste est 2247 (YouGov, baromètre, 8 août), qui n'est pas une
intention de vote.

### 1.1 Sondages d'intention de vote publiés dans la fenêtre (vus au 2026-10-15)

Source de la liste (lu à 10:34 UTC) :
<https://www.commission-des-sondages.fr/notices/medias/fichiers/bytag/14/2027-Presidentielle>.

Méthode :
1. J'ai retéléchargé toutes les notices n° 2246 à 2335 ; les n° 2331 à 2335 répondent 404.
2. J'ai extrait leur texte (PyMuPDF) et repéré les questions d'intention de vote de premier ou de
   second tour.
3. J'ai relevé les personnalités, par extraction automatique relue à la main.

Les SHA-256 des 17 notices retenues le 9 sont **identiques** le 15 (comparaison faite).

**Les 17 publications retenues le 9 restent valables** (tableau complet en §1.1 du dossier
provisoire). S'y ajoutent **3 nouvelles publications** :

| N° CdS (add/) | Institut | Commanditaire (lu dans la notice) | Terrain (lu) | Publication | Association de l'institut | URL de la notice | SHA-256 (2026-10-15) |
|---|---|---|---|---|---|---|---|
| 2321 | Toluna Harris Interactive | M6 & RTL | 5–8 octobre | notice : « 12 octobre 2026 » ; liste CdS : 12 oct. | Syntec (TOLUNA, HARRIS INTERACTIVE) | <https://www.commission-des-sondages.fr/notices/files/notices/2026/octobre/10305-pres-iv-toluna-harris-interactive-12-octobre.pdf> | 71bea2f6…19b49891 |
| 2325 | Odoxa | « BACKBONE, PUBLIC SENAT, LA PRESSE REGIONALE ET LE NOUVEL OBS » | 24 sept. – 7 oct. | notice : « Première publication sur le site www.odoxa.fr, le 14 octobre 2026 à 18h » | **non trouvée** | <https://www.commission-des-sondages.fr/notices/files/notices/2026/octobre/10310-pres-iv-odoxa-14-octobre.pdf> | a440565c…928989b8 |
| 2327 | Ifop(-Fiducial) | « Ifop-Fiducial pour LCI et Sud Radio » | 12–14 octobre | liste CdS : 14 oct. | Syntec (IFOP) | <https://www.commission-des-sondages.fr/notices/files/notices/2026/octobre/10314-pres-climat-politique-post-primaire-ps-pp-ifop-lci-14-octobre.pdf> | ba39abd0…aa05316 |

Empreintes complètes :

```
2321 71bea2f6ee85ee22834fac0f9ead6d49d867638201900e3f215ecb8119b49891
2325 a440565c8e31b8c3faedc7ba7baf3a53b317b1a4087fb868eaafec03928989b8
2327 ba39abd096d914380c4cf9c88c89a9caad048391acca1c39d8857799eaa05316
```

Les empreintes des 17 autres sont en §1.6 du dossier provisoire, et pour les 90 numéros dans
`releves-2026-10-15/notices-index-sha256.txt`.

**Notices du 8 au 15 octobre lues et écartées** (aucune intention de vote présidentielle publiée) :

| Notice | Libellé dans la liste CdS | Raison de l'écart |
|---|---|---|
| 2317 | Suivi potentiel électoral Toluna HI / L'Opinion, 8 oct. | potentiel électoral, pas d'intention de vote (comme 2249) |
| 2318 | Propos M. Bardella, Ifop / LCI, 9 oct. | pas d'intention de vote |
| 2319 | CSA / CNews, 10 oct. | noms présents seulement dans la reconstitution du vote 2022 |
| 2320 | Primaire PS, Toluna HI, 9 oct. | intention de vote à la primaire, pas à la présidentielle (convention du 9) |
| 2322 | Baromètre Ipsos BVA / La Tribune Dimanche, 10 oct. | pas d'intention de vote |
| 2323 | Pouvoir d'achat, Ifop / Le Figaro, 12 oct. | pas d'intention de vote |
| 2324 | IA et élection, Verian / L'Hémicycle, 14 oct. | pas d'intention de vote (« premier tour » n'y apparaît qu'à propos du suivi de la campagne et de la reconstitution) |
| 2326 | Ifop, 14 oct. | pas d'intention de vote |
| 2328 | Laïcité et fait religieux, Ifop, 14 oct. | pas d'intention de vote |
| 2329 | Peuple de droite, Ifop / Valeurs actuelles, 14 oct. | pas d'intention de vote |
| 2330 | Blocus lycées, CSA / JDD, 15 oct. | pas d'intention de vote |

Les notices 2257 et 2258, désormais présentes dans la liste, sont hors fenêtre (voir 0.2).

### 1.2 Présence des personnalités : décompte au 2026-10-15

Hypothèses relevées dans les nouvelles notices (lu) :

- **2321 (Toluna HI)** : six hypothèses de premier tour :
  - « Hypothèse Raphaël Glucksmann, Édouard Philippe et Gabriel Attal » ;
  - « … Raphaël Glucksmann et Édouard Philippe » ;
  - « … Raphaël Glucksmann et Gabriel Attal » ;
  - « … François Hollande et Édouard Philippe » ;
  - « … François Hollande et Gabriel Attal » ;
  - une hypothèse sans libellé.

  Toutes contiennent Arthaud, Mélenchon, Roussel, Tondelier, Retailleau, Dupont-Aignan, Le Pen et
  Zemmour. Second tour : Mélenchon, Attal, Philippe, Glucksmann, Retailleau ou Hollande face à
  Le Pen.

  Bardella n'y figure que dans une question de qualificatifs (« correspond très bien… à Jordan
  Bardella »), Faure seulement dans une liste de notes de 0 à 10 : ni l'un ni l'autre n'est
  compté.
- **2325 (Odoxa)** : Q2 « Si le premier tour de l'élection présidentielle avait lieu dimanche
  prochain… ». La liste comprend Arthaud, Roussel, Mélenchon, Tondelier, Glucksmann, Philippe,
  Retailleau, Dupont-Aignan, Le Pen et Zemmour. Q2ter remplace Philippe par Attal. Seconds
  tours : Philippe contre Le Pen, Mélenchon contre Le Pen.
- **2327 (Ifop)** : quatre hypothèses :
  - « E. Philippe et G. Attal candidats » ;
  - « E. Philippe candidat du bloc central » ;
  - « G. Attal candidat du bloc central » ;
  - « F. Ruffin, D. de Villepin et D. Lisnard candidats ».

  La quatrième liste : Arthaud, Mélenchon, Roussel, Ruffin, Tondelier, Glucksmann, Attal, Philippe,
  de Villepin, Lisnard, Retailleau, Dupont-Aignan, Le Pen et Zemmour.

Décompte. « Syntec » désigne les sondages d'instituts figurant sur la liste de Syntec Conseil
(Études) : Elabe, Harris Interactive / Toluna, Ifop, Ipsos BVA et Verian.

| Personnalité | Total au 9 (17 publ.) | 2321 | 2325 | 2327 | **Total au 15 (20 publ.)** | dont Syntec |
|---|---|---|---|---|---|---|
| Nathalie Arthaud | 17 | x | x | x | **20** | 11 |
| Fabien Roussel | 17 | x | x | x | **20** | 11 |
| Jean-Luc Mélenchon | 17 | x | x | x | **20** | 11 |
| François Ruffin | 4 |  |  | x | **5** | 3 (2253, 2308, 2327) |
| Marine Tondelier | 17 | x | x | x | **20** | 11 |
| Raphaël Glucksmann | 17 | x | x | x | **20** | 11 |
| Olivier Faure | 5 |  |  |  | 5 | 4 |
| François Hollande | 9 | x |  |  | **10** | 7 |
| Ségolène Royal | 2 |  |  |  | 2 | 1 + OpinionWay |
| Karim Bouamrane | 1 |  |  |  | 1 | 0 |
| Jérôme Guedj | 1 |  |  |  | 1 | 1 |
| Emmanuel Maurel | 1 |  |  |  | 1 | 1 |
| Gabriel Attal | 17 | x | x | x | **20** | 11 |
| Édouard Philippe | 17 | x | x | x | **20** | 11 |
| Bruno Le Maire | 2 |  |  |  | 2 | 1 (2250) + YouGov |
| Dominique de Villepin | 5 |  |  | x | **6** | 3 (2253, 2308, 2327) |
| Bruno Retailleau | 17 | x | x | x | **20** | 11 |
| David Lisnard | 6 |  |  | x | **7** | 3 (2253, 2308, 2327) |
| Xavier Bertrand | 1 |  |  |  | 1 | 0 |
| Nicolas Dupont-Aignan | 15 | x | x | x | **18** | 11 |
| Marine Le Pen | 17 | x | x | x | **20** | 11 |
| Éric Zemmour | 17 | x | x | x | **20** | 11 |
| Sébastien Bonnal | 1 |  |  |  | 1 | 0 |
| Jordan Bardella | 0 |  |  |  | 0 | — |

**Recomptage demandé (Guedj, Maurel, Bouamrane, Bertrand, Bonnal, Le Maire) : aucun ne gagne
de sondage entre le 10 et le 15 octobre.** J'ai aussi vérifié les mentions de Le Maire dans
Cluster17 2263 (questions sur les « qualités nécessaires » et le « mieux placé pour représenter
le bloc central », pas d'intention de vote). J'ai vérifié de même les mentions de Royal, Guedj et
Maurel dans 2270 et 2290 (préférence pour un candidat PS-PP). Ces vérifications confirment
l'écart fait le 9.

Les déclarés récents **Natacha Polony** et **Gilles Platret** n'apparaissent dans aucune des 20
notices d'intention de vote. Leur nom ne figure que dans 2317, une notice de potentiel électoral
(lu).

### 1.3 Déclarations et verdicts au 2026-10-15

Légende : **I** = inclus ; **E** = exclu (motif) ; **?** = incertain. Les contacts n'ont pas été
relus le 15 (**relevé du 9, non relu**, voir le dossier provisoire).

#### Inclus

| Candidat | Déclaration (preuve) | Sondages au 15 | Changement depuis le 9 | Verdict |
|---|---|---|---|---|
| Nathalie Arthaud | relevé du 9, non relu : vidéo « Nathalie Arthaud, candidate Lutte ouvrière » du 26/08/2026 sur <https://lutte-ouvriere.org/> ; presse du 2025-12-08 | 20 (11) | +3 sondages | **I** |
| Fabien Roussel | relevé du 9, non relu : Le Figaro et LCP, 2026-09-06 ; <https://fabienroussel2027.fr/> | 20 (11) | +3 | **I** |
| Jean-Luc Mélenchon | relevé du 9, non relu : <https://melenchon2027.fr/> | 20 (11) | +3 | **I** |
| François Ruffin | **lu le 15** : <https://francoisruffin.fr/> affiche « Je suis candidat à la présidence de la République française. Rejoignez la campagne ! » ; billets datés « octobre 1, 2026 » (« Présidentielles 2027 : François Ruffin face à Sonia Mabrouk ») | 5 (3) | +1 (2327). La primaire unitaire n'a produit aucune élimination (0.1-3) | **I** |
| Marine Tondelier | **lu le 15** : titre de <https://marinetondelier.fr/> : « Marine Tondelier – Candidate à l’élection présidentielle » | 20 (11) | +3. Même remarque sur la primaire unitaire | **I** |
| Raphaël Glucksmann | **lu le 15** : <https://place-publique.eu/> : « Raphaël Glucksmann remporte la primaire ! » ; « Le dimanche 11 octobre, 79 613 votants ont désigné Raphaël Glucksmann pour porter nos couleurs et nos idées. » ; « Avec 66,17 % des suffrages… ». Sur <https://glucks2027.fr/> : « Cette victoire est un début. Aujourd’hui commence la bataille de France. » Investiture par les partis organisateurs (déduit : Place publique est co-organisateur de la primaire) | 20 (11) | +3 ; **vainqueur de la primaire**, reste seul (§3) | **I** |
| Gabriel Attal | relevé du 9, non relu : RTL, 2026-05-22 (secondaire) | 20 (11) | +3 | **I** |
| Édouard Philippe | relevé du 9, non relu : <https://www.edouardphilippe.fr/> | 20 (11) | +3 | **I** |
| Bruno Retailleau | relevé du 9, non relu : <https://republicains.fr/actualites/2026/02/12/je-suis-candidat-a-lelection-presidentielle/> | 20 (11) | +3 | **I** |
| David Lisnard | relevé du 9, non relu : <https://lisnard2027.fr/> | 7 (3) | +1 (2327) | **I** |
| Nicolas Dupont-Aignan | **lu le 15, source primaire** : titre de <https://www.nicolasdupontaignan.fr/> : « Nicolas Dupont-Aignan - Candidat à l'élection présidentielle 2027 ! » ; billet affiché sur la même page : « Je serai le candidat en 2027 des 55 % de Français qui ont voté NON au référendum sur la constitution européenne. » | 18 (11) | +3 ; **la preuve de déclaration est désormais primaire** (le 9, elle n'était que secondaire) | **I** |
| Marine Le Pen | relevé du 9, non relu : lettre du 07/09/2026 signée « Candidate à l'élection présidentielle de 2027 » (<https://rassemblementnational.fr/lettre-ouverte/lettre-ouverte-de-marine-le-pen-aux-buralistes-de-france>) | 20 (11) | +3 | **I** |
| Éric Zemmour | relevé du 9, non relu : BFMTV et franceinfo, 2026-09-17 (secondaire ; source primaire non trouvée) | 20 (11) | +3 | **I** |

#### Primaire PS–Place publique–GRS : résultat

| Source | Ce qui est lu | Nature |
|---|---|---|
| <https://place-publique.eu/> (lu le 15 à 10:39 UTC ; copie `place-publique-accueil.html`, SHA-256 `d4cb352c6edf32a0b5984891134625612fba3cc9721c35fddfee6c216c833c9b`) | Glucksmann vainqueur, « Le dimanche 11 octobre », 79 613 votants, « 66,17 % » ; rien sur les autres candidats | primaire (parti co-organisateur) |
| Touteleurope, « Primaire à gauche : Raphaël Glucksmann désigné candidat à la Présidentielle 2027 du camp social-démocrate », « Publié le 11.10.2026 » | Glucksmann 66,13 % (79 613 voix), « élu dès le premier tour » ; Faure 14,46 % ; Royal 7,62 % ; Maurel 5,92 % ; Guedj 5,80 % ; 120 587 votants, dont 120 307 suffrages exprimés, selon Patrick Menucci, président de la commission d'organisation | secondaire |
| Wikipédia FR, « Candidatures à l'élection présidentielle française de 2027 » (raw lu le 15) | tableau « Résultats définitifs validés par la Haute Autorité » : Glucksmann 79 613 (66,17), Faure 17 398 (14,46), Royal 9 165 (7,62), Maurel 7 119 (5,92), Guedj 7 012 (5,83) ; « les autres candidats en lice … retirent leur candidature » | secondaire |
| CNews, 2026-10-11 | HTTP 403 pour mon outil | non lu |
| <https://choisir2027.fr/> | HTTPS refusé ; en HTTP, page de parking Gandi | **proclamation officielle non trouvée** |
| PS, <https://www.parti-socialiste.fr/actualites> | dernière actualité visible sur la primaire : « Inscris-toi vite pour participer à la primaire Choisir 2027 ! » (2 octobre 2026) ; aucun résultat | non trouvé |

#### Exclus

| Personnalité | Motif | Preuves | Changement depuis le 9 |
|---|---|---|---|
| Olivier Faure | **perdant de la primaire**, retiré dès la proclamation (D28-1 ; §3 « le vainqueur seul reste ensuite ») | sources du tableau ci-dessus | était **I** sous réserve |
| Ségolène Royal | **perdante de la primaire** (D28-1 ; §3) | idem | était **I** sous réserve |
| Jérôme Guedj | perdant de la primaire ; un seul sondage | idem ; 2308 | inchangé (**E**) ; motif complété |
| Emmanuel Maurel | perdant de la primaire ; un seul sondage | idem ; 2308 | inchangé (**E**) ; motif complété |
| Dominique de Villepin | **D28-2 : intention seulement**. Déclaration connue : « Je veux être candidat, je me bats pour être candidat » (franceinfo, 2026-08-30, relevé du 9). **Aucune déclaration explicite trouvée** du 10 au 15 octobre : <https://lafrancehumaniste.fr/> ne contient ni « candidat » ni « candidature » (lu) ; recherche web « Dominique de Villepin "je suis candidat" présidentielle 2027 octobre » sans résultat ; Wikipédia FR le classe toujours parmi les pressentis (secondaire) | 6 sondages (3 Syntec) : la condition des sondages est remplie | était **?** |
| Bruno Le Maire | **aucune déclaration trouvée** au 15 octobre à 10:45 UTC. Recherches web « Bruno Le Maire candidat présidentielle 2027 annonce octobre 2026 » et « "Le Maire" présidentielle "candidat" 13 OR 14 OR 15 octobre 2026 » : rien de postérieur à juin 2026 ; Wikipédia FR le classe parmi les pressentis (secondaire). Seulement 2 sondages, dont un YouGov d'adhésion non prouvée | 2250, 2293 | était **?**. **Voir 0.1-1** : une déclaration faite plus tard le 15 compterait ; il resterait alors la question YouGov |
| François Hollande | non déclaré ; Wikipédia FR le classe parmi les pressentis (secondaire) ; relevé du 9 : « donne rendez-vous en décembre » (France 3, 2026-10-03) | 10 sondages | inchangé |
| Karim Bouamrane | un seul sondage | 2273 | inchangé |
| Xavier Bertrand | un seul sondage (YouGov) | 2293 | inchangé |
| Sébastien Bonnal | un seul sondage (commandé par lui-même) | 2277 | inchangé |
| Jordan Bardella | non déclaré ; aucun sondage d'intention de vote | — | inchangé |

**Déclarés sans aucun sondage d'intention de vote dans la fenêtre** (donc **E**). Liste reprise du
9 (secondaire, Wikipédia) : Asselineau, Batho, Becht, Cazeneuve, Durif, Kazib, Labib, Lalanne,
Markovic, Mathieu, Mlekuz et Philippot. S'y ajoutent deux noms :

| Déclaré | Date selon la source | Source (secondaire) |
|---|---|---|
| Gilles Platret (DVD, maire de Chalon-sur-Saône) | 2026-10-08, meeting à Chalon-sur-Saône | Le Parisien, 2026-10-09, cité par Wikipédia FR (non lu directement) |
| Natacha Polony (SE) | 2026-10-14, sur France Inter | Le Figaro, « Présidentielle 2027 : «Je suis candidate», annonce la journaliste Natacha Polony », 2026-10-14, cité par Wikipédia FR (non lu directement) |

Platret, déclaré le 8, n'apparaissait pas dans le dossier provisoire : manque du relevé du 9.

### 1.4 Vérification de la condition « deux sondages » par les seuls instituts Syntec

Tous les inclus ont au moins trois sondages Syntec :

| Seuil atteint | Candidats |
|---|---|
| 11 sondages Syntec | Arthaud, Roussel, Mélenchon, Tondelier, Glucksmann, Attal, Philippe, Retailleau, Dupont-Aignan, Le Pen, Zemmour |
| 3 sondages Syntec | Ruffin et Lisnard (2253 Elabe, 2308 Ifop, 2327 Ifop) |

Les adhésions non prouvées (Cluster17, YouGov, Odoxa) et l'adhésion déclarée par l'institut lui-même
(OpinionWay) **ne changent donc aucun verdict**.

### 1.5 Sources des adhésions des instituts (relues le 15)

| Institut | Association | Source |
|---|---|---|
| Elabe, Harris Interactive, Toluna, Ifop, Ipsos BVA, Verian | Syntec Conseil (Études) | lu le 15 : attributs de logos « ELABE », « HARRIS INTERACTIVE », « IFOP », « IPSOS BVA », « TOLUNA », « VERIAN » sur <https://syntec-conseil.fr/expertises/etudes/> et <https://syntec-conseil.fr/nos-membres/> |
| OpinionWay | ESOMAR (déclaration de l'institut) | lu le 15 : <https://www.opinion-way.com/fr/> : « Membre actif d'Esomar et du réseau WIN » |
| Odoxa | — | **non trouvée** : absente des deux pages Syntec ; aucune mention sur <https://www.odoxa.fr/> ; <https://www.odoxa.fr/qui-sommes-nous/> répond 404 |
| Cluster17 | — | **non trouvée** (<https://cluster17.com/> lu) |
| YouGov | — | **non trouvée** (<https://fr.yougov.com/>, <https://business.yougov.com/fr/>, <https://today.yougov.com/about>, <https://corporate.yougov.com/> lus : aucune mention d'ESOMAR ni de Syntec) |

---

## 2. Assistants IA (famille « assistant »)

Règle (§3, D26, D28-3, D28-4) : l'assistant doit remplir trois conditions :
- être accessible gratuitement en français ;
- disposer d'une API officielle ;
- figurer dans les **50 premières applications gratuites de la catégorie Productivité en France**,
  sur l'App Store **ou** sur Google Play.

Le Chat est inclus d'office.

### 2.1 Relevés de classement (2026-10-15), mêmes méthodes que le 9

**App Store France, apps gratuites, Productivité (genre 6007)** :
- flux officiel <https://itunes.apple.com/fr/rss/topfreeapplications/limit=100/genre=6007/json> ;
- le flux est horodaté `2026-10-15T03:42:08-07:00` et intitulé « iTunes Store : Classement des
  apps gratuites - Productivity » (lu) ;
- relevé à 10:42 UTC ; copie : `releves-2026-10-15/apple-rss-top-gratuit-productivite-fr.json`.

**Google Play France, gratuites, Productivité** :
- source **tierce** : AppBrain, <https://www.appbrain.com/stats/google-play-rankings/top_free/productivity/fr> ;
- la page indique « Last updated: October 15, 2026 », avec `og:updated_time=2026-10-15T06:42:10Z`
  (lu) ;
- copies : `appbrain-top-gratuit-productivite-fr.html` et `.txt` ;
- rappel du 9 : Google ne publie aucun classement officiel. Anomalie du jour : pas de rang 6 (0.2).

**Langue et gratuité** : le lookup officiel d'Apple
(<https://itunes.apple.com/lookup?id=6448311069,6473753684,6477489729,1558240027,541164041,6670324846,6740410176,1668000334,6737597349,1658377526,6737527615,6794501026&country=fr>,
relevé à 10:42 UTC) renvoie 12 résultats. Pour chacun, `formattedPrice` vaut « Gratuit » et
`languageCodesISO2A` contient `FR` (lu). Copie : `apple-lookup-assistants-fr.json`.

**Déduit**, comme le 9 : le téléchargement est gratuit et l'interface est disponible en français.
L'usage conversationnel gratuit sans abonnement n'est pas prouvé par ces champs.

| Assistant (nom dans le store) | Éditeur | App Store, rang le 15 (le 9) | Google Play AppBrain, rang le 15 (le 9) | Top 50 d'au moins un store le 15 |
|---|---|---|---|---|
| Claude by Anthropic | Anthropic | **1** (1) | **4** (3) | oui |
| Google Gemini | Google | **2** (2) | **9** (9) | oui |
| ChatGPT | OpenAI | **3** (3) | **1** (1) | oui |
| Meta AI | Meta | **5** (5) | **5** (5) | oui |
| Grok - Assistant IA | xAI (artiste du flux : « X Corp. » ; vendeur du lookup : Twitter International Unlimited Company) | **10** (13) | **25** (25) | oui |
| Microsoft Copilot | Microsoft | **11** (6) | **19** (19) | oui |
| Gemini Notebook | Google | **27** (29) | **33** (33) | oui (catégorie discutable) |
| IA Chatbot Français - Genie AI | Appnation (tiers) | **35** (37) | **43** (53) | oui |
| Perplexity - Vos questions | Perplexity AI | **36** (36) | **55** (59) | oui (App Store) |
| DeepSeek - Assistant IA | DeepSeek | **43** (42) | **52** (54) | oui (App Store) |
| Vibe by Mistral (ex-Le Chat) | Mistral AI | **44** (30) | **40** (30) | oui, et inclus d'office |
| Grok Bot | xAI | **47** (47) | **57** (98) | oui (App Store, catégorie discutable) |
| Open Chat - AI bot app | AceTools Team (tiers) | — | **42** (63) | oui (Google Play) — **nouveau dans le top 50** |
| Chatbot App - AI Assistant | TapSuite (tiers) | — | **50** (38) | oui, au rang 50 exactement (0.2) |
| AI Chat App- Chatbot Assistant | Oxylab Studio (tiers) | — | **absent du top 100** (44) | **non** — sorti |
| ChatOn・Chatbot IA en français | AIBY (tiers) | 62 | 99 le 9 ; absent du top 87 lu le 15 | non |
| Genora AI, Chat Smith | tiers | 64, 95 | — | non |

### 2.2 Fiches par assistant

Ce qui a été **relu le 15** : classements, lookup Apple, page d'accueil de la documentation de
DeepSeek, documentation de Perplexity (redirection), page d'aperçu de l'API de Meta.

Le reste (SDK, modèles par défaut, CGU, citations des conditions de Gemini) est un **relevé du 9,
non relu** : voir §2.2 et §2.3 du dossier provisoire.

| Assistant | API officielle | Recherche web par API | Ce qui a changé depuis le 9 | Verdict au 15 |
|---|---|---|---|---|
| ChatGPT (OpenAI) | <https://developers.openai.com/api/docs/> (relevé du 9) | oui, outil `web_search` (relevé du 9) | rangs stables | **inclus**, modes web et sans web |
| Claude (Anthropic) | <https://platform.claude.com/docs/> (relevé du 9) | oui (relevé du 9) | rangs stables | **inclus**, modes web et sans web |
| Gemini (Google) | <https://ai.google.dev/gemini-api/docs> (relevé du 9) | oui, `google_search` (relevé du 9) | D28-4 appliquée | **inclus**, `clause_restrictive_signalee: true`, **mode web suspendu jusqu'à l'avis de l'avocat** ; mode sans web seul en attendant |
| Le Chat / Vibe (Mistral AI) | <https://docs.mistral.ai/> (relevé du 9) | oui, via les API Agents et Conversations seulement (relevé du 9) | baisse de rang (44 et 40) sans effet : inclus d'office | **inclus d'office**, libellé à trancher |
| Grok (xAI) | <https://docs.x.ai/> (relevé du 9) | oui (relevé du 9) | monte au rang 10 de l'App Store ; éditeurs nommés différemment (0.3) | **inclus** |
| Perplexity | <https://docs.perplexity.ai/> ; le 15, la page d'aperçu (<https://docs.perplexity.ai/docs/getting-started/overview>) présente l'« Agent API » et la « Search API » (lu) | intrinsèque. Désactivation : `disable_search` en **secondaire seulement** ; la page « search control » redirige vers « Migrate from Sonar to the Agent API » (lu) | rang 36 stable | **inclus** (App Store 36). Faisabilité du mode sans web **à vérifier** (0.2) |
| DeepSeek | <https://api-docs.deepseek.com/> : « The DeepSeek API uses an API format compatible with OpenAI/Anthropic. » (lu) | **non trouvée** (aucune occurrence de « search » sur la page d'accueil de la documentation, lu ; relevé du 9 identique) | rang 43 (42 le 9) | **inclus, mode sans web seul (D28-3)** |
| Meta AI | « Meta Model API » <https://dev.meta.ai/docs/overview> (lu le 15 : modèles Muse, « Search grounding » ; « Muse Wonder is in preview ») | « Search grounding » annoncé (lu) | aucune information trouvée sur l'ouverture de l'API en France ou dans l'UE ; <https://dev.meta.ai/terms> répond 404 (lu) | **incertain** (ouverture, accès depuis l'UE, conditions) |
| Microsoft Copilot | **non trouvée** pour le produit grand public (relevé du 9 ; non recherché à nouveau en profondeur) | — | rang 11 de l'App Store | **exclu** (pas d'API du produit), à confirmer |
| Gemini Notebook (Google) | non cherchée | — | rangs 27 et 33 | **incertain** (catégorie) |
| Grok Bot (xAI) | même API que Grok | — | rangs 47 et 57 | **incertain** (doublon ou produit distinct ?) |
| Applications tierces (Genie, Chatbot App, Open Chat) | **non trouvée** (non cherchée en profondeur ; déduit : interfaces tierces au-dessus de modèles d'autres éditeurs) | — | Open Chat entre dans le top 50 de Google Play ; AI Chat App (Oxylab) en sort | **exclues** faute d'API officielle, à confirmer |

### 2.3 Citation exacte : conditions de l'API Gemini

Inchangée, **relevé du 9, non relu** : voir §2.3 du dossier provisoire
(<https://ai.google.dev/gemini-api/terms>, « Effective March 23, 2026 », « Last updated
2026-04-28 UTC »). D28-4 en tire la conséquence : mode web suspendu.

### 2.4 Synthèse outils (voir aussi §5)

| Statut | Outils |
|---|---|
| Retenus par la règle | ChatGPT, Claude, Gemini (mode web suspendu, D28-4), Le Chat / Vibe (d'office), Grok, Perplexity (mode sans web à vérifier), DeepSeek (mode sans web seul, D28-3) |
| Incertains | Meta AI (API), Gemini Notebook et Grok Bot (catégorie) |
| Exclus | Microsoft Copilot (pas d'API du produit) ; applications tierces Genie AI, Chatbot App, Open Chat (pas d'API officielle trouvée) ; AI Chat App (Oxylab), désormais hors du top 100 |

---

## 3. Comparateurs citoyens (famille « comparateur »)

Règle (§3) : sites publics comparant les positions d'**au moins cinq candidats du périmètre**,
accessibles sans compte, dont le contenu est consultable sans exécution de scripts tiers.

**Méthode** : identique à celle du 9 (curl sans JavaScript, texte hors `<script>` et `<style>`,
recherche des noms, domaines des `<script src>` tiers, un extrait). Le relevé a été fait le 15
vers 10:45 UTC ; le brut est dans `releves-2026-10-15/comparateurs-releve.txt`. Le périmètre de
référence est désormais celui des **13 inclus** du §1.

| Site | URL testée | Inclus du périmètre (13) dans le HTML brut le 15 | Scripts tiers | Changement depuis le 9 | Verdict au 15 |
|---|---|---|---|---|---|
| Fondation iFRAP | <https://www.ifrap.org/comparateurs/presidentielles-2027> | 13/13 ; Faure, Royal, Guedj, Maurel et Hollande **n'apparaissent plus** dans le HTML (lu) | aucun | **mis à jour** après la primaire (déduit de la disparition des perdants). Positions lisibles, par exemple « Raphaël Glucksmann 2,3 à 3 Md€ d'économies sur le fonctionnement de l'Etat… » | **retenu** |
| France-Vote | <https://www.france-vote.fr/comparateur> et <https://www.france-vote.fr/comparateur/jean-luc-melenchon-vs-marine-le-pen> | 13/13 (plus les 7 autres personnalités suivies) | aucun | aucun changement de fond constaté. La page duel affiche toujours « Sur 7 des 40 propositions… » et aussi « leurs positions ne convergent que sur 39 % des propositions comparées » ; l'accueil annonce « 32 personnalités, 40 propositions, 10 thèmes » (lu) | **retenu** |
| Isoloir 2027 | <https://isoloir2027.fr/positions/retraite-62> | 13/13 | pagead2.googlesyndication.com | inchangé | **retenu** si l'on admet des scripts tiers non nécessaires au contenu (0.2 du 9) |
| Le Quizz du Berger | <https://www.quizz-du-berger.com/comparer> | 13/13 | aucun script `src` tiers le 15 (le 9 : datafa.st) | script de mesure d'audience absent du HTML le 15 ; aucun passage de position trouvé | **incertain** |
| Candidator | <https://www.candidator.fr/presidentielle2027/candidats.html> | 13/13 | ajax.googleapis.com, pagead2.googlesyndication.com, platform-api.sharethis.com, googletagmanager.com | inchangé | **incertain** (fiches plutôt que comparaison) |
| Votons 2027 | <https://votons-2027.fr/> | 13/13 | aucun | inchangé | **incertain** |
| Solution démocratique | <https://solutiondemocratique.fr/comparatif-candidats-programme-elections-presidentielles-france-2027/> | 12/13 (Roussel absent) | static.addtoany.com, googletagmanager.com | inchangé | **incertain**, probablement exclu (partisan, évaluatif) |
| ComparateurPresident | <https://comparateurpresident.com/> | 8/13 (Mélenchon, Ruffin, Tondelier, Glucksmann, Attal, Philippe, Retailleau, Le Pen) | aucun | inchangé ; affiche toujours « 1er tour : 11 avril 2027 » | **retenu** sous réserve que les positions soient dans le HTML |
| SP2027 | <https://sondages-presidentielle2027.fr/comparateur.html> | — | — | **HTTP 406 « Not Acceptable »** le 15, avec deux User-Agent différents | **non vérifiable** (le 9 : limite, 5 noms) |
| ÉlyséeScope | lien du 9 | 3/13 | googletagmanager.com | inchangé | **exclu** (< 5) |
| Politiquement.org | lien du 9 | 6/13 | aucun | inchangé | **incertain** (test) |
| Boussole2027 | lien du 9 | 8/13 | pagead2.googlesyndication.com | inchangé | **incertain** (test) |
| TestPolitique.fr | lien du 9 | 6/13 | pagead2.googlesyndication.com, googletagmanager.com | inchangé | **incertain** (test) |
| Les Présidentielles AI | <https://www.lespresidentielles.ai/> | 6/13 (Arthaud, Roussel, Attal, Philippe, Dupont-Aignan, Le Pen) | googletagmanager.com | page « chat Live 2027 » : « Interrogez les positions des candidats. Posez une question sur un thème… » (lu ; présence le 9 non vérifiée) | **incertain**, probablement exclu (contenu généré, interface conversationnelle) |
| MonVote2027 | <https://monvote2027.fr/comparer> | 0 (contenu chargé par JavaScript) | aucun | inchangé | **exclu** en l'état |
| Compare2027 | <https://www.compare2027.fr/> | 0 | — | inchangé (questions en langage naturel) | **exclu** |
| Mon Choix 2027 | <https://www.monchoix2027.com/> | 7/13 | aucun | **mis à jour** : « Données en cours de constitution (mise à jour du 2026-10-13) », « 30 candidats · 9 thèmes » ; l'exemple affiché est un « Exemple illustratif — pas une mesure réelle » ; simulateur de score | **exclu** en l'état (simulateur ; positions non établies dans le HTML) |
| scoly-oss | <https://scoly-oss.github.io/presidentielles-2027/> | — | — | HTTP 404 | **exclu** (disparu) |
| bellef.tech | <https://www.bellef.tech/comparatif/> | — | — | connexion impossible (curl code 000) | **non vérifiable** |

Comparateurs de grands médias : **non recherchés à nouveau** le 15 (le 9 : non trouvés).

**Synthèse comparateurs** :
- **retenus** : iFRAP et France-Vote ;
- **retenus sous réserve** : Isoloir 2027 (interprétation des scripts tiers) et ComparateurPresident
  (positions à confirmer page par page) ;
- **changements depuis le 9** :
  - iFRAP a retiré les perdants de la primaire ;
  - SP2027 n'est plus lisible par mon outil ;
  - Mon Choix 2027 a été mis à jour, mais reste un simulateur.

Les éditeurs de la plupart des sites indépendants ne sont **toujours pas identifiés** (mentions
légales non relevées).

---

## 4. Ce qu'il reste à faire après ce relevé

1. **Clore la fenêtre** : décider quand le relevé du 15 est réputé complet (0.1-1). Relire alors
   la liste de la Commission des sondages (notices publiées le 15 et mises en ligne après) et les
   déclarations du 15 (Le Maire en particulier).
2. Lire une **proclamation officielle** de la primaire PS–PP–GRS (Haute Autorité ou commission
   d'organisation), si elle est publiée ailleurs que sur choisir2027.fr. Expliquer l'écart
   66,13 % / 66,17 %.
3. Trancher le **statut dans le jeu de données** des perdants de la primaire (0.2).
4. Obtenir ou écarter les preuves d'adhésion de Cluster17, YouGov et Odoxa : annuaire ESOMAR
   consulté dans un navigateur, ou décision qu'elles ne sont pas nécessaires. Elles ne changent
   aucun verdict à ce jour.
5. Vérifier en source primaire la faisabilité du **mode sans web chez Perplexity** (Agent API,
   `disable_search`) et l'**ouverture de l'API Meta** depuis l'UE.
6. Trancher les catégories de Gemini Notebook et de Grok Bot, et le libellé Le Chat / Vibe.
7. Avis de l'avocat sur Gemini (D28-4).
8. Archiver toutes les URL de `urls-a-archiver-2026-10-15.txt`, stores compris : le contenu du
   15 diffère de celui du 9.
9. Recopier D28 dans le protocole (amendement, §9) : tant que ce n'est pas fait, les verdicts
   Faure, Royal et Villepin, ainsi que le mode de DeepSeek et de Gemini, reposent sur une
   décision non écrite dans le protocole.

---

## 5. Synthèse

### 5.1 Candidats au 2026-10-15 (relevé de 10 h 46 UTC, sous réserve de 0.1-1)

| Candidat | Verdict | Motif | Preuves principales | Différence avec le 9 octobre |
|---|---|---|---|---|
| Nathalie Arthaud | **inclus** | déclarée ; 20 sondages (11 Syntec) | lutte-ouvriere.org (relevé du 9) ; notices CdS | +3 sondages |
| Fabien Roussel | **inclus** | déclaré et investi ; 20 (11) | fabienroussel2027.fr (relevé du 9) | +3 sondages |
| Jean-Luc Mélenchon | **inclus** | déclaré ; 20 (11) | melenchon2027.fr (relevé du 9) | +3 sondages |
| François Ruffin | **inclus** | déclaré (lu le 15) ; 5 (3) | francoisruffin.fr ; 2253, 2263, 2293, 2308, 2327 | réserve levée (primaire unitaire sans élimination) ; +1 sondage |
| Marine Tondelier | **inclus** | déclarée (lu le 15) ; 20 (11) | marinetondelier.fr | réserve levée ; +3 sondages |
| Raphaël Glucksmann | **inclus** | vainqueur de la primaire PS–PP–GRS le 11 octobre ; 20 (11) | place-publique.eu ; glucks2027.fr ; Touteleurope | réserve levée : il est le vainqueur ; +3 sondages |
| Gabriel Attal | **inclus** | déclaré ; 20 (11) | RTL 2026-05-22 (secondaire, relevé du 9) | +3 sondages |
| Édouard Philippe | **inclus** | déclaré ; 20 (11) | edouardphilippe.fr (relevé du 9) | +3 sondages |
| Bruno Retailleau | **inclus** | déclaré et investi ; 20 (11) | republicains.fr (relevé du 9) | +3 sondages |
| David Lisnard | **inclus** | déclaré ; 7 (3) | lisnard2027.fr (relevé du 9) ; 2327 | +1 sondage |
| Nicolas Dupont-Aignan | **inclus** | déclaré (source primaire lue le 15) ; 18 (11) | nicolasdupontaignan.fr | **preuve consolidée** (primaire au lieu de secondaire) ; +3 sondages |
| Marine Le Pen | **inclus** | déclarée ; 20 (11) | lettre RN du 07/09/2026 (relevé du 9) | +3 sondages |
| Éric Zemmour | **inclus** | déclaré ; 20 (11) | BFMTV, franceinfo (secondaire, relevé du 9) | +3 sondages |
| Olivier Faure | **exclu** | perdant de la primaire (D28-1, §3) | Touteleurope ; Wikipédia ; place-publique.eu | **I → E** |
| Ségolène Royal | **exclue** | perdante de la primaire (D28-1, §3) | idem | **I → E** |
| Jérôme Guedj | **exclu** | perdant de la primaire ; 1 sondage | idem ; 2308 | E inchangé, motif complété |
| Emmanuel Maurel | **exclu** | perdant de la primaire ; 1 sondage | idem ; 2308 | E inchangé, motif complété |
| Dominique de Villepin | **exclu** | intention seulement (D28-2) ; 6 sondages (3) | franceinfo 2026-08-30 (relevé du 9) ; lafrancehumaniste.fr (lu le 15) | **? → E** |
| Bruno Le Maire | **exclu** | aucune déclaration trouvée ; 2 sondages (1 Syntec + YouGov) | LCP 2026-06-23 ; recherches du 15 | **? → E** (à revoir si une déclaration datée du 15 apparaît, 0.1-1) |
| François Hollande | **exclu** | non déclaré ; 10 sondages | France 3 2026-10-03 (relevé du 9) ; Wikipédia (pressenti) | inchangé (+1 sondage) |
| Karim Bouamrane | **exclu** | 1 sondage | 2273 | inchangé |
| Xavier Bertrand | **exclu** | 1 sondage | 2293 | inchangé |
| Sébastien Bonnal | **exclu** | 1 sondage | 2277 | inchangé |
| Jordan Bardella | **exclu** | non déclaré ; 0 sondage | — | inchangé |
| 12 déclarés du 9 sans sondage, plus Platret et Polony | **exclus** | 0 sondage | Wikipédia (secondaire) ; 20 notices relues | **+2 noms** (Platret, Polony) |

**Bilan** : **13 inclus** (15 inclus projetés le 9), **0 incertain** (2 le 9), et des exclus
(détail ci-dessus). Le verdict de Le Maire reste sensible à la clôture de la fenêtre (0.1-1).

### 5.2 Outils au 2026-10-15

| Outil | Verdict | Motif | Preuves (relevé du 15) | Différence avec le 9 octobre |
|---|---|---|---|---|
| ChatGPT | **inclus** (web et sans web) | top 50 des deux stores (3 ; 1) ; API ; gratuit, FR | flux Apple, AppBrain, lookup | aucune |
| Claude | **inclus** (web et sans web) | 1 ; 4 | idem | aucune |
| Gemini | **inclus**, clause restrictive signalée, **web suspendu** (D28-4) | 2 ; 9 | idem ; conditions (relevé du 9) | mode web suspendu par D28-4 (le 9 : « à proposer ») |
| Le Chat / Vibe | **inclus d'office** | 44 ; 40 | idem | baisse de rang, sans effet |
| Grok | **inclus** | 10 ; 25 | idem | monte de 13 à 10 sur l'App Store |
| Perplexity | **inclus** ; mode sans web **à vérifier** | 36 (App Store) | idem ; docs.perplexity.ai (redirection vers l'Agent API) | nouvelle incertitude documentaire (migration Sonar → Agent API) |
| DeepSeek | **inclus, sans web seulement** (D28-3) | 43 (App Store) ; pas de recherche web dans l'API | idem ; api-docs.deepseek.com | le 9 : « trou » ; tranché par D28-3 |
| Meta AI | **incertain** | 5 ; 5, mais ouverture de l'API non établie | dev.meta.ai | inchangé |
| Gemini Notebook | **incertain** | catégorie | 27 ; 33 | inchangé |
| Grok Bot | **incertain** | catégorie ou doublon | 47 ; 57 | inchangé |
| Microsoft Copilot | **exclu** | pas d'API du produit trouvée | 11 ; 19 | inchangé |
| Genie AI, Chatbot App | **exclus** | tiers, pas d'API officielle trouvée | 35 ; 43 et — ; 50 | inchangé |
| Open Chat (AceTools) | **exclu** | tiers, pas d'API officielle trouvée | Google Play 42 | **nouveau** dans le top 50 |
| AI Chat App (Oxylab) | **exclu** | hors du top 100 | AppBrain | **sorti** du top 50 (44 le 9) |

### 5.3 Comparateurs au 2026-10-15

| Verdict | Sites |
|---|---|
| Retenus | iFRAP, France-Vote |
| Retenus sous réserve | Isoloir 2027, ComparateurPresident |
| Incertains | Quizz du Berger, Candidator, Votons 2027, Solution démocratique, Politiquement, Boussole2027, TestPolitique, Les Présidentielles AI |
| Non vérifiables | SP2027 (HTTP 406), bellef.tech |
| Exclus | ÉlyséeScope, MonVote2027, Compare2027, Mon Choix 2027, scoly-oss |

Différences avec le 9 : SP2027 passe de « limite » à « non vérifiable ». Mon Choix 2027 a été mis
à jour mais reste exclu. iFRAP a retiré les perdants de la primaire.
