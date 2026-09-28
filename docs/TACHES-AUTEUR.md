# Tâches de l'auteur

Tout ce qui attend l'auteur, et que ni le code ni un agent ne peut faire à sa place, rassemblé pour être
traité d'un coup. Chaque ligne dit quoi, où, et d'où vient la demande. Une tâche faite est cochée,
puis retirée à la clôture de session suivante.

Mis à jour le 2026-09-27. Sources relues : `docs/feuille-de-route.json`, `docs/DETTE.md`,
`docs/PROTOCOLE.md` 0.11, `docs/conformite/2026-09-24.md`, `schema/README.md`, PR #28 à #43.

---

## 0. Fusions en attente

- [ ] Supprimer les branches `lots/*` déjà fusionnées (#38 à #46).

---

## 1. Avant le gel du protocole (J1, 15 octobre 2026)

### Protocole (`docs/PROTOCOLE.md`)

- [ ] **Faire écrire la 0.13** (dire « écris la 0.13 ») : elle reprend les seize décisions du
      2026-09-27 ci-dessous. Elles sont prises, mais ni écrites ni toutes codées.

  Décisions du 2026-09-27 (toutes selon la recommandation) :
  1. §5 : `pnpm symmetry` reçoit le jeu complet des questions engendrées au gel, publié avec le
     run ; un jeu incomplet est refusé. *Code à faire.*
  2. §5 : « quand les items le permettent » se juge par strate thème × gabarit, compensations
     exclues. *Déjà codé (#41).*
  3. §12 : un run à symétrie rouge ne porte pas de go/no-go. *Code à faire (schéma).*
  4. §12 : un run invalide déclare sa publication et son dépôt Zenodo. *Code à faire (schéma).*
  5. §4 (n° 69) : quand le thème d'une mesure est corrigé via un item, les autres items de la
     mesure retournent en attente, épinglés sur la nouvelle version. *Code à faire.*
  6. §4 (n° 12) : un item T2 sans deux « oui » à l'écoute part en arbitrage
     `transcription_non_verifiee` (rejeter ou non évaluable). *Déjà codé (#40).*
  7. §4 (n° 17) : `valide_du` d'un item O = date de la source de l'état antérieur ; d'un item A =
     date de la source de couverture ; item F non contrôlé ; divergence motivée. *Code à faire ;
     corriger l'exemple item/valide-02.*
  8. §4 (n° 12) : attestation d'écoute interdite sur un item rejeté ou non évaluable, conservée
     sur un item retiré par le panel après vérification. *Code à faire (schéma).*
  9. §4 (n° 54) : chaque source porte un champ `format` (pdf, html, audio, video), écrit par le
     pipeline ; pdf ⇒ page. *Code à faire (modèle de données).*
  10. §7 (n° 64) : « soutient » reste permis sur un lien inaccessible ou non testable. *Rien à
      coder.*
  11. §5 (n° 37) : la formulation orientée d'une Q-ACT sur un item O note aussi la position que
      sa prémisse suppose actuelle. *Déjà codé (#41).*
  12. §8 (n° 29) : un rééchantillon où l'écart maximal n'est pas défini est écarté et compté.
      *Déjà codé (#46).*
  13. §3 : la déclaration de candidature date au plus tard du jour du gel. *Déjà codé (#39).*
  14. §3 : les sondages se comptent par URL distinctes. *Déjà codé (#39).*
  15. §7 : l'échantillon humain et le test contrefactuel tirent avec SplitMix64
      (splitmix64-sha256-v1), graine dérivée et clé lisible comme au §8. *Code à faire
      (exemples de schéma encore en PCG64).*
  16. `docs/CONTRATS.md` §5 reçoit la table type de document → tier ;
      `fiche-source.schema.json` l'applique. *Code et texte à faire.*

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
