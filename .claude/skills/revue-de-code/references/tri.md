# Trier un constat

## Gravité

La même échelle que `docs/DETTE.md`, jugée à la même aune : *un lecteur du site pourrait-il lire
un nombre faux sans que rien ne l'ait signalé ?*

- **haute** — le défaut peut fausser une mesure, une donnée ou une décision sans qu'aucun test ni
  aucun message ne le montre. Exemples : une valeur par défaut qui remplace une donnée manquante
  dans un calcul, une erreur avalée dans le pipeline, une frontière non validée qui laisse entrer
  une forme inattendue.
- **moyenne** — le défaut coûte cher à la prochaine modification ou trompe le relecteur : règle
  définie deux fois, module à plusieurs responsabilités, commentaire faux, test lié à la plateforme.
- **basse** — friction de lecture : nom approximatif, fonction un peu longue, conversion `as`
  justifiée mais non commentée.

## Corriger ou accepter

Un constat n'est pas toujours à corriger. **Accepter** est une décision légitime, à condition
d'écrire pourquoi dans le rapport : la revue suivante ne le re-signalera pas.

On accepte quand :
- le coût du changement dépasse ce qu'il protège (fichier de fixtures long mais linéaire) ;
- le signal est un faux positif (« Deux règles » dans un commentaire ne se périme pas ; `?? 0` sur
  un compteur de `Map` est l'idiome) ;
- la correction demande une décision de l'auteur hors du périmètre de la revue : on accepte *pour
  la revue* et on propose la décision (feuille de route ou dette).

On corrige toujours une gravité haute, ou on la transforme en entrée de `docs/DETTE.md` si la
correction dépasse une revue.

## Les faux constats fréquents

| Tentant d'écrire | Ce que c'est vraiment |
| --- | --- |
| « Ce fichier est long » | Un signal. Le constat est ce qui rend le fichier difficile : plusieurs responsabilités, état partagé. |
| « Il faudrait plus de commentaires » | Presque jamais. Le constat est ce que le code ne dit pas par ses noms ou sa structure. |
| « Ce n'est pas comme je l'aurais écrit » | Rien, sauf si la forme actuelle cache un défaut nommable. |
| « Ajouter une abstraction pour le futur » | Une anticipation. La revue retire de la complexité, elle n'en ajoute pas. |
