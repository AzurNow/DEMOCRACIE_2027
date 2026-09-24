# Matrice des exigences — `docs/conformite/exigences.json`

Un seul fichier, versionné, mis à jour à chaque passe. Il est la mémoire de la conformité : la passe
suivante part de lui au lieu de tout relire. L'historique Git en garde les états successifs.

## Forme

```json
{
  "$commentaire": "Matrice de conformité code ↔ docs/PROTOCOLE.md. Tenue par la compétence conformite-protocole ; ne pas éditer hors d'une passe.",
  "protocole": {
    "version": "0.5",
    "sha256": "<empreinte de docs/PROTOCOLE.md lors de la dernière passe>"
  },
  "passe": {
    "date": "AAAA-MM-JJ",
    "commit": "<sha court de départ>",
    "rapport": "docs/conformite/AAAA-MM-JJ.md"
  },
  "exigences": [
    {
      "id": "§5.07",
      "section": "5",
      "citation": "le pipeline refuse de lancer un run si l'une de ces conditions échoue",
      "nature": "code",
      "statut": "testee",
      "code": ["outils/symmetry.ts:principal"],
      "tests": ["tests/symmetry-cli.test.ts « --mesures absent : code 1 »"],
      "lot": null,
      "constat": null,
      "note": null
    }
  ]
}
```

## Champs

| Champ | Contenu |
| --- | --- |
| `id` | Identifiant stable (`references/extraction.md`). Jamais réattribué. |
| `section` | Numéro de section ou lettre d'annexe. |
| `citation` | Phrase exacte du protocole, sans reformulation. Une ellipse `[…]` est permise pour couper, jamais pour changer le sens. |
| `nature` | `code`, `donnee`, `processus`, `hors-code`. |
| `statut` | Voir ci-dessous. |
| `code` | Emplacements qui appliquent l'exigence : `chemin:fonction` de préférence à `chemin:ligne`, qui se périme au premier ajout. Liste vide si non implémentée. |
| `tests` | Tests qui échoueraient si l'exigence était violée : `chemin « intitulé »`, ou `schema/exemples/<schéma>/<fichier>` pour une forme imposée par un schéma. |
| `lot` | Lot de la feuille de route qui l'implémentera, si `a-implementer`. |
| `constat` | Numéro du constat dans le rapport de la passe, si l'exigence en porte un. |
| `note` | Une phrase, seulement quand le statut ne se comprend pas seul. |

## Statuts

| Statut | Sens | Constat ? |
| --- | --- | --- |
| `testee` | Implémentée, et un test nommé échouerait si elle était violée. | non |
| `sans-test` | Implémentée, aucun test ne la garde. | oui, moyenne si elle touche une mesure |
| `contredite` | Le code fait autre chose que le texte. | oui, haute si elle touche une mesure |
| `partielle` | Une partie de l'exigence est appliquée, pas le reste ; `note` dit laquelle. | oui |
| `a-implementer` | Le lot qui la porte n'existe pas encore ; `lot` le nomme. | non |
| `hors-code` | Nature `hors-code`. | jamais |
| `a-verifier` | Texte modifié depuis la dernière passe, pas encore retracé. N'existe qu'en cours de passe. | — |
| `retiree` | Supprimée du protocole ; gardée pour la stabilité des identifiants. | non |

Les **règles non écrites** (sens inverse) ne sont pas dans la matrice, puisqu'aucune phrase du
protocole ne les fonde : elles vivent dans le rapport. Quand l'auteur en écrit une dans le protocole,
elle devient une exigence de la matrice à la passe suivante.

## Contrôles avant de rendre

- Chaque `id` est unique ; aucun `a-verifier` ne reste.
- Chaque exigence `testee`, `sans-test`, `contredite` ou `partielle` a au moins un emplacement de
  `code`, et chaque `testee` au moins un test.
- Chaque fichier cité existe (`ls`), chaque test cité se retrouve par `grep` de son intitulé.
- `protocole.sha256` est l'empreinte du fichier au commit de départ de la passe.
