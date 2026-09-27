# Tâches de l'auteur

Tout ce qui attend l'auteur, et que ni le code ni un agent ne peut faire à sa place, rassemblé pour être
traité d'un coup. Chaque ligne dit quoi, où, et d'où vient la demande. Une tâche faite est cochée,
puis retirée à la clôture de session suivante.

Mis à jour le 2026-09-27. Sources relues : `docs/feuille-de-route.json`, `docs/DETTE.md`,
`docs/PROTOCOLE.md` 0.11, `docs/conformite/2026-09-24.md`, `schema/README.md`, PR #28 à #35.

---

## 1. Avant le gel du protocole (J1, 15 octobre 2026)

### Protocole (`docs/PROTOCOLE.md`)

- [ ] **Appliquer la révision 0.12, ou autoriser l'agent à l'écrire.** Elle écrit :
      - au §4, le comptage des items P du seuil de couverture (items tirables au gel, décision du
        2026-09-27) et le fait qu'un candidat sous le seuil n'est rapporté que par son nom et la
        mention ;
      - au §8, l'exactitude de référence du test d'asymétrie restreinte aux candidats comparés ;
      - à l'annexe F, « par outil et par mode » ;
      - au §4, la grille des items T2 gagne la question « J'ai écouté l'extrait et la
        transcription est fidèle » ; l'item n'est vérifié que si les deux annotateurs répondent
        oui, et ils sont publiés comme vérificateurs de la transcription (décision du 2026-09-27,
        conformité n° 12).

      Le texte proposé est dans la conversation du 2026-09-27. À fusionner avec les PR #38 et #39,
      dont le code applique déjà ces règles.
- [ ] **Trancher quatre points ouverts par la PR #39** (à écrire dans la 0.12) :
      - un run à symétrie rouge porte-t-il encore un go/no-go ? Recommandé : non. Le schéma impose
        aujourd'hui `publie_provisoire`, ce qui contredit le statut `invalide` ;
      - un run `invalide` doit-il déclarer sa publication et son dépôt, puisque le §12 dit « publié
        tel quel » ?
      - la déclaration de candidature doit-elle dater au plus tard du jour du gel (lecture retenue) ?
      - deux preuves à la même URL comptent-elles pour un seul sondage (lecture retenue) ?
- [ ] **Trancher quatre points ouverts par la PR #40** (à écrire dans la 0.12) :
      - un item T2 sans deux « oui » à la question d'écoute part en arbitrage, où l'arbitre ne peut
        que rejeter ou le déclarer non évaluable (choix retenu). À confirmer ;
      - à quelle source se rapporte le `valide_du` d'un item O (état antérieur ?), d'un item A
        (couverture ?) et d'un item F ? Il n'est pas contrôlé tant que le §4 ne le dit pas.
        L'exemple `schema/exemples/item/valide-02` ne passerait pas `pnpm promote` et sera corrigé
        une fois la règle écrite ;
      - un item rejeté, non évaluable ou retiré par le panel garde-t-il son attestation d'écoute ?
        Aujourd'hui, elle n'est ni exigée ni interdite ;
      - la table « type de document → tier » est-elle à mentionner dans `docs/CONTRATS.md` §5 ?
- [ ] **Trancher quatre points ouverts par la PR #41** (à écrire dans la 0.12) :
      - « Quand les items le permettent » (§5) se juge par strate thème × gabarit, compensations
        exclues (choix retenu). Jugé par thème, il ferait passer au rouge un tirage conforme à la
        compensation de la 0.9 ;
      - `pnpm symmetry` doit recevoir le jeu complet des questions engendrées, pas seulement les
        tirées. Sinon, la condition ne peut plus passer au rouge. À écrire au §5 ;
      - la prémisse d'une Q-ACT orientée sur un item O affirme-t-elle une position (choix retenu),
        ou la Q-ACT sort-elle du dénominateur de la confirmation de prémisse ?
      - quels générateurs servent pour l'échantillon humain et le test contrefactuel ? Le §7 ne les
        nomme pas.
- [ ] **Trancher trois points ouverts par la PR #42** :
      - n° 54 : le §4 exige une localisation exacte (page d'un PDF), mais le schéma d'une source ne
        sait pas si elle est un PDF. Recommandé : un champ obligatoire `format` (`pdf`, `html`,
        `audio`, `video`), écrit par le pipeline depuis la fiche d'extraction, avec « pdf ⇒ page ».
        Le modèle de données change : tous les exemples d'item et les fixtures sont touchés ;
      - n° 69 : quand le thème d'une mesure est corrigé via un item, que deviennent les autres items
        de cette mesure, jugés contre l'ancien thème ? Recommandé : retour en attente et nouvelle
        validation, à écrire au §4. D'ici là, leur promotion est bloquée (`VersionMesureEcart`) ;
      - n° 64 : un lien `inaccessible` ou `non_testable` peut-il être noté « soutient » (lecture
        d'une copie archivée) ? Aujourd'hui, oui ; seul un lien `mort` ne le peut pas.
- [ ] **Signer le protocole.** L'en-tête porte encore « @Someone » (ligne 5).
- [ ] **Nommer le fournisseur SMTP de l'adresse dédiée** au §10, à la place de
      `[fournisseur à nommer par l'auteur avant le gel]` (protocole 0.10, PR #32).
- [ ] **Trancher le constat n° 81** : les réponses aux Q-ATT sortent de l'exactitude par candidat et
      du test d'asymétrie, faute de candidat, et le §8 ne le dit pas. Écrire la phrase, ou demander
      qu'on change le code (`docs/conformite/2026-09-24.md`, n° 81).
- [ ] **Relecture par un avocat** (§10 : diffamation, droit d'auteur, RGPD, conditions d'utilisation
      des API).
- [ ] **Déposer la version 1.0 sur Zenodo** et publier l'empreinte et le DOI (critère de J1).
- [ ] **Transmettre le protocole à l'Arcom, à Viginum et à la CNIL** pour information (§10).

### Adresse et courriels

- [ ] **Ouvrir l'adresse de contestation dédiée** chez le fournisseur nommé au §10 (D4).
- [ ] **Réécrire le gabarit de notification** `validation/notifications/gabarits/courriel.txt`,
      marqué « Gabarit provisoire ». Tant que ce marquage reste, `pnpm notifier --envoyer` refuse
      d'envoyer (PR #35).
- [ ] **Choisir la machine qui envoie les courriels.** Le journal des envois n'évite un double envoi
      que sur la machine qui l'a écrit : soit une seule machine envoie, soit on fait refuser l'envoi
      tant que la branche est en retard (`docs/DETTE.md`, 2026-09-25, point 3).

### Périmètre (`config/perimetre.yaml`)

Critère de J1 : la liste nominative des outils et des candidats est publiée. D5 : l'auteur applique
les règles du §3 à la date du jour, archive les preuves, et révise la liste au gel.

- [ ] **Candidats** : pour chacun, `candidat_id`, `libelle`, `nom`, la déclaration de candidature
      archivée, au moins deux sondages archivés datés des 60 jours avant le gel, `statut_au_gel` et
      `interroge`, au gabarit commenté dans le fichier.
- [ ] **Contact de notification de chaque candidat** : clé `contact_notification`, avec l'adresse
      générique publiée par la campagne et sa preuve archivée, ou `null` explicite si la campagne
      n'en publie aucune (protocole 0.10, `outils/contacts.ts`).
- [ ] **Outils** : assistants (classement de store archivé, Le Chat d'office) et comparateurs, au
      gabarit commenté, avec le SDK et sa version épinglée (D3).
- [ ] **Relire les conditions d'utilisation de l'API de chaque outil** : une clause qui interdirait de
      publier des résultats comparatifs est soumise à l'avocat avant d'inclure l'outil (§10).
- [ ] **Quotas du tirage** : `tirage.quota_par_strate`, et la nouvelle clé
      `tirage.quota_attribution_par_theme` (protocole 0.9, n° 39). Aucun code ne lit encore ces
      clés : le chargeur les lira sous ces noms-là (`docs/DETTE.md`, 2026-09-25, point 4).
- [ ] **Corriger trois commentaires du fichier.**
      - Ligne 68 : « faux pour un candidat retiré, dont les items O restent mesurés » contredit la
        0.9, où un candidat retiré sort des runs (n° 32).
      - Commentaire des comparateurs : « jamais d'API » contredit le §6, qui prévoit l'export ouvert
        ou l'API d'un comparateur quand il en offre une (n° 52 et 62).
      - Ligne 85, gabarit d'un outil : `modes: [avec_recherche, sans_recherche]` ; les schémas
        imposent `web_activee` et `web_desactivee` (n° 63).
- [ ] **Retirer `tirage.part_reprise` et `tirage.part_absence_et_fictifs_min`** (lignes 40-41).
      Personne ne lit ces deux copies des 80 % et 20 % : le code les tient du protocole
      (`PART_REPRISE`, `PART_MINIMALE_ITEMS_A_F`), et les modifier ici ne changerait rien sans que
      rien ne le signale (n° 74). Recommandé : les retirer, puisque ces parts sont fixées par le §5
      et non par run.

### Prompts (`prompts/`)

- [ ] **Écrire les prompts des juges** `prompts/judge-*`. Ils appartiennent à l'auteur (lot notation),
      et le prompt doit dire comment classer une réponse qui donne la bonne position et y ajoute une
      position inventée non contradictoire (`schema/README.md`, points ouverts, 3).
- [ ] **Relire les prompts d'extraction et de reformulation** quand le lot perimetre-prompts les aura
      proposés (formulations familière et orientée).

---

## 2. Avant la première collecte réelle (J2, 31 octobre 2026)

- [ ] **Écrire `config/sources.toml`** : une poignée de sources pour le premier essai réel de collecte
      (lot collecte).
- [ ] **Décider où vit la copie de référence des textes canoniques et des transcriptions**, hors Git
      depuis #31 (Zenodo en accès restreint, sauvegarde chiffrée…), et comment les deux machines se
      synchronisent. Une transcription T2 perdue ne se refait pas à l'identique
      (`docs/DETTE.md`, 2026-09-25, point 2).
- [ ] **Dire si une réextraction du texte invalide les items déjà validés sur l'ancien texte**
      (`docs/DETTE.md`, 2026-09-23, point 1).

---

## 3. Avant la campagne d'annotation (J3, 15 novembre 2026)

- [ ] **Recruter et former les annotateurs** (pseudonymisés, §10). Critère de J3 : kappa ≥ 0,80 sur
      les deux derniers lots.
- [ ] **Constituer le panel d'arbitrage** : trois à cinq membres nommés publiquement, de sensibilités
      déclarées différentes, sans mandat ni fonction de campagne (§10). À défaut, déclarer la
      faiblesse (critère de J3).
- [ ] **Dérouler `docs/CONTROLE-MANUEL.md`** sur `pnpm validate` avant d'ouvrir la campagne.

---

## 4. Avant le premier run (J4, 22 novembre 2026)

- [ ] **Obtenir les clés API** de chaque éditeur inclus. Elles se passent en variables
      d'environnement, jamais dans le dépôt.
- [ ] **Fixer `date_gel`** dans `config/perimetre.yaml` au moment du gel du run.

---

## 5. Décisions à prendre seulement si le cas se présente

- [ ] **PDF servi sans `Content-Type` exact** : exception déclarée par source dans
      `config/sources.toml`, ou lecture de la signature `%PDF-` (`docs/DETTE.md`, 2026-09-23,
      point 3).
- [ ] **Premier amendement qui touche un schéma lu à l'exécution** : chaque objet porte-t-il la
      version du schéma qui l'a validé, ou un amendement n'a-t-il le droit que d'élargir ?
      (`docs/DETTE.md`, 2026-09-24, lot 3, point 1).
- [ ] **Registre `validation/mesures/decisions.json` au-delà de quelques dizaines d'entrées** :
      passer ou non en `.jsonl`. Le nom vient d'une décision de l'auteur (`docs/DETTE.md`,
      2026-09-19, point 4).
