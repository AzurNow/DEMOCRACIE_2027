# Brief — lot extraction, PR 3 : `pnpm extraction:entrees` et `pnpm extraire`

## Agent

`codeur-opus`, isolation `worktree`, branche `lots/extraction-commande` partant de `main` (d9d9a5d
ou plus récent).

## Objectif

Rendre l'extraction double exécutable de bout en bout : une étape Python écrit, pour chaque source
collectée, un fichier d'entrée validé portant le bloc `source` assemblé par `source_de` ; une
commande TypeScript `pnpm extraire` lit ces fichiers, appelle les deux extracteurs (ou leurs
simulés), garde chaque réponse HTTP brute, exécute le cœur `extraireSource` et dépose items, mesures
et journal dans `staging/`.

## Contexte que tu ne peux pas deviner

- Le lot extraction est découpé en trois PR. PR 1 (#142, fusionnée) : cœur pur
  `pipeline/extraction/extraction.ts:extraireSource`, sans réseau ni disque. PR 2 (#143,
  fusionnée) : adaptateurs Anthropic et Mistral (fetch, sans SDK), rendu du prompt
  (`prompt.ts`), configuration `config/extraction.json` (`configuration-editeurs.ts`, tout à `null`
  tant que l'auteur ne l'a pas remplie), éditeur simulé (`editeur-simule.ts`) et
  `editeur.ts:appelerExtracteur` (un appel pur). **Ta PR assemble tout cela ; elle ne réécrit aucune
  logique de ces modules.**
- Décisions D52 et D53 (texte complet dans `docs/feuille-de-route.json`, entrées D52 et D53) :
  - D52 (4) : on n'extrait que le texte produit par l'extracteur de texte **épinglé par le code** ;
    la règle de choix est `choix-texte.ts:choisirFiche` (aucune ou plusieurs fiches ⇒ refus nommé,
    sans repli). Ne la réécris pas, ni en Python ni ailleurs.
  - D53 (2) : une sortie de modèle illisible (HTTP non 2xx, sortie coupée, refus, JSON invalide…)
    ⇒ la source entière est refusée, entrée `extraction_double_incomplete` au journal. Le cœur le
    fait déjà (`extraction.ts`, `rejets.ts`) : tu dois seulement lui passer la sortie brute et
    écrire le journal.
- **Frontière Python → TypeScript, décision de l'auteur du 2026-10-16** : fichier intermédiaire.
  `pipeline/collecte/source.py:source_de` reste le **seul** assembleur du bloc `source`. Ne le porte
  pas en TypeScript, n'appelle pas Python depuis TypeScript.
- Pour ne pas dupliquer la règle de choix du texte, l'étape Python écrit **un bloc `source` par
  fiche d'extraction de texte** de la source (`source_de(racine, cle_source, sha256, texte_sha256)`
  sans citation : ni `page` ni `extrait`, le cœur calcule la page lui-même). C'est le TypeScript qui
  choisit la fiche avec `choisirFiche`, puis prend le bloc `source` correspondant à son
  `texte_sha256`.
- Le modèle à suivre pour la commande est `pnpm reformuler` : `outils/reformuler.ts` (mince) et
  `pipeline/reformulation/commande.ts`, `executer.ts`, `reprise.ts`, `staging.ts`,
  `transport-fetch.ts`. Reprends ses idiomes : dépendances injectées, `--simule` qui écrit **hors
  du dépôt**, `--plafond` obligatoire en mode réel, clés d'API lues dans l'environnement et masquées
  dans tout message (`masquer`), écriture atomique « écrit une fois, jamais réécrit ». Réutilise ce
  qui est générique ; ne copie pas un module entier.
- L'extracteur de texte épinglé (`ExtracteurEpingle` : outil, version, options) : cherche dans
  `pipeline/collecte/textes/` la constante qui décrit l'extracteur que le code utilise aujourd'hui.
  L'étape Python l'inscrit dans chaque fichier d'entrée ; c'est elle, la valeur épinglée par le
  code. **S'il n'existe pas de telle constante unique, arrête-toi et rapporte-le** plutôt que d'en
  inventer une.

## Fichiers

À lire d'abord :
- `CLAUDE.md`, puis `docs/PROTOCOLE.md` §4 (extraction).
- `pipeline/extraction/*.ts` (surtout `extraction.ts` : `EntreeExtraction`, `Ports`,
  `ResultatExtraction` ; `editeur.ts` ; `editeur-simule.ts` ; `configuration-editeurs.ts` ;
  `prompt.ts` ; `rejets.ts` ; `assemblage.ts`).
- `pipeline/collecte/source.py` (`source_de`), `manifeste.py` (`REPERTOIRE_FICHES`,
  `chemin_manifeste`), `textes/fiche.py` (`chemin_fiche_extraction`), `transcription/`
  (emplacement du `.vtt`).
- `pipeline/reformulation/` et `outils/reformuler.ts` (modèle de commande).
- `validation/io/staging.ts` : l'interface lit `staging/items/<id>.json` (schéma `item`) et
  `staging/mesures/<id>.json` (schéma `mesure`). C'est là que tu déposes.
- `tests/ecriture-data.test.ts` : garde de la règle 3.

À créer (noms ajustables si l'existant impose mieux, dis-le) :
- `pipeline/collecte/entrees_extraction.py` (+ `__main__` ou équivalent) et ses tests pytest :
  pour chaque fiche de source `par-source/<cle_source>/<sha256>.json` dont le contenu a au moins une
  fiche d'extraction, écrit `staging/entrees-extraction/<cle_source>/<sha256>.json` : `cle_source`,
  `sha256_source`, `candidat_id`, ce qu'il faut pour les variables du prompt (`type_document`,
  `format`), l'extracteur épinglé, et la table `texte_sha256 → bloc source`. Validé contre son
  schéma avant écriture. Une source sans archive Wayback (`SourceSansArchive`) ou dont
  l'assemblage échoue n'est pas écrite et est nommée dans le bilan, jamais complétée. Fichier déjà
  présent et identique : rien à faire ; présent et différent : erreur nommée, pas d'écrasement.
- `schema/entree-extraction.schema.json`, `schema/reponse-extraction.schema.json` (une réponse HTTP
  reçue, telle quelle : statut, corps `brut` ou `brut_texte`, modèle, version et SHA-256 du prompt
  rendu, instant, source), `schema/journal-extraction.schema.json` (issue d'une source : ids des
  items et mesures déposés, rejets, ou refus). Inscris-les là où `outils/schemas/` l'exige.
- `pipeline/extraction/commande.ts` (et les modules qu'il faut : entrées, staging, reprise), tests
  Vitest à côté des existants.
- `outils/extraire.ts`, mince, sur le modèle de `outils/reformuler.ts`.

À modifier :
- `package.json` : scripts `extraction:entrees` (`uv run python -m …`) et `extraire`. Aucune
  dépendance ajoutée.

À ne pas toucher : `data/`, `docs/PROTOCOLE.md`, `prompts/` (le prompt reste en 1.0.0),
`config/extraction.json` (l'auteur la remplit), `config/perimetre.yaml`, la logique des modules
PR 1 et PR 2 (si un vrai défaut y apparaît, rapporte-le au lieu de corriger), `validation/` (la PR
qui bloque la promotion des items extraits, D53 (1), est séparée).

## Déroulé attendu de `pnpm extraire`

```
ANTHROPIC_API_KEY=… MISTRAL_API_KEY=… pnpm extraire --plafond=<n> [--source=<cle_source>/<sha256>]
pnpm extraire --simule [--sortie=<chemin>] [--source=…]
```

Pour chaque fichier d'entrée, dans un ordre déterministe (tri sur le chemin) :
1. Journal déjà présent pour cette source ⇒ sautée (déjà traitée, y compris refusée : une source
   refusée n'est jamais relancée automatiquement).
2. Lire et valider l'entrée ; lire les fiches d'extraction et choisir avec `choisirFiche` ; lire le
   texte canonique (vérifier son SHA-256) et le `.vtt` s'il y a lieu. Toute incohérence : erreur
   nommée pour cette source, rien d'écrit pour elle.
3. Rendre le prompt (`rendrePromptExtraction`), puis pour chaque extracteur, **dans l'ordre de la
   configuration** : si une réponse brute existe déjà pour (source, modèle, SHA-256 du prompt
   rendu), la réutiliser ; sinon appeler (`appelerExtracteur`, délai d'abandon de la
   configuration), décompter du plafond, écrire la réponse brute **telle que reçue** (règle 7) avant
   toute lecture. Échec de transport (`ErreurReseau`) ou corps non UTF-8 : rien n'est écrit, la
   source reste non traitée, elle sera reprise au prochain lancement sans repayer l'appel déjà
   gardé.
4. Les deux réponses gardées : passer au cœur `extraireSource` le texte lu de chaque appel (une
   lecture illisible est transmise de façon que le cœur produise le refus D53 (2) ; regarde comment
   `extraireSource` attend les `sorties` et dis-le si l'interface ne le permet pas). Écrire items et
   mesures sous `staging/items/` et `staging/mesures/`, puis le journal de la source en dernier
   (c'est lui qui marque la source comme traitée).
5. Plafond atteint : arrêt propre, bilan imprimé, code de sortie distinct.

`commit` : le commit HEAD du code qui extrait, injecté (regarde `outils/garde-fous-git.ts` et ce que
fait `reformuler` ; un arbre de travail sale en mode réel doit être refusé si c'est l'idiome
existant). `maintenant` et `nouvelUlid` injectés.

## Contraintes du protocole applicables

- Règle 3 : « Le pipeline écrit uniquement dans `staging/`. » Aucun chemin vers `data/` dans ces
  modules ; `tests/ecriture-data.test.ts` doit rester vert sans exception ajoutée.
- Règle 7 : « Ce qu'un outil a répondu est stocké tel quel, jamais nettoyé, tronqué, reformaté ni
  corrigé. »
- Règle 6 : aucun prompt en dur ; on rend `prompts/extraction-1.0.0.md` via `prompt.ts`.
- §4 : « l'extraction est faite deux fois par des modèles de familles différentes et tout désaccord
  d'existence ou de contenu est signalé ».
- Anti-patterns de `CLAUDE.md` : pas de `?? 0`, `catch {}`, `|| "inconnu"` ; pas de `if` pour un
  éditeur ou un candidat particulier (table `FABRIQUES`).
- Complexité : cyclomatique ≤ 9, cognitive < 15 par fonction ; compétence `complexite-maitrisee`
  si besoin, jamais de désactivation du linter.
- Aucun nouvel appel réseau : seuls les deux points d'accès déjà en place (Anthropic, Mistral).

## Cas limites à tester

Python :
1. Source à deux fiches d'extraction ⇒ deux blocs `source` dans l'entrée, aucun choix fait.
2. Source sans archive Wayback ⇒ pas d'entrée, nommée dans le bilan.
3. Source sans fiche d'extraction ⇒ pas d'entrée.
4. Entrée déjà présente identique ⇒ inchangée ; différente ⇒ erreur, pas d'écrasement.
5. Entrée non conforme à son schéma ⇒ rien d'écrit.

TypeScript (mode simulé et éditeurs factices) :
6. Bout en bout conforme : items et mesures déposés, conformes à `item` et `mesure`, relus sans
   erreur par `validation/io/staging.ts:chargerStaging`.
7. Une sortie illisible (HTTP 500, coupée, bloc de code) ⇒ source refusée, journal
   `extraction_double_incomplete`, aucun item, réponses brutes gardées.
8. Échec de transport sur le second extracteur ⇒ première réponse gardée, pas de journal ; relance
   ⇒ le premier extracteur n'est pas rappelé.
9. Journal présent ⇒ source sautée, zéro appel.
10. Plafond atteint au milieu d'une source ⇒ arrêt, réponse déjà reçue gardée, pas de journal.
11. Aucune ou plusieurs fiches de l'extracteur épinglé ⇒ erreur nommée, rien d'écrit pour la source.
12. Texte canonique dont le SHA-256 ne correspond plus ⇒ erreur nommée.
13. Réponse brute existante mais prompt rendu différent (SHA-256) ⇒ pas réutilisée.
14. Mode réel avec `config/extraction.json` incomplète ou clé d'API absente ⇒ refus avant tout
    appel ; la clé n'apparaît jamais dans un message.
15. Mode simulé : rien n'est écrit sous le `staging/` du dépôt.
16. Deux lancements identiques en simulé ⇒ mêmes fichiers d'entrée lus, même ordre de traitement.
17. Réponse brute de corps non JSON gardée en `brut_texte`, octet pour octet.

## Ce qui ne doit pas bouger

- Signatures et comportements de `pipeline/extraction/*.ts` existants, et leurs tests.
- `pnpm reformuler` et ses tests (si tu factorises un utilitaire commun, ses tests restent verts
  sans modification d'assertion).
- `tests/ecriture-data.test.ts` sans nouvelle exception.

## Définition de terminé

- `pnpm check && pnpm test` passent, ainsi que `pnpm check:py && pnpm test:py`, lancés par toi.
- Chaque cas limite ci-dessus a un test nommé.
- `pnpm extraction:entrees` puis `pnpm extraire --simule` exécutés au moins une fois sur un staging
  de fixtures dans un répertoire temporaire ; dis ce que tu as observé.
- Rien d'écrit hors des fichiers listés.
- Commit sur la branche `lots/extraction-commande` (message en français, comme l'historique),
  poussée ; **pas de PR**, la session principale l'ouvre.
- Rapport : (1) ce qui existe, (2) les choix que tu as faits là où ce brief laissait du jeu,
  (3) ce que tu n'as pas pu faire et pourquoi, (4) ce qui pourrait casser plus tard, en deux lignes.

## Questions déjà tranchées

- Frontière Python → TS : fichier intermédiaire, pas de sous-processus, pas de portage de
  `source_de` (auteur, 2026-10-16).
- Extracteur épinglé (auteur, 2026-10-16, option A) : il n'existe pas de constante unique ; crée
  dans `pipeline/collecte/textes/` une fonction unique `extracteur_en_service(type_contenu)` qui
  rend `{outil, version, options}` de l'extracteur que le code utiliserait aujourd'hui pour ce
  contenu, en réutilisant le choix de genre de `extraction.py:_genre` et les `OUTIL`/options/version
  des modules `pdf.py`, `page_html.py`, `transcription_vtt.py` (version lue à l'exécution, comme
  dans les fiches). Fais en sorte que les extracteurs eux-mêmes et cette fonction tirent leur
  description de la même source, pour qu'ils ne puissent pas diverger (test à l'appui). L'étape
  d'entrées l'appelle et l'inscrit dans chaque fichier d'entrée. Un patch Python différent entre
  `pnpm textes` et `pnpm extraction:entrees` ⇒ `AucunTexteEpingle`, refus nommé, jamais de repli.
  Ajoute un cas limite testé pour ce dernier point. Ne touche pas au protocole : l'inscription au
  §4 est proposée à part par la session principale.
- Ordre des appels : Anthropic puis Mistral, l'ordre de `config/extraction.json`, jamais réordonné.
- Pas de repli de modèle, pas de température côté Anthropic (PR 2).
- Une source refusée n'est pas relancée automatiquement ; comment la relancer volontairement est
  hors périmètre (note-le comme dette).
- La promotion des items extraits n'est pas bloquée par cette PR : c'est la PR interface (D53 (1)),
  séparée. Ne touche pas à `validation/`.
