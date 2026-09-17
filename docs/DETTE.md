# Dette et risques de casse

Journal des points qui peuvent casser plus tard **à cause de ce qui a été implémenté**. Une entrée
par session, la plus récente en tête. Un point n'est retiré que lorsqu'il est réglé : on barre la
ligne et on dit par quoi.

Ce fichier ne recense pas les bugs ouverts ni les fonctionnalités manquantes : seulement les
décisions dont la facture arrivera plus tard. Les trous du protocole lui-même (ce qui demande un
amendement §9) vivent à côté du code concerné — pour les schémas, en fin de `schema/README.md`.

Convention de gravité : **haute** = casse silencieuse d'une mesure publiée · **moyenne** = casse
visible, coûteuse à réparer · **basse** = friction.

---

## 2026-09-17 — Mécanisme de clôture de session (`.claude/skills/cloture-de-session/`)

### 1. Rien ne vérifie que la clôture a eu lieu — *basse*

`CLAUDE.md` pointe vers la compétence `cloture-de-session`, et la compétence décrit la procédure.
Mais aucun contrôle automatique ne vérifie qu'une session ayant modifié du code a bien complété
`docs/DETTE.md`. Un contributeur humain, ou un agent qui ne lit pas `CLAUDE.md`, ne verra rien.

**Pourquoi ça casse.** Pas de nombre faux : le journal cesse simplement d'être fiable, et un journal
incomplet est plus trompeur qu'un journal absent — on le croit exhaustif.

**Ce qu'il faut faire.** Décider si un contrôle en intégration continue (une entrée datée du jour
quand le diff touche `pipeline/`, `analysis/` ou `schema/`) vaut sa rigidité. Décision à prendre,
pas à prendre seul : un contrôle trop strict pousse à écrire des entrées vides pour le satisfaire.

---

## 2026-09-17 — JSON Schema des objets du projet (`schema/`)

### 1. Les invariants inter-fichiers ne sont vérifiés par personne — *haute*

JSON Schema valide un fichier à la fois. Quatre cohérences essentielles échappent donc aux schémas
et ne sont aujourd'hui garanties par aucun test :

- `question.grappe_id` doit être l'item marqué `principal` dans `question.items[]` ;
- `notation.contexte` et `verdict.contexte` doivent valoir celui de l'objet noté ;
- tout item de type `F` doit pointer une mesure dont `fictive` vaut `true` ;
- les deux validations concordantes d'un item doivent porter sur la **même version** de cet item.

**Pourquoi ça casse.** Une divergence sur `grappe_id` fausse les grappes du bootstrap (§8) et donc
tous les intervalles de confiance publiés, sans qu'aucune validation n'échoue. Un `contexte` mal
recopié fait entrer une réponse contrefactuelle dans une métrique primaire.

**Ce qu'il faut faire.** En faire des tests bloquants au moment d'écrire le pipeline, dans le même
lot que les tests de symétrie. Tant que ce n'est pas fait, aucune métrique publiée n'est fiable.

### 2. L'épinglage `version` + `empreinte` durcit toute correction d'item — *moyenne*

Questions, tirages et notations épinglent `item_id` + `item_version` + `item_empreinte`. Toute
correction d'item invalide donc, par construction, les objets qui le référencent.

**Pourquoi ça casse.** Une coquille corrigée dans une paraphrase change l'empreinte, casse la
reprise à 80 % du run suivant (§5) et sort la question des « questions communes aux deux runs »
(§8, tendance). Le projet mesurerait alors sa propre correction au lieu de l'évolution de l'outil.

**Ce qu'il faut faire.** Figer avant le premier run la liste exacte des champs entrant dans
l'empreinte. Choix actuel : le contenu notant uniquement (type, mesure, positions, paraphrases,
citations, quantifications, dates de validité), à l'exclusion des statuts et de l'historique. À
confirmer explicitement — le protocole ne le dit nulle part.

### 3. Les exemples ne sont pas encore exécutés en intégration continue — *moyenne*

`schema/exemples/manifeste.json` est une table de vérité complète (40 exemples, résultat attendu et
règle du protocole testée), vérifiée une fois à la main avec `jsonschema` 4.26. Aucun runner n'est
branché sur `pnpm check`.

**Pourquoi ça casse.** Un schéma assoupli par mégarde ne fera échouer aucun test. Les exemples
invalides sont les seuls gardiens des règles du protocole encodées dans les schémas.

**Ce qu'il faut faire.** Brancher un validateur sur `pnpm check`. Suppose de choisir un validateur
côté TypeScript, donc une dépendance : décision à prendre, pas un raccourci à prendre seul.

### 4. `commun.schema.json` crée un couplage fort — *basse*

Les huit schémas référencent une bibliothèque `$defs` commune par URN. Tout validateur doit charger
les neuf fichiers dans un registre ; un schéma pris isolément ne se résout pas.

**Pourquoi ça casse.** Un outil tiers qui charge `item.schema.json` seul échouera sans message
clair. En contrepartie, les dix thèmes et les six gabarits ne peuvent pas diverger entre fichiers —
le couplage est le prix de cette garantie, et il est assumé.
