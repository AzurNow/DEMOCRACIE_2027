# Brief — lot extraction, PR 1 : cœur pur de l'extraction double, sans réseau

## Agent

`codeur-opus`, isolation `worktree`, branche `lots/extraction-coeur` à partir de `main`.

## Objectif

Un module pur `pipeline/extraction/` prend le texte canonique d'une source et les **sorties brutes
de deux modèles**. Il les rend sous forme d'items et de mesures proposées, conformes aux schémas,
prêts à être déposés dans `staging/`, et d'un journal des rejets. Tout est déterministe, testé
d'abord, sans aucun appel réseau ni aucune écriture disque hors des tests.

## Contexte que tu ne peux pas deviner

- **`docs/PROTOCOLE.md` fait autorité** (0.16). Lis le §3 (thèmes, exclusions), le §4 en entier
  (item, types, tiers, citation verbatim, normalisation, contrat des artefacts, grille par type),
  et `CLAUDE.md` à la racine (huit règles non négociables, seuils de complexité).
- **Le prompt** est `prompts/extraction-1.0.0.md`, relu par l'auteur le 2026-10-12 (D35). Lis-le en
  entier : il fixe la **forme de la sortie du modèle** (`{"items": [...]}`) et dit ce que le code
  ajoute seul, sans le modèle : test verbatim et offsets, page recalculée depuis les offsets et
  `pages` de la fiche d'extraction, horodatage d'une source audio ou vidéo depuis le cue qui
  contient la citation, source archivée, dates, version du prompt, modèles. **Une sortie qui n'est
  pas un JSON conforme est rejetée en entier, jamais réparée.** Ne modifie pas le prompt.
- **D52**, tranchée le 2026-10-16 (`docs/feuille-de-route.json`, entrée D52, à lire) :
  1. Les deux extracteurs sont Claude Sonnet 5.5 et Mistral Large. Ils entrent ici comme **données**
     (identifiants dans une configuration ordonnée), jamais comme `if` sur un nom de modèle. Les
     éditeurs réels arrivent en PR 2. Ici, les sorties brutes sont des chaînes reçues en entrée.
  2. **Appariement.** Deux items, un de chaque modèle, sont appariés quand les intervalles de leurs
     citations (offsets en points de code, après test verbatim réussi) **se recouvrent** et qu'ils
     ont **le même thème** (`mesure_proposee.theme`). Si un item a plusieurs candidats, on prend
     le plus grand recouvrement, puis à égalité le plus petit offset de début. L'appariement est
     un-à-un et doit être déterministe et indépendant de l'ordre des items dans chaque sortie
     (écris-le, teste-le).
     - Item sans partenaire ⇒ `desaccord_existence`.
     - Item apparié dont `type`, `position` ou `quantification` diffèrent ⇒ `desaccord_contenu`,
       avec `detail_desaccord` qui nomme les champs qui divergent.
     - Sinon ⇒ `accord`.
     - Le libellé et la paraphrase sont du texte libre : **ne les compare pas**.
  3. **Item déposé.** Une paire donne **un seul** item. Ses champs (libellé proposé, paraphrase,
     citation, quantification, position, type) viennent du modèle **nommé en premier** dans la
     configuration. Un item non apparié est déposé quand même, marqué `desaccord_existence`.
     `assertion.extraction.modeles` liste les deux modèles dans l'ordre de la configuration.
  4. **Texte lu.** Une source peut avoir plusieurs fiches d'extraction de texte
     (`staging/extractions/<sha256_source>/<texte_sha256>.json`, `docs/CONTRATS.md` §1.1, champ
     `extracteur {outil, version, options}`). L'extraction lit la fiche produite par la version
     d'extracteur **épinglée par le code**, que tu passes en entrée du cœur : aucune constante
     cachée. S'il n'y a aucune fiche de cette version, ou plus d'une, la source est **refusée** avec
     une erreur nommée, sans repli. Règle la DETTE du 2026-09-23, point 1, en ce sens (barre-la
     comme les autres entrées réglées, avec le nom de la branche).
- **Règle 5 : le test verbatim est déterministe.** Réutilise
  `validation/domaine/verbatim.ts:testerVerbatim` et `validation/domaine/normalisation.ts`. Ne
  réécris pas de normalisation. Une citation qui échoue est **rejetée** : elle n'est jamais
  rapprochée de la source et n'entre pas dans l'appariement. Elle part au journal des rejets, avec
  le modèle, l'index de l'item dans sa sortie et le motif. Une citation qui contient U+000C
  (saut de page) est rejetée elle aussi : le prompt l'interdit, le code le vérifie.
- **Une citation qui figure plusieurs fois dans le texte.** Regarde ce que `testerVerbatim` rend
  (première occurrence ?). Si l'ambiguïté change la page ou l'appariement, n'invente pas de règle :
  écris le test qui montre le cas et arrête-toi pour le signaler dans ton rapport.
- **Mesure proposée.** Le schéma d'item exige `mesure_id` et `mesure_version`. Le prompt dit que
  `mesure_proposee` est une proposition, que la validation humaine rattache à une mesure. Va voir
  comment l'interface de validation traite aujourd'hui un item de staging et sa mesure :
  `validation/io/staging.ts`, `validation/domaine/corrections-mesure.ts`, `renvoi-mesure.ts`,
  `promotion.ts`, et `validation/fixtures/staging-demo/` (items et mesures). Si un item déposé avec
  une **nouvelle mesure de staging** (même ULID que l'écrivain existant, libellé et thème proposés)
  est le chemin que l'interface sait déjà traiter, fais-le. Sinon, arrête-toi et décris l'écart
  dans ton rapport, sans rien inventer.
- **Champs que le code remplit seul :** identifiants (écrivain d'ULID existant :
  `validation/domaine/ulid.ts`), `empreinte` (`validation/domaine/empreinte.ts`), `historique`,
  `valide_du` (cherche la règle existante : `validation/domaine/dates-sources.ts` et le §4 ; s'il
  n'y en a pas pour une extraction, arrête-toi et dis-le), `source` assemblée depuis la fiche de
  source et le manifeste. La forme de `source` est `commun#/$defs/source`. Son assembleur unique
  est **Python** (`pipeline/collecte/source.py:source_de`, DETTE 2026-09-2x). Ne le duplique pas
  en TS : ici, le bloc `source` arrive **déjà assemblé** en entrée du cœur. La PR 3 dira comment
  l'obtenir. Signale dans ton rapport ce que cela suppose.
- Le temps (`date` du test verbatim, `historique`) et les identifiants entrent par un port
  (horloge, générateur d'ULID), pour que les tests soient reproductibles octet pour octet.
- Langage : TypeScript strict. Les sorties de modèle sont validées par un **JSON Schema** ajouté
  dans `schema/` (`sortie-extraction.schema.json` ou nom cohérent), enregistré comme les autres :
  `outils/schemas/noms.ts`, exemples valides et invalides dans `schema/exemples/`, manifeste. Le
  schéma suit exactement la forme du prompt : `additionalProperties: false`, `type` P ou O,
  `position` sans `sans_objet`, `candidat_id` égal à celui de la source (vérifié par le code s'il
  ne peut pas l'être par le schéma).

## Fichiers

- À lire d'abord : `CLAUDE.md`, `prompts/extraction-1.0.0.md`, `docs/CONTRATS.md` §1, §1.1, §2,
  §5, `schema/item.schema.json` (`assertion`, `test_verbatim`, `extraction`),
  `schema/commun.schema.json` (`source`, `quantification`, `theme`, `position`),
  `schema/extraction-texte.schema.json`, `validation/domaine/{verbatim,normalisation,ulid,empreinte,dates-sources,webvtt,types}.ts`,
  `validation/io/staging.ts`, `pipeline/reformulation/` (modèle maison d'un module de pipeline :
  `controle.ts`, `staging.ts`, `cles-dupliquees.ts` pour le parse JSON strict), et la compétence
  `.claude/skills/complexite-maitrisee/SKILL.md`.
- À créer : `pipeline/extraction/` (logique pure, fichiers courts et nommés : lecture stricte de
  la sortie, test verbatim et page ou horodatage, appariement, assemblage de l'item, choix du
  texte, rejets), `schema/sortie-extraction.schema.json` et ses exemples, tests sous
  `tests/extraction/`.
- À modifier : `outils/schemas/noms.ts`, `schema/exemples/manifeste.json`, `docs/DETTE.md` (le
  point du 2026-09-23 réglé, plus une entrée du jour pour ce que tu laisses), `docs/CONTRATS.md`
  si tu fixes un contrat d'artefact (journal des rejets).
- À ne pas toucher : `data/`, `docs/PROTOCOLE.md`, `prompts/`, `config/perimetre.yaml`,
  `pipeline/collecte/` (Python), `validation/` (lecture seule ; si une fonction du domaine doit
  être exportée, dis-le dans ton rapport avant de la modifier), `package.json` (aucun script ni
  dépendance dans cette PR).

## Contraintes du protocole applicables

- Règle 3 : « Le pipeline écrit uniquement dans `staging/`. » Ici, rien n'écrit sur disque, sauf
  les tests, dans des répertoires temporaires.
- Règle 5 : « Vérifier qu'une citation figure dans sa source est une comparaison de chaînes après
  normalisation, jamais un jugement de modèle. »
- Règle 7 : les sorties brutes des modèles sont immuables. Le cœur les reçoit comme chaînes et ne
  les modifie pas. Il ne les « nettoie » pas : pas de retrait de bloc Markdown, pas de troncature.
  Un JSON entouré de texte est rejeté en entier.
- `CLAUDE.md` : « Jamais […] rédiger, inventer ou "compléter" le contenu d'un item, d'une citation
  ou d'une position de candidat. » Aucune valeur par défaut silencieuse (`?? 0`, `catch {}`,
  `|| "inconnu"`). Aucun `if` sur un candidat ou un modèle.
- §4 : « l'extraction est faite deux fois par des modèles de familles différentes et tout
  désaccord d'existence ou de contenu est signalé ». Le cœur refuse deux identifiants de modèle
  identiques. Il n'a aucun moyen de connaître la famille : signale-le, sans inventer de table.
- Complexité : cyclomatique ≤ 9, cognitive < 15, sans désactivation du linter.

## Cas limites à tester

1. Sortie non JSON, JSON entouré de texte ou d'un bloc ```json, clé dupliquée, champ en trop,
   `type` A ou F, `position` `sans_objet`, thème hors des dix codes ⇒ sortie entière rejetée,
   motif nommé, aucun item de ce modèle.
2. `{"items": []}` des deux côtés ⇒ zéro item, zéro rejet, pas d'erreur.
3. Un modèle rend des items, l'autre `{"items": []}` ⇒ tous `desaccord_existence`.
4. Une sortie rejetée en entier pour un modèle, l'autre valide. **Arrête-toi et signale** si tu ne
   sais pas s'il faut déposer en `desaccord_existence` ou refuser la source : c'est un trou de D52.
   Écris le test qui fixe le comportement que tu proposes, marqué comme tel dans le rapport, sans
   `skip`.
5. Citation avec guillemets, apostrophes et tirets typographiques dans la source, ASCII dans la
   sortie (et l'inverse) ⇒ passe, offsets justes en points de code.
6. Citation avec un caractère hors BMP (emoji) avant elle dans le texte ⇒ offsets en points de code,
   pas en unités UTF-16.
7. Citation avec une coquille corrigée par le modèle ⇒ rejetée.
8. Citation contenant U+000C, citation vide ⇒ rejetée.
9. Citation présente deux fois dans le texte (voir plus haut).
10. Page : citation sur la première page, la dernière, et juste après un U+000C. Source HTML sans
    page ⇒ pas de `page`. Programme PDF (`page` obligatoire) dont la fiche n'a pas `pages` ⇒ erreur
    nommée.
11. Source audio ou vidéo : horodatage depuis le cue qui contient la citation. Citation à cheval sur
    deux cues : regarde `webvtt.ts` et `docs/CONTRATS.md` §2 ; si aucune règle n'existe, arrête-toi.
12. Appariement : recouvrement partiel ; inclusion d'une citation dans l'autre ; deux candidats à
    recouvrement égal ⇒ plus petit offset ; mêmes citations mais thèmes différents ⇒ deux
    `desaccord_existence` ; mêmes citations, positions différentes ⇒ `desaccord_contenu` ;
    quantification présente d'un côté seulement ⇒ `desaccord_contenu` ; intervalles qui se touchent
    sans se recouvrir (`fin == début`, intervalle semi-ouvert) ⇒ non appariés.
13. Ordre des items permuté dans l'une ou l'autre sortie ⇒ résultat identique octet pour octet.
14. Deux identifiants de modèle identiques ⇒ refus.
15. Choix du texte : aucune fiche de la version épinglée ; deux fiches de la version épinglée ;
    une fiche d'une autre version seulement ⇒ refus nommé dans les trois cas.
16. `candidat_id` de la sortie différent de celui de la source ⇒ item rejeté.
17. Chaque item et chaque mesure produits passent `valider("item", …)` et `valider("mesure", …)`,
    et `chargerStaging` les lit après écriture dans un répertoire temporaire.

## Ce qui ne doit pas bouger

`validation/`, `pipeline/collecte/`, `pipeline/reformulation/`, les schémas existants (sauf
l'enregistrement du nouveau). Tous les tests existants restent verts sans changement d'assertion.

## Définition de terminé

- `pnpm check && pnpm test` passent, lancés par toi.
- Chaque cas limite ci-dessus a un test nommé.
- Rien d'écrit hors des fichiers listés.
- Commit sur `lots/extraction-coeur`, **sans push**. Message en français, se terminant par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rapport, dans cet ordre : ce qui existe ; les points où tu t'es arrêté (cas 4, 9, 11, mesure
  proposée, `valide_du`, `source` assemblée) avec ta proposition ; ce qui pourrait casser plus tard,
  en deux lignes.

## Questions déjà tranchées

- Les deux modèles, l'appariement, l'item déposé, le texte lu : D52, ci-dessus. Ne les redemande pas.
- Pas de SDK, pas de dépendance nouvelle, pas de réseau dans cette PR.
- Le prompt est relu et figé en 1.0.0 : n'y touche pas, même pour corriger son en-tête « à relire ».
- `libelle` et `paraphrase` ne sont jamais comparés entre les deux modèles.
