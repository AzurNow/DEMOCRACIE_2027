# Extraire, tracer, trier

## Ce qui est une exigence

Une exigence est une phrase du protocole dont on peut dire, en lisant le code et les tests, si elle
est respectée. Le test : *peut-on imaginer un code qui la viole ?* Si non, ce n'est pas une
exigence.

| Est une exigence | N'en est pas une |
| --- | --- |
| « Le pipeline refuse de lancer un run si l'une de ces conditions échoue » (§5) | « C'est l'ordre méthode publique, puis mesures, qui rend le résultat crédible » (§1) |
| « Kappa à trois catégories ; un kappa indéfini est publié absent » (§4) | Une hypothèse de recherche (§2) |
| « Un item T3 est conservé avec le statut à confirmer et n'engendre aucune question » (§4) | Une limite reconnue (§11), sauf si elle fixe un comportement |
| Un seuil, un effectif, un quota, une date de validité, une graine | Un jalon de calendrier (§12) — tracé dans la feuille de route, pas ici |

Une phrase qui contient plusieurs obligations donne plusieurs exigences, une par obligation
vérifiable séparément. Les tableaux et annexes (gabarits, réponses attendues) sont des exigences
ligne par ligne.

**Nature** de chaque exigence (champ `nature` de la matrice) :
- `code` — un comportement du code (le tirage, la symétrie, le verbatim, une métrique) ;
- `donnee` — une forme ou un champ que les schémas doivent imposer ;
- `processus` — une étape humaine outillée (validation, contestation, publication) : on trace
  l'outil qui la rend possible et le garde-fou qui empêche de la contourner ;
- `hors-code` — avocat, Zenodo, institutions, annotateurs : noté pour mémoire, jamais un constat.

## Identifiants

`§<section>.<rang>`, le rang croissant dans l'ordre du texte à la **première** extraction :
`§5.07`. Pour une annexe : `A.<rang>`, `B.<rang>`. Un identifiant ne se réattribue jamais : une
exigence supprimée du protocole passe à `retiree` et garde son identifiant ; une exigence insérée
entre deux autres prend le rang libre suivant de sa section. L'ordre des rangs cesse alors de suivre
le texte, et c'est voulu : la stabilité vaut plus que l'ordre.

## Tracer

Pour chaque exigence de nature `code` ou `donnee` :
1. **Chercher les mots du protocole** dans le code (`grep -rn` sur le terme, le numéro de section,
   le nom du concept) puis **lire** l'endroit trouvé. Une docstring « §5 » oriente, elle ne prouve
   rien.
2. **Noter chaque emplacement** qui applique l'exigence (`fichier:ligne` et nom de fonction). Une
   exigence appliquée à deux endroits est un signal de règle dupliquée : le noter.
3. **Chercher le test** qui échouerait si l'exigence était violée. Le nommer par fichier et intitulé
   du test. Un schéma qui impose une forme, avec un exemple invalide qui la viole dans
   `schema/exemples/`, compte comme test.
4. **Comparer le détail**, pas seulement l'existence : bornes incluses ou exclues, arrondis, dates
   « avant » ou « au plus tard », ordre de tri, traitement de l'absent. C'est là que vivent les
   contradictions.

## Sens inverse : les règles non écrites

Parcourir le code de mesure et relever chaque **règle qui change un nombre publié**, puis chercher la
phrase du protocole qui la fonde. Si aucune ne la fonde, c'est un constat « règle non écrite ».
Familles à chercher systématiquement :
- **constantes** : seuils, quotas, tailles d'échantillon, nombres de relances, fenêtres de temps,
  graines et leur dérivation ;
- **ordres et départages** : tri stable ou non, ordre de lecture d'un répertoire, départage des
  égalités, ordre de tirage ;
- **traitement de l'absent** : réponse manquante, item sans décision, kappa indéfini, lien mort,
  transcription vide — exclu, compté, publié absent ?
- **dates** : bornes incluses ou exclues, fuseau, date de référence (gel, run, source) ;
- **paramètres d'outils externes** qui changent une donnée : extraction PDF, règle HTML, décodage
  Whisper, normalisation Unicode ;
- **choix de modélisation** fixés dans `schema/` sans phrase du protocole.

Une règle non écrite déjà consignée ailleurs (`docs/DETTE.md`, fin de `schema/README.md`,
`docs/CONTRATS.md`) reste un constat tant que le protocole ne l'écrit pas ou que l'auteur ne l'a pas
acceptée par écrit — mais le rapport cite l'endroit où elle est déjà connue. `docs/CONTRATS.md` fait
partie du protocole (§4, contrat des artefacts) : une règle écrite dans les contrats est écrite.

## Trier un constat

Gravité, à l'aune de `docs/DETTE.md` : *un lecteur du site pourrait-il lire un nombre faux sans que
rien ne l'ait signalé ?*

- **haute** — le code **contredit** une exigence qui touche une mesure publiée, ou applique une
  règle non écrite qui change un nombre publié sans qu'un lecteur du protocole puisse la deviner.
- **moyenne** — exigence de mesure implémentée **sans test** ; règle non écrite qui ne change un
  nombre qu'en cas limite ; contradiction sur un processus (validation, contestation) outillé.
- **basse** — écart de vocabulaire (le code et le protocole nomment différemment le même concept),
  référence de section périmée dans une docstring, exigence de donnée gardée par le code mais pas
  par le schéma.

Proposition, une seule par constat :
- **corriger le code** — le protocole est clair et le code s'en écarte ;
- **réviser le protocole** (avant gel) ou **l'amender** (après gel, §9) — le code a fixé une règle
  raisonnable que le texte n'écrit pas ou écrit autrement. Le rapport propose le texte ;
- **accepter** — l'écart est sans effet sur une mesure et l'écrire coûterait plus qu'il ne protège.
  Écrire pourquoi : la passe suivante ne le re-signale pas.

Le choix final appartient à l'auteur. La passe propose, elle ne tranche pas.

## Faux constats fréquents

| Tentant d'écrire | Ce que c'est vraiment |
| --- | --- |
| « Le lot notation n'implémente pas le §7 » | Rien : `a-implementer`, lot `notation`. |
| « Le protocole devrait plutôt dire… » | Un avis de méthode. Hors périmètre, sauf si le code a déjà tranché autrement. |
| « Cette fonction n'a pas de commentaire citant le § » | Un défaut de lisibilité, pour `revue-de-code`. |
| « L'exigence est implémentée » sans fichier ni ligne | Un souvenir. Aller lire. |
