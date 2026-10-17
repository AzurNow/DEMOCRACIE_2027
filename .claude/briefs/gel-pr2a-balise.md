# Brief — lot gel, PR 2a : balise drand, identifiant dérivé, engagement archivé

## Agent

`codeur-opus`, isolation `worktree`, branche `lots/gel-balise` à partir de `main`.

## Objectif

`pnpm geler` obtient ses cinq graines **et** l'identifiant du run d'une balise drand quicknet lue sur
deux relais. Il refuse de geler un commit que l'auteur n'a pas fait archiver avant `date_gel`
(D46). Il inscrit dans `run.json` de quoi tout recalculer : la balise, les clés de dérivation,
l'archive de l'engagement, l'empreinte du protocole. Tout le réseau passe par des ports. Les tests
n'emploient que des adaptateurs de fixture, jamais le réseau.

## Contexte que tu ne peux pas deviner

- **`docs/PROTOCOLE.md` fait autorité** (0.16) : relis le §5, « Tirage ». `CLAUDE.md` : huit règles.
  La PR 1 (#127) a livré `pipeline/gel/` (lis tout l'en-tête de `geler.ts`, `assemblage.ts`,
  `graines.ts`) et `outils/geler.ts`. Le port `SourceDeGraines` existe ; la commande exige
  aujourd'hui `--graines-fixes`.
- **D44** (`docs/feuille-de-route.json`), retenue sur les quatre points :
  - chaîne **quicknet**. Empreinte `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`,
    genèse 1692803367 (s), période 3 s, chaîne non liée (`unchained`). Ces valeurs sont épinglées
    dans le code **et** vérifiées contre `/<empreinte>/info` de chaque relais au gel : un écart
    ⇒ refus. Le tour retenu est le **premier tour émis à `date_gel` ou après**,
    `r = ⌈(date_gel − genèse) / 3⌉ + 1`, le tour r étant émis à genèse + (r − 1) × 3. Écris ce
    calcul en fonction pure et teste-le sur une frontière exacte ;
  - deux relais indépendants, `https://api.drand.sh` et `https://drand.cloudflare.com`. Lis
    `/<empreinte>/public/<r>` sur les deux. Les deux réponses doivent avoir le même tour et la même
    signature, sinon refus. Un relais injoignable ⇒ refus, aucun repli sur un relais unique ;
  - **aléa = SHA-256(octets de la signature)**, recalculé par nous. Le champ `randomness` du relais
    doit lui être égal, sinon refus ;
  - **graine(clé) = les 8 premiers octets gros-boutistes de SHA-256(aléa en hexadécimal minuscule ‖
    U+0000 ‖ clé), décalés de 11 bits vers la droite** (donc dans [0, 2^53 − 1]). Les clés sont les
    noms de `NOMS_GRAINES` (`tirage`, `echantillon_humain`, `bootstrap`, `permutation`,
    `contrefactuel`). Encodage UTF-8 ;
  - pas de vérification BLS au gel, aucune dépendance. La vérification par un tiers est documentée
    (procédure dans `runs/README.md` : quelle commande `drand` ou quel outil public, sur quels
    champs archivés).
- **D45 (1)** : l'ULID du run a pour horodatage `date_gel` (en ms) et pour partie aléatoire
  **les 80 premiers bits de SHA-256(aléa hex ‖ U+0000 ‖ « run_id »)**, en base 32 de Crockford.
  C'est la règle des graines appliquée à 10 octets au lieu de 8 : signale-le dans ton rapport, car
  le protocole devra l'écrire. But : deux gels du même commit donnent `run.json`, `tirage.json` et
  `questions.json` identiques octet pour octet (`tirage.ts:amorce` lit `run.id`). Mets à jour le
  cas 11 de `tests/gel/geler.test.ts` en ce sens, assertion **renforcée** (les trois fichiers),
  jamais affaiblie. `validation/domaine/ulid.ts` a l'encodeur. Ajoute une fonction qui prend
  l'horodatage et les 10 octets ; le `ulid()` existant ne change pas de comportement.
- **D46** (2026-10-16, sur la branche de #129, pas encore dans `main`). Avant `date_gel`, l'auteur
  pousse le commit à geler et fait capturer par la Wayback Machine la page
  `https://github.com/AzurNow/DEMOCRACIE_2027/commit/<sha>`. Au gel :
  - `config/gel.json` reçoit un champ `engagement` (URL de la capture, valeur `null` livrée, refus
    nommé tant qu'elle est `null`, comme les autres champs) ;
  - le gel vérifie que l'URL désigne bien `web.archive.org/web/<horodatage>/…/commit/<HEAD complet>`,
    que l'horodatage de capture (14 chiffres, UTC) est **strictement antérieur** à `date_gel`, et que
    Wayback sert cette capture (un appel par un port, réponse 200 sur l'URL exacte ou via l'API
    `available`, à toi de choisir et de justifier ; lis `pipeline/liens/instantanes.py` pour les
    conventions déjà employées). Tout écart ⇒ refus nommé, rien écrit ;
  - l'URL et l'horodatage s'inscrivent dans `run.json`.
- **Ordre** : engagement d'abord (pas cher, et il exige que `date_gel` soit passée pour avoir un
  sens), balise ensuite. Si `date_gel` est dans le futur, le tour n'existe pas encore : refus nommé
  sans appel réseau. Le refus général « gel avant `date_gel` » (D45 (4)) est la PR 2b. Ici, ne
  traite que ce que la balise exige.
- **Archive de la balise** : la réponse brute de chaque relais est conservée telle que reçue (octets
  exacts, règle 7) dans `runs/<date>/balise/<relais>.json`, écrite **dans le même tout-ou-rien**
  que les trois fichiers (`ecriture.ts`). `run.json` porte : chaîne (empreinte, genèse, période),
  tour, signature, aléa recalculé, relais lus avec le SHA-256 de chaque réponse archivée, clé de
  chaque graine. Mets `runs/README.md` à jour.
- **Schéma `run`** : aucun champ n'accueille aujourd'hui la balise, les clés ni l'engagement. Ajoute
  un objet `balise` et un objet `engagement`, **obligatoires pour tout run** sauf `type_run` pilote si
  le schéma permet de le dire proprement (sinon obligatoires pour tous, et dis-le). Exemples
  valides et invalides dans `schema/exemples/`, manifeste mis à jour. Vérifie qu'aucun run existant
  sous `runs/` ou `schema/exemples/` ne devient invalide sans que tu le dises.
- **`versions.protocole_sha256`** existe dans le schéma, mais le gel ne le remplit pas : remplis-le
  avec le SHA-256 des octets de `docs/PROTOCOLE.md` **au commit gelé** (le dépôt est propre, donc
  le fichier sur disque fait foi).
- `--graines-fixes` disparaît de la commande réelle. Les tests injectent un adaptateur de fixture
  (réponses de relais enregistrées). Quicknet signe sur G1 : **signature de 48 octets** (96
  caractères hex). Vecteur réel, lu le 2026-10-16 sur `drand.cloudflare.com`, à prendre comme
  fixture et pour vérifier « aléa = SHA-256(signature) » :
  `{"round":1000,"signature":"b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39","randomness":"fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd"}`.
  `/info` répond aussi `schemeID: "bls-unchained-g1-rfc9380"` et `metadata.beaconID: "quicknet"` :
  épingle et vérifie le `schemeID`. Aucun test ne touche le réseau. Les deux
  adaptateurs réels (relais, Wayback) restent minces, sans logique, avec `fetch` injecté comme
  dans `outils/reformuler.ts`.

## Fichiers

- À lire d'abord : `CLAUDE.md`, `pipeline/gel/*.ts`, `outils/geler.ts`, `tests/gel/`,
  `schema/run.schema.json` (`versions`, `graines`, `$defs/graine`), `schema/config-gel.schema.json`,
  `config/gel.json`, `validation/domaine/ulid.ts`, `pipeline/questions/tirage.ts` (`amorce`),
  `analysis/graines.ts`, `outils/reformuler.ts` (port réseau), `runs/README.md`.
- À créer : `pipeline/gel/balise.ts` (logique pure : tour, vérifications, dérivations),
  `pipeline/gel/engagement.ts`, adaptateurs réseau minces (`outils/` ou `pipeline/gel/`, cohérent
  avec l'existant), tests sous `tests/gel/`.
- À modifier : `pipeline/gel/geler.ts`, `assemblage.ts`, `graines.ts`, `ecriture.ts` si nécessaire,
  `outils/geler.ts`, `validation/domaine/ulid.ts` (ajout), `schema/run.schema.json`,
  `schema/config-gel.schema.json`, `config/gel.json` (champ `engagement: null`),
  `schema/exemples/`, `runs/README.md`.
- À ne pas toucher : `data/`, `docs/PROTOCOLE.md`, `prompts/`, `config/perimetre.yaml`,
  `docs/feuille-de-route.json`, `pipeline/interrogation/`, `outils/run-dry.ts`, statuts du run.

## Contraintes du protocole applicables

- §5 : « au premier tour émis à l'instant de gel ou après. La réponse signée de la balise est
  archivée avec le run ; chacune des graines publiées […] en est dérivée par une clé lisible,
  publiée avec elle. Nul, l'auteur compris, ne peut connaître une graine avant le gel, et chacun
  peut la recalculer. »
- Règle 7 : réponses des relais archivées telles quelles. Règle 3 : rien dans `data/`.
- Aucune valeur par défaut silencieuse ; aucun repli silencieux d'un relais à l'autre.
- Nouvel appel réseau : seulement ceux de D44 et D46 (deux relais drand, Wayback). Aucun autre.
- Complexité : cyclomatique ≤ 9, cognitive < 15 ; compétence `complexite-maitrisee`.

## Cas limites à tester

1. Tour : `date_gel` exactement sur l'émission d'un tour ⇒ ce tour ; 1 ms après ⇒ le suivant.
2. Dérivation : un vecteur calculé à la main dans le test (aléa connu ⇒ cinq graines et partie
   aléatoire de l'ULID attendues), et la borne 2^53 − 1 tenue.
3. Les deux relais diffèrent (signature ou tour) ⇒ refus, rien écrit.
4. Un relais injoignable ou en erreur HTTP ⇒ refus, rien écrit, l'autre n'est pas retenu seul.
5. `randomness` du relais ≠ SHA-256(signature) ⇒ refus.
6. `/info` d'un relais : empreinte, genèse ou période différente de l'épinglée ⇒ refus.
7. `date_gel` dans le futur ⇒ refus avant tout appel réseau (le port n'est pas appelé).
8. `engagement` `null` ⇒ refus nommant le champ ; URL d'un autre commit que HEAD ⇒ refus ;
   horodatage de capture égal à `date_gel` ou postérieur ⇒ refus ; Wayback ne sert pas la capture
   ⇒ refus.
9. Deux gels du même commit et de la même balise vers deux sorties ⇒ les trois fichiers et les
   archives de balise identiques octet pour octet (cas 11 renforcé).
10. Échec à l'écriture d'une archive de balise ⇒ aucun fichier ne reste (tout ou rien).
11. `run.json` produit passe le schéma et `pnpm symmetry` (bout en bout existant, étendu).
12. `versions.protocole_sha256` = SHA-256 de `docs/PROTOCOLE.md` du dépôt de fixture.

## Ce qui ne doit pas bouger

- `pnpm symmetry` : comportement et codes de sortie inchangés.
- Aucune assertion affaiblie : `git diff` filtré sur `expect` ne montre que des ajouts ou des
  renforcements, et tu justifies chaque ligne retirée.
- `ulid()` existant ; `analysis/graines.ts` ; `pnpm run:dry` passe toujours.

## Définition de terminé

- `pnpm check && pnpm test` et `pnpm run:dry` passent, lancés par toi.
- Chaque cas limite a un test nommé. Aucune dépendance ajoutée.
- Un commit sur `lots/gel-balise`, en français, terminé par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ne pousse pas, n'ouvre pas de PR.
- Rapport : ce qui est fait, écarts au brief et pourquoi, trous du protocole (au moins : règle de
  l'ULID, champs du schéma), et en deux lignes ce qui pourrait casser plus tard.

## Questions déjà tranchées

- Chaîne, relais, aléa, dérivation : D44 option 1. ULID : D45 (1). Engagement archivé : D46.
- Pas de BLS au gel. Pas de relais unique. Pas de `--graines-fixes` en production.
- Si le protocole ou un schéma contredit ce brief : arrête-toi sur ce point, ne l'invente pas,
  dis-le, et continue le reste.
