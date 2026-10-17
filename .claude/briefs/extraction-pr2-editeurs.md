# Brief — lot extraction, PR 2 : éditeurs des deux extracteurs, rendu du prompt, éditeur simulé

## Agent

`codeur-opus`, isolation `worktree`. Branche `lots/extraction-editeurs` créée à partir de
`origin/lots/extraction-coeur` (PR #142, pas encore fusionnée : la PR 2 s'empile dessus et visera
`main` une fois #142 fusionnée).

## Objectif

Le code sait **appeler les deux extracteurs** (Claude Sonnet 5.5 chez Anthropic, Mistral Large chez
Mistral) en `fetch`, sans SDK, et en lire le texte du modèle. Il sait **rendre le prompt
d'extraction** depuis `prompts/extraction-1.0.0.md` et lire une **configuration** des deux
extracteurs. Il fournit un **éditeur simulé** sans réseau. La commande `pnpm extraire`, l'écriture
des réponses brutes et du journal sur disque viennent en PR 3 : pas ici.

## Contexte que tu ne peux pas deviner

- **`docs/PROTOCOLE.md` fait autorité.** Lis `CLAUDE.md` (huit règles, seuils de complexité), le §4
  du protocole (extraction double), et dans `docs/feuille-de-route.json` les entrées **D52** et
  **D53**.
- **D52 (1)**, tranchée par l'auteur : les extracteurs sont Claude Sonnet 5.5 et Mistral Large,
  appelés **en fetch, sans SDK**. L'auteur a accepté le nouvel appel réseau vers l'API Anthropic.
  N'ajoute **aucune dépendance**.
- **Le modèle à suivre est la reformulation**, qui appelle déjà Mistral :
  `pipeline/reformulation/editeur.ts` (interface adaptateur + transport),
  `editeur-mistral.ts` (`texteDuChat`, `adaptateurMistral`), `transport-fetch.ts`,
  `editeur-simule.ts`, `configuration.ts` (réglages sans valeur par défaut, clé inconnue ou répétée
  refusée), `prompt.ts` (rendu du bloc ```text, un seul passage). Le socle commun est
  `pipeline/interrogation/editeur.ts` (`RequeteHttp`, `ReponseHttp`, `Transport`, `Contenu`,
  `lireContenu`, `ErreurReseau`). **Réutilise** ce qui existe par import (transport, `Contenu`,
  `premiereCleDupliquee`, la mécanique de `suivre`). Ne modifie pas `pipeline/reformulation/` ;
  si un morceau doit être partagé et ne s'importe pas proprement, arrête-toi et signale-le au lieu
  de le déplacer.
- **Le cœur de la PR 1** est dans `pipeline/extraction/` (lis `extraction.ts`, `configuration.ts`,
  `lecture-sortie.ts`, `types.ts`). Il prend les sorties brutes des deux modèles comme chaînes, dans
  une `ReadonlyMap<modele, string>`. Ce que tu écris ici produit exactement ces chaînes : **le texte
  du modèle, tel quel**, sans retirer de bloc Markdown ni d'espace (règle 7). Toute validation du
  JSON appartient au cœur (`lireSortie`) : ne la duplique pas.
- **API Anthropic (Messages), vérifiée sur la documentation de l'éditeur le 2026-10-16 :**
  - `POST https://api.anthropic.com/v1/messages`, en-têtes `x-api-key: <clé>`,
    `anthropic-version: 2023-06-01`, `content-type: application/json`.
  - Corps : `{model, max_tokens, messages: [{role: "user", content: <prompt rendu>}],
    output_config: {effort}}`. Le prompt est le seul message, sans `system`.
  - **N'envoie pas `temperature`, `top_p` ni `top_k`** : sur Claude Sonnet 5.5, une valeur autre
    que celle par défaut est refusée en 400. Il n'y a pas de graine. **N'envoie pas `thinking`** :
    le mode adaptatif s'applique par défaut, et `{type:"disabled"}` est refusé en 400.
  - **N'envoie pas `fallbacks`** ni d'en-tête `anthropic-beta`. Un repli côté serveur ferait
    répondre un autre modèle sous le même appel, alors que l'identifiant du modèle est la donnée
    mesurée (D52). Écris-le dans l'en-tête du fichier.
  - Réponse : `content` est une liste de blocs typés. Elle peut commencer par des blocs `thinking`
    au texte vide, qui restent dans le corps brut et sont ignorés pour la lecture. Le texte du modèle
    est le champ `text` de **l'unique** bloc `type: "text"`. Aucun bloc texte, ou plusieurs ⇒ pas
    lisible, avec la raison. **Jamais de concaténation.**
  - `stop_reason` doit valoir `end_turn`. `max_tokens` (sortie coupée), `refusal` (refus, avec
    `stop_details`), `pause_turn`, ou absent ⇒ pas lisible. La raison nomme la valeur reçue ; le
    corps reste tel quel.
- **Mistral** : même requête que `adaptateurMistral` (`model`, `messages`, `temperature`,
  `max_tokens`, `random_seed`), mais avec les réglages de la configuration d'extraction, pas de
  reformulation. À la lecture, ajoute ce que la reformulation ne vérifie pas :
  `choices[0].finish_reason` doit valoir `stop`. Toute autre valeur, `length` comprise, ⇒ pas
  lisible, raison nommée. Fais-le dans un lecteur propre à l'extraction qui réutilise `texteDuChat`,
  sans toucher à `editeur-mistral.ts`.
- **Configuration `config/extraction.json`** (nouveau fichier, rempli à la main par l'auteur). Les
  deux extracteurs y figurent **dans l'ordre** D52 (3), chacun avec `editeur` (`"anthropic"` ou
  `"mistral"`) et ses réglages. Tous les réglages valent `null` dans le fichier livré, avec un
  `$commentaire` qui explique chaque clé, comme `config/reformulation.json` : l'auteur épingle les
  identifiants exacts avant le premier appel réel.
  - Anthropic : `modele`, `max_tokens`, `effort`
    (`low|medium|high|xhigh|max`), `delai_abandon_ms`.
  - Mistral : `modele`, `temperature`, `max_tokens`, `random_seed`, `delai_abandon_ms`.
  - Ordre livré : Anthropic puis Mistral, dans l'ordre du texte de D52. Signale dans ton rapport que
    cet ordre fixe le modèle dont les champs sont gardés, et que l'auteur le confirme.
  - Validation en TypeScript, comme `pipeline/reformulation/configuration.ts` : clé obligatoire,
    non nulle, de la forme dite ; clé inconnue ou répétée refusée ; chaque refus nomme le chemin
    (`extracteurs[1].temperature`). Un `editeur` inconnu ⇒ refus. Deux `modele` identiques ⇒ refus
    (réutilise `exigerConfiguration` du cœur). Le chargement rend une `ConfigurationExtraction` du
    cœur (ordre conservé) plus les réglages de chaque éditeur.
  - Le choix d'un adaptateur se fait par une **table** `editeur → fabrique`, jamais par un `if` sur
    un nom de modèle.
- **Rendu du prompt** : `pipeline/extraction/prompt.ts`, sur le modèle de
  `pipeline/reformulation/prompt.ts`. Le texte envoyé est exactement le bloc ```text du prompt, avec
  quatre variables remplacées en un seul passage : `{candidat_id}`, `{type_document}`, `{format}`,
  `{texte_canonique}`. Toute autre accolade est du texte. Une variable absente ou vide ⇒ refus. Le
  texte canonique est inséré **entier et non modifié**, même s'il contient `{candidat_id}` ou des
  accolades. La version exportée vaut `prompts/extraction-1.0.0`. **Ne modifie pas le prompt**, même
  son en-tête « à relire » : il a été relu (D35).
- **Éditeur simulé** : `pipeline/extraction/editeur-simule.ts`, sans réseau, pour les tests et pour
  le futur `pnpm extraire --simule` (PR 3).
  - Deux adaptateurs simulés aux identifiants **distincts**, marqués comme simulés (préfixe
    `simule/`, à la manière de `MODELE_SIMULE`), pour qu'aucune sortie ne passe pour celle d'un
    modèle réel. L'un imite l'enveloppe Anthropic, l'autre l'enveloppe Mistral : chaque enveloppe
    est lue par **le même lecteur** que l'adaptateur réel correspondant.
  - Issues déterministes, choisies par empreinte de la demande ou par une fonction injectée, comme
    dans la reformulation :
    - sortie conforme : `{"items": [...]}` dont les citations sont des **sous-chaînes du texte
      canonique reçu**, pour passer le test verbatim. Le contenu est une marque de simulation, jamais
      une affirmation plausible sur un candidat ;
    - `{"items": []}` ;
    - JSON entouré d'un bloc de code ;
    - 500 ;
    - 200 dont le corps n'est pas du JSON ;
    - sortie coupée (`max_tokens` côté Anthropic, `length` côté Mistral) ;
    - refus (`refusal`, Anthropic seulement).
  - Le transport simulé garde les requêtes reçues, comme `TransportSimule`.
- **Pas d'exécution ici** : aucune boucle d'appels, aucun délai d'abandon appliqué, aucune écriture
  disque. Ce qui existe à la fin, ce sont des adaptateurs (`construireRequete`, `texteDuModele`), le
  rendu, la configuration et le simulé, assemblables par la PR 3. Si tu juges qu'un petit
  `appelerExtracteur(editeur, prompt, signal)` rendant `{reponse brute, lecture}` est nécessaire pour
  tester l'assemblage de bout en bout avec le simulé, tu peux l'écrire, pur, sans disque. Dis-le.

## Fichiers

- À lire d'abord : `CLAUDE.md` ; `docs/feuille-de-route.json` (D52, D53) ; `pipeline/reformulation/`
  (fichiers cités) ; `pipeline/interrogation/editeur.ts` ; `pipeline/extraction/` ;
  `prompts/extraction-1.0.0.md` ; `config/reformulation.json` ; `docs/DETTE.md` (entrées du lot
  extraction).
- À créer : `pipeline/extraction/editeur.ts`, `editeur-anthropic.ts`, `editeur-mistral.ts`,
  `editeur-simule.ts`, `configuration-editeurs.ts` (ou un nom meilleur, tant qu'il reste dans
  `pipeline/extraction/`), `prompt.ts` ; `config/extraction.json` ; les tests à côté des tests
  existants du cœur (même convention).
- À modifier : `docs/DETTE.md` seulement si tu laisses un point ouvert (entrée datée du 2026-10-16,
  lot extraction, PR 2).
- À ne pas toucher : `pipeline/reformulation/`, `pipeline/interrogation/`, `validation/`, `schema/`,
  `prompts/`, `data/`, `config/perimetre.yaml`, `docs/PROTOCOLE.md`, `package.json` (aucune
  dépendance, aucun script : `pnpm extraire` est en PR 3).

## Contraintes du protocole applicables

- Règle 6 : « Aucun prompt en dur dans le code. Tout vit dans `prompts/`. »
- Règle 7 : « Ce qu'un outil a répondu est stocké tel quel, jamais nettoyé, tronqué, reformaté ni
  corrigé. » Le texte rendu par un adaptateur est exactement la chaîne de l'enveloppe.
- `CLAUDE.md` : aucune valeur par défaut silencieuse (`?? 0`, `catch {}`, `|| "inconnu"`). Aucun
  `if` sur un modèle ou un éditeur : une table.
- Clé d'API : jamais dans un message d'erreur, un journal ou un objet enregistré. Une clé vide ⇒
  refus avant toute requête (comme `adaptateurMistral`).
- Aucun test n'appelle le réseau.
- Complexité : cyclomatique ≤ 9, cognitive < 15, sans désactivation du linter.

## Cas limites à tester

1. Requête Anthropic : en-têtes exacts. Le corps ne contient ni `temperature`, ni `thinking`, ni
   `fallbacks`, ni `system` (test qui liste les clés du corps). Clé vide ⇒ refus.
2. Lecture Anthropic : un bloc `thinking` puis un bloc `text` ⇒ le texte exact. Zéro bloc texte ;
   deux blocs texte ; `text` non chaîne ; `content` absent ou non liste ⇒ pas lisible, raison nommée.
3. `stop_reason` vaut `max_tokens`, `refusal` (avec `stop_details`), `pause_turn`, ou est absent ⇒
   pas lisible, la raison nomme la valeur.
4. Lecture Mistral : `finish_reason` vaut `stop` ⇒ texte ; `length` ⇒ pas lisible ; absent ⇒ pas
   lisible. Les cas de `texteDuChat` restent couverts (`content` nul, liste de morceaux).
5. Texte du modèle avec bloc ```json, espaces en tête ou en fin, CRLF ⇒ rendu **tel quel**, octet
   pour octet.
6. Corps 2xx non JSON ⇒ pas lisible, pour les deux éditeurs.
7. Configuration : fichier livré (tout `null`) ⇒ refusé, chaque clé nommée ; clé inconnue ; clé
   répétée ; `editeur` inconnu ; `effort` hors énumération ; deux `modele` identiques ; un seul
   extracteur ou trois ⇒ refus nommé. Configuration complète ⇒ ordre conservé.
8. Rendu : les quatre variables remplacées ; variable vide ⇒ refus ; texte canonique contenant
   `{candidat_id}`, des accolades, U+000C, un emoji ⇒ inséré tel quel, sans seconde substitution ;
   accolades des exemples JSON du prompt intactes.
9. Simulé : chaque issue est lue par le lecteur réel de son enveloppe et donne la lecture attendue.
   La sortie conforme, passée avec le texte au cœur `pipeline/extraction/extraction.ts`, produit des
   items qui passent le test verbatim. La même demande donne la même issue.
10. Assemblage : la table `editeur → fabrique` construit le bon adaptateur pour chaque entrée de la
    configuration. Les identifiants de modèle de la `ConfigurationExtraction` rendue suivent l'ordre
    du fichier.

## Ce qui ne doit pas bouger

Tout le code de la PR 1 (`pipeline/extraction/*` existant) et ses tests. `pipeline/reformulation/`,
`pipeline/interrogation/`. Tous les tests existants restent verts, sans changement d'assertion.

## Définition de terminé

- `pnpm check && pnpm test` passent, lancés par toi.
- Chaque cas limite ci-dessus a un test nommé.
- Rien d'écrit hors des fichiers listés.
- Commit sur `lots/extraction-editeurs`, **sans push**. Message en français, se terminant par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rapport, dans cet ordre :
  1. ce qui existe ;
  2. les points où tu t'es arrêté ou que tu as tranchés seul, avec ta proposition (ordre de la
     configuration, partage de code avec la reformulation, `appelerExtracteur`) ;
  3. ce que la PR 3 doit savoir pour assembler ;
  4. ce qui pourrait casser plus tard, en deux lignes.

## Questions déjà tranchées

- Fetch, sans SDK, sans dépendance : D52 (1), décision de l'auteur.
- Pas de `temperature` ni de `thinking` côté Anthropic, pas de repli de modèle : voir plus haut.
- Une lecture impossible n'est jamais réparée. Au niveau de la source, elle donne le refus de D53 (2)
  dans la PR 3 : ne le code pas ici.
- Le prompt est figé en 1.0.0 : n'y touche pas.
