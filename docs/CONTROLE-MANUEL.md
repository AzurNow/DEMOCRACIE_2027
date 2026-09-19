# Contrôle manuel avant une campagne d'annotation

Ce que les tests automatisés ne voient pas — parce que `validation/client/` s'exécute dans un
navigateur et que Vitest tourne sans DOM (docs/DETTE.md, décision du 2026-09-18). À dérouler une
fois, sur `pnpm validate`, avant d'ouvrir une campagne à de vrais annotateurs. Chaque ligne est un
geste à faire et une observation à constater, pas une intention.

- [ ] **Focus clavier.** Ouvrir un item, appuyer sur `Tab` à répétition sans toucher la souris :
      vérifier que le focus visite les boutons de décision, les champs de réponse à la grille, puis
      les boutons de navigation, dans cet ordre, sans jamais sortir de l'écran ni sauter un élément
      interactif.
- [ ] **Page d'ouverture d'un PDF.** Ouvrir un item dont la source est un PDF portant une page
      enregistrée (`source.page` non nul) : vérifier que le visionneur natif du navigateur s'ouvre
      directement sur cette page, sans qu'il faille faire défiler.
- [ ] **Position du lecteur audio ou vidéo.** Ouvrir un item dont la source est un enregistrement
      audio ou vidéo : vérifier que le lecteur, une fois les métadonnées chargées, est positionné
      sur l'instant de la citation, pas au tout début du fichier.
- [ ] **Ordre des boutons de décision.** Ouvrir un item : vérifier que les boutons Accepter,
      Rejeter et Non évaluable apparaissent dans le même ordre et à la même taille sur plusieurs
      items successifs — aucun raccourci visuel ne doit rendre l'un plus rapide à atteindre que les
      autres.
- [ ] **Surlignage effectivement visible.** Ouvrir un item dont la citation se situe loin dans le
      texte canonique (au-delà du premier écran) : vérifier que la zone de texte défile
      automatiquement jusqu'à amener la citation surlignée dans la fenêtre, sans qu'il faille faire
      défiler à la main pour la trouver.
- [ ] **Source introuvable.** Renommer temporairement le fichier archivé d'une source citée par un
      item (puis le restaurer), rouvrir l'item : vérifier qu'un message explicite signale la source
      absente, à la place du document, plutôt qu'un cadre vide ou une erreur de navigateur brute.
- [ ] **Empreinte divergente.** Modifier d'un octet une copie temporaire du fichier archivé d'une
      source citée (puis restaurer l'original), rouvrir l'item : vérifier que l'interface refuse
      d'afficher le document et signale la divergence d'empreinte, plutôt que de servir le fichier
      modifié.
- [ ] **Reprise de session.** Décider un item, fermer complètement l'onglet ou le navigateur,
      relancer `pnpm validate` et rouvrir la même session annotateur : vérifier que l'item suivant
      proposé est bien celui qui suit la dernière décision enregistrée, jamais le premier du lot ni
      celui déjà décidé.
