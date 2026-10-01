# Tâches de l'auteur

Tout ce qui attend l'auteur, et que ni le code ni un agent ne peut faire à sa place, rassemblé pour être
traité d'un coup. Chaque ligne dit quoi, où, et d'où vient la demande. Une tâche faite est cochée,
puis retirée à la clôture de session suivante.

Mis à jour le 2026-10-01. Sources relues : `docs/feuille-de-route.json`, `docs/DETTE.md`,
`docs/PROTOCOLE.md` 0.13, `docs/conformite/2026-09-29.md`, `schema/README.md`, PR #28 à #57.

---

## 0. Fusions en attente

- [ ] **Fusionner #59** (condition de quota, `donnees_commit` obligatoire), puis la PR de la
      révision 0.14 du protocole. #59 part de `main`.
- [ ] Supprimer les branches `lots/*`, `protocole/*` et `docs/*` déjà fusionnées (#38 à #56, dont
      `lots/panel-maintien-apres-retrait` et `lots/tirage-contestations-mesure`), et leurs worktrees
      sous `.claude/worktrees/`. Ne plus fusionner une PR dont la base est la branche d'une autre
      PR : c'est ainsi que #54 a manqué `main` (rattrapée par #55, `LESSONS.md`).

---

## 1. Avant le gel du protocole (J1, 15 octobre 2026)

### Protocole (`docs/PROTOCOLE.md`)

- [x] **0.13 écrite** (#48) : les seize décisions du 2026-09-27 sont dans le protocole, et le code
      est aligné sur toutes (#49 : symétrie, run, générateurs ; #50 : format, dates, attestation,
      renvoi après correction de thème, tiers de la fiche).
- [x] **Faire refaire la passe de conformité** sur la 0.13 : faite le 2026-09-29
      (`docs/conformite/2026-09-29.md`). Constats n° 1 à 4, 7 à 9, 14, 24, 31 et 33 traités
      (#53 à #57). n° 15, 27 et 29 traités dans #61. Restent ouverts du côté code : n° 5, 10 à 12, 22, 23,
      25, 30, 32 et 35.
- [ ] **Faire écrire dans la prochaine révision** les décisions du 2026-09-28 ci-dessous.

  Décisions du 2026-09-28 sur le renvoi après correction de thème (PR #50), selon la
  recommandation. La 1 précise le texte du §4 (« retournent en attente ») : à écrire dans la
  prochaine révision.
  1. §4 (n° 69) : un item déjà publié dans `data/` et jugé contre l'ancien thème n'est pas renvoyé
     par `pnpm mesures --renvoyer` ; il se reprend par la contestation et le panel (`pnpm contester`,
     `pnpm panel`), seul chemin de modification d'un item publié. *Codé (#50) : la commande le
     nomme et sort en erreur.*
  2. §4 (n° 69) : un item d'un lot en cours attend la fin de son lot avant d'être renvoyé ; le lot
     et son kappa ne changent pas. *Codé (#50).*
  3. Outillage : quand des items restent bloqués, la commande écrit ceux qu'elle peut renvoyer puis
     sort en code 1 ; une relance ne refait rien. *Codé (#50).*

  Décision du 2026-09-29 (conformité 2026-09-29, n° 1), selon la recommandation :
  4. §4 (droit de réponse) : un maintien ou une correction décidé après une non-évaluabilité
     prononcée par le panel rend à l'item le statut qu'il avait avant, comme après un retrait.
     Texte proposé : « un maintien ou une correction décidé sur un item que le panel avait retiré ou
     déclaré non évaluable lui rend le statut qu'il avait avant cette décision ». *Codé (PR du
     n° 1).*

  Décisions du 2026-09-29 (conformité 2026-09-29, n° 2 et 3), selon la recommandation :
  5. §4 (n° 2) : texte à écrire à la suite de « Correction de thème » : « Un item déjà publié ne
     retourne pas en attente : un item publié ne change que par la contestation et le panel.
     L'auteur le conteste dès que la correction est acceptée ; contesté, il n'engendre aucune
     question jusqu'à la décision du panel, qui le juge sur la nouvelle version de la mesure. »
     Garde-fou retenu en plus : le tirage refuse un item vérifié dont `mesure_version` n'est pas la
     version courante de sa mesure, et le compte dans les exclusions. *Codé (#54, arrivé sur `main`
     par #55).*
  6. §5 (n° 3) : texte à insérer après la phrase sur la position conditionnelle ou sans objet :
     « Pour la même raison, une question d'attribution n'est pas tirée lorsque l'item d'un candidat
     interrogé au run sur la mesure est contesté à la date du gel : sa position fait l'objet d'une
     contestation, et la liste attendue n'est pas établie. La question est exclue et comptée à part
     dans le rapport du run, comme une question dont la réponse attendue n'est pas définie. Un item
     en attente de validation, retiré ou déclaré non évaluable n'appartient pas à la vérité de
     référence : il n'entre pas dans la liste et ne la rend pas indéfinie. » (Branche « arbitré sans
     réintégration » écartée le même jour : un retrait bloquerait la question pour toujours.)
     *Codé (#54, arrivé sur `main` par #55).*

  Décisions du 2026-09-29, suite du lot #54, selon la recommandation :
  7. §5 : une mesure dont le seul porteur a son item contesté n'a pas de question d'attribution au
     gel : elle n'est ni tirée ni comptée (application de « contesté, il n'engendre aucune
     question »). Phrase à écrire en 0.14. *Codé (#54).*
  8. §5 : le rapport du run publie, par candidat interrogé, les items P vérifiés mais contestés au
     gel, donc absents du tirage (compte par item, pas par question). Texte proposé : « Le rapport
     du run publie, pour chaque candidat interrogé, les items P vérifiés que leur contestation tient
     hors du tirage à la date du gel. » Précision du même jour : y figure tout item P vérifié,
     contesté et en vigueur au gel, quelle que soit la version de sa mesure. *Codé (#54).*

  Décisions du 2026-10-01 (conformité 2026-09-29, n° 8 et 9) :
  9. §5 (n° 8) : la répartition par thème lit le retard sur les questions **propres** de chaque
     candidat, quel que soit l'écart des totaux, puis juge strate par strate le thème en retard ;
     une compensation inscrite répond à un déficit réel de sa strate. Lecture retenue contre la
     lecture stricte, qui faisait rougir un échange de gabarit sur un même item. Texte proposé, à la
     suite de « sans compter dans leur thème d'origine les questions reçues par compensation » :
     « un candidat est en retard sur un thème s'il y a reçu moins de questions propres que le mieux
     servi des candidats comparés ; ses strates de ce thème sont alors jugées une à une. Une
     compensation inscrite répond au déficit d'une strate, que ses propres questions tirables ne
     pouvaient combler. » *Codé (#57).*
  10. §5 (n° 9) : les items reçus par la barrière sont recoupés avec ceux du commit
     `versions.donnees_commit`, que le run inscrit dès le gel. *Codé (#57).* Tranché le 2026-10-01 :
     le schéma l'exige de tout run. *Codé (#59).*
  11. Tranché le 2026-10-01 : septième condition bloquante de la symétrie, « aucune strate
     candidat × thème × gabarit ne reçoit plus de questions propres que le quota du tirage ».
     Texte proposé, à la suite de la liste des garanties du §5 : « aucune strate ne reçoit plus de
     questions que le quota publié avec le tirage, les questions reçues par compensation ne
     comptant pas dans leur strate d'origine ». *Codé (#59).*

  Le constat n° 81 est déjà réglé par le §8 depuis la 0.8 (les questions d'attribution sortent
  du test et de l'exactitude par candidat) : rien à faire.
- [ ] **Signer le protocole.** L'en-tête porte encore « @Someone » (ligne 5).
- [ ] **Nommer le fournisseur SMTP de l'adresse dédiée** au §10, à la place de
      `[fournisseur à nommer par l'auteur avant le gel]` (protocole 0.10, PR #32).
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
