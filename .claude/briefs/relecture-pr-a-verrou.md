# Brief — D53 (1), PR A : verrou de relecture des mesures avant promotion

## Agent

`codeur-opus`, isolation `worktree`, branche `lots/relecture-verrou` partie de `main` (0862646).

## Objectif

`pnpm promote` refuse d'écrire dans `data/mesures/` toute mesure (création ou réécriture) dont le
contenu exact n'a pas été relu par l'auteur, relecture lue dans un registre publié en ajout seul
`validation/mesures/relectures.json`.

## Contexte que le sous-agent ne peut pas deviner

- Décision D53 (1) du 2026-10-16 (`docs/feuille-de-route.json`, entrée D53 ; `docs/DETTE.md`,
  section « 2026-10-16 — Lot extraction, PR 1 », point 1, dette *haute*). L'extraction
  (`pipeline/extraction/assemblage.ts:mesureDe`) crée une mesure de staging par item, avec le
  libellé du modèle recopié dans `formulation_canonique` (`formulationProposee`). Or
  `formulation_canonique` est le texte exact substitué dans les gabarits de questions (§5,
  symétrie) et la mesure est un référent partagé entre candidats. Promue telle quelle, elle
  entrerait dans `data/` sans relecture humaine.
- Décisions de l'auteur du 2026-10-16 : (a) c'est **l'auteur** qui rattache et relit, via un
  registre publié (comme les corrections de thème) ; (b) découpage : **cette PR = le verrou seul**
  (schéma + lecture du registre + refus dans la promotion). La commande d'écriture
  (`pnpm mesures --rattacher …`) est la PR B, l'amendement du protocole la PR C. Ne pas les faire.
- Règle **uniforme** : toute mesure qui serait créée ou réécrite dans `data/mesures/` exige une
  relecture couvrant son `(id, version, empreinte)`. Aucune distinction selon l'origine de la mesure
  (extraction ou autre) : pas de test sur l'historique, pas de `if` d'origine (CLAUDE.md,
  anti-patterns). Une mesure déjà publiée identique (sort `identique`) passe sans relecture.
- Conséquence voulue : après une correction de thème acceptée, la nouvelle version de la mesure
  devra être relue à son tour avant promotion. À noter au rapport (sera inscrit au DETTE par la
  session principale), ne pas l'exempter.

## Fichiers

À lire d'abord :
- `validation/io/data-mesures.ts` : `trier`, `comparer`, `planifierMesures`, `MotifRefusMesure`.
  Le verrou s'insère dans `trier`, après le contrôle de schéma, pour les sorts `creer` et `reecrire`.
- `validation/io/mesures-fichier.ts` et `schema/decision-mesure.schema.json`,
  `validation/domaine/corrections-mesure.ts` (`validerEntreeRegistre`) : **modèle à imiter** pour
  le registre (ajout seul, fichier absent = registre vide, corruption bloquante, double contrôle
  schéma + validateur typé, test d'accord entre les deux).
- `outils/promote.ts` : options (`mesures`, `data-mesures`), `lireRegistre`, appel à
  `planifierMesures`, rapport des refus.
- `tests/promote-mesures.test.ts`, `tests/data-mesures.test.ts`, `tests/ecriture-data.test.ts`,
  `tests/corrections-mesure.test.ts`.
- `validation/domaine/empreinte.ts` et la façon dont l'empreinte d'une mesure est calculée
  (`mesure.schema.json` : sha256 de la forme canonique de {libelle, theme, formulation_canonique, fictive}).

À créer :
- `schema/relecture-mesure.schema.json` : UNE entrée du registre. Champs requis `mesure_id` (ulid),
  `mesure_version` (entier ≥ 1), `empreinte` (sha256), `date` (date_civile) ;
  `additionalProperties: false`. Descriptions en français, dans le style de `decision-mesure`.
  L'enregistrer là où les schémas sont recensés (`outils/schemas/`, `schema/README.md`).
- `validation/domaine/relectures-mesure.ts` : pur, sans disque. Type d'entrée, validateur typé
  `validerEntreeRelecture`, et `mesureRelue(registre, mesure): boolean` (vrai ssi une entrée porte
  exactement id, version et empreinte de la mesure).
- `validation/io/relectures-fichier.ts` : lecture seule de `<repertoire>/relectures.json`
  (tableau d'entrées). Absent ⇒ registre vide. Illisible / entrée malformée ⇒ erreur nommée qui
  bloque. Pas de fonction d'écriture (PR B).
- Tests : `tests/relectures-mesure.test.ts` (+ cas ajoutés dans les tests de promotion existants).
- Un registre de démonstration si la promotion de démo (`validation/fixtures/staging-demo`) en a
  besoin pour rester fonctionnelle, à côté des fixtures existantes.

À modifier :
- `validation/io/data-mesures.ts` : nouveau motif `sans_relecture` ; `planifierMesures` reçoit le
  registre de relectures ; détail du refus lisible (id, version, empreinte attendus).
- `outils/promote.ts` : lit le registre (répertoire par défaut `validation/mesures`, même option
  que le registre des corrections ou option dédiée, au choix le plus simple et cohérent), le passe,
  le mentionne dans le commentaire d'en-tête.
- Fixtures des tests existants qui créent ou réécrivent des mesures : y ajouter les relectures.

À ne pas toucher : `data/`, `docs/PROTOCOLE.md`, `prompts/`, `config/perimetre.yaml`,
`pipeline/extraction/`, `outils/mesures.ts` (PR B), `docs/DETTE.md`, `LESSONS.md`,
`docs/feuille-de-route.json`.

## Contraintes du protocole applicables

- CLAUDE.md règle 3 : « Aucune donnée n'entre dans `data/` sans validation humaine. » Le verrou
  en est l'application aux mesures.
- CLAUDE.md : « Valeurs par défaut silencieuses : `?? 0`, `catch {}` … Une donnée absente doit être
  absente et visible. » Une entrée de registre malformée bloque, n'est jamais ignorée.
- CLAUDE.md : « Un `if` particulier pour un candidat ou un outil. Les cas particuliers sont des
  données. » Idem pour l'origine d'une mesure.
- Complexité : cyclomatique ≤ 9, cognitive < 15 par fonction ; découper (compétence
  `complexite-maitrisee`), jamais désactiver.
- Pas de nouvelle dépendance.

## Cas limites à tester

1. Mesure nouvelle sans aucune relecture ⇒ refus `sans_relecture`, rien n'est écrit (ni item ni mesure).
2. Registre absent ⇒ registre vide ⇒ refus de toute mesure nouvelle.
3. Relecture de la bonne mesure mais d'une autre version ⇒ refus.
4. Relecture de la bonne version mais d'une autre empreinte (formulation modifiée après relecture) ⇒ refus.
5. Relecture exacte ⇒ création permise.
6. Réécriture (version supérieure) sans relecture de la nouvelle version, même si l'ancienne est relue ⇒ refus.
7. Mesure publiée identique ⇒ passe sans relecture.
8. Plusieurs items citant la même mesure non relue ⇒ un seul refus, aucun item écrit.
9. Registre JSON illisible ⇒ erreur bloquante nommée.
10. Entrée malformée (champ manquant, champ en trop, empreinte non hexadécimale) ⇒ erreur bloquante.
11. Accord schéma / validateur typé (comme `tests/corrections-mesure.test.ts`).
12. Deux entrées identiques au registre ⇒ acceptées (ajout seul, doublon inoffensif).
13. Les refus déjà existants (`absente_du_staging`, `non_conforme`, `regression_de_version`,
    `meme_version_contenu_different`) priment / restent inchangés.

## Ce qui ne doit pas bouger

- Les autres motifs de refus et leurs messages ; le comportement de `pnpm promote` sans `--ecrire`
  (simulation) ; les garde-fous Git ; les assertions des tests existants (on ajoute des relectures
  aux fixtures, on n'affaiblit aucune assertion).
- `tests/ecriture-data.test.ts` doit rester vert : rien n'écrit dans `data/` hors de promote.

## Définition de terminé

- `pnpm check && pnpm test` passent, lancés par le sous-agent.
- Chaque cas limite ci-dessus a un test nommé.
- Rien d'écrit hors des fichiers listés.
- Aucun commit.
- Rapport : fichiers créés/modifiés, cas limites ↔ tests, ce qui pourrait casser plus tard (2 lignes),
  questions ouvertes.

## Questions déjà tranchées

- Qui relit ? L'auteur, par registre. Pas d'écran annotateur dans cette PR ni la suivante.
- Faut-il la commande d'écriture du registre ? Non : PR B.
- Exempter les mesures non issues de l'extraction ou les réécritures après correction de thème ? Non.
- Le registre contient-il le texte de la formulation ? Non : l'empreinte la couvre.
- Faut-il amender le protocole ? Pas dans cette PR (PR C, proposée par la session principale).
