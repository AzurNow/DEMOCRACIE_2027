# Prompt d'extraction — version 1.0.0

| Champ | Valeur |
| --- | --- |
| Version | `prompts/extraction-1.0.0` |
| Date | 2026-10-09 |
| Statut | Proposé, à relire par l'auteur avant tout usage réel |
| Protocole appliqué | §3 (dix thèmes, exclusions explicites) ; §4 (définition d'un item, types P et O, hiérarchie T1/T2/T3, position explicite sans inférence, citation verbatim et page comptée comme rang dans le fichier, test verbatim déterministe, contrat des artefacts) ; règles 3, 5 et 6 de `CLAUDE.md` |
| Contrat d'entrée | Texte canonique d'**une** source, `docs/CONTRATS.md` §1 (UTF-8, NFC, LF ; pages d'un PDF jointes par `\f`, U+000C) |
| Modèles | Deux modèles de familles différentes reçoivent **ce même texte** (§4, extraction double) ; leurs sorties sont comparées par le code, jamais par un modèle |

## Variables d'entrée

Remplacées telles quelles, sans échappement ni reformatage, par le code qui appelle le modèle. Seuls
ces quatre noms entre accolades sont des variables ; toute autre accolade du texte (les objets JSON
de la sortie et de l'exemple) est du texte et reste telle quelle. Une variable absente ou vide
refuse l'appel : aucune valeur par défaut.

| Variable | Origine | Valeurs |
| --- | --- | --- |
| `{candidat_id}` | fiche de source, `candidat_id` (`docs/CONTRATS.md` §5.5) | `commun#/$defs/identifiant_court` |
| `{type_document}` | fiche de source, `type_document` | énumération de `commun#/$defs/source/properties/type_document` |
| `{format}` | `source.format`, relevé par la collecte | `pdf`, `html`, `audio`, `video` |
| `{texte_canonique}` | `staging/textes/<texte_sha256>.txt`, entier et non modifié | texte |

## Sortie attendue

Un seul objet JSON, sans texte autour, sans bloc de code Markdown :

```json
{
  "items": [
    {
      "type": "P",
      "candidat_id": "…",
      "mesure_proposee": { "libelle": "…", "theme": "…" },
      "position": "pour",
      "citation_verbatim": "…",
      "page": 1,
      "paraphrase": "…",
      "quantification": { "dimensions": [ { "type": "taux", "valeur": 0, "unite": "%", "operateur": "exact" } ] }
    }
  ]
}
```

- `type` : `P` ou `O` seulement.
- `candidat_id` : recopie exacte de `{candidat_id}`.
- `mesure_proposee.libelle` : proposition de libellé de mesure (`mesure.schema.json#/properties/libelle`) ;
  `mesure_proposee.theme` : un code de `commun#/$defs/theme`. Le thème appartient à la mesure, pas à
  l'item (annexe A) : c'est une proposition, que la validation humaine rattache à une mesure.
- `position` : `pour`, `contre` ou `conditionnel` (`commun#/$defs/position`, `sans_objet` exclu : il
  est réservé aux types A et F, qui ne s'extraient pas).
- `citation_verbatim` : `item#/$defs/etat_positionnel/properties/citation_verbatim`.
- `page` : présent si et seulement si `{format}` vaut `pdf`.
- `paraphrase` : `item#/$defs/etat_positionnel/properties/paraphrase`.
- `quantification` : facultatif, forme de `commun#/$defs/quantification`.

Le code ajoute ensuite, sans le modèle : le test verbatim et ses offsets, la page recalculée depuis
les offsets et `pages` de la fiche d'extraction (`docs/CONTRATS.md` §1.1), l'horodatage d'une
source audio ou vidéo depuis le cue qui contient la citation (§2), la source archivée, les dates, la
version de ce prompt et les modèles. Une sortie qui n'est pas un JSON conforme est rejetée en
entier, jamais réparée.

## Ce que ce prompt ne fait pas

- **Les types A et F ne s'extraient pas d'une source.** Un item A constate l'**absence** de position
  dans tout le corpus T1 et T2 d'un candidat ; un item F est une mesure qu'**aucun** candidat ne
  propose. Ni l'un ni l'autre ne peut se lire dans un texte : ils se construisent à la main, avec
  la recherche dans les corpus que le §4 et le §5 décrivent.
- **Un item O n'est pas complet depuis une seule source.** Il a deux états sourcés (§4). Ce prompt
  ne propose que l'état que la source établit elle-même quand elle déclare explicitement un
  changement ; l'état antérieur est rapproché depuis une autre source, hors de ce prompt.
- Aucune décision de tier, de date, de validation ni de rattachement à une mesure existante.

## Texte du prompt

Tout ce qui figure entre les deux lignes de clôture ci-dessous est envoyé au modèle, variables
remplacées.

```text
Tu extrais des positions politiques d'un document. Tu ne rédiges rien, tu ne complètes rien, tu ne corriges rien : tu repères ce que le document dit explicitement et tu le recopies.

DOCUMENT
- Identifiant du candidat auquel la source est rattachée : {candidat_id}
- Type de document : {type_document}
- Format : {format}
- Texte canonique, entre les deux marqueurs :
<<<DEBUT_TEXTE
{texte_canonique}
FIN_TEXTE>>>

CE QU'EST UN ITEM
Un item est une position atomique du candidat : une seule proposition, attribuable au candidat, vérifiable, accompagnée d'une citation recopiée du texte.
- Atomique : une seule mesure par item. Une phrase qui porte deux mesures donne deux items ; ils peuvent partager la même citation.
- Attribuable : la position est celle du candidat ou de sa campagne, dite en son nom. Ce que le document rapporte d'autres personnes (adversaires, journalistes, experts, citations de tiers) n'est pas extrait. Dans une transcription orale, où les interlocuteurs ne sont pas nommés, n'extrais que ce qui est sans ambiguïté dit par le candidat lui-même ; au moindre doute sur qui parle, n'extrais pas.
- Explicite : le texte énonce la position. Rien n'est inféré d'une allusion, d'un sous-entendu, d'un ton, d'une critique ou d'un diagnostic. « La situation des hôpitaux est inacceptable » n'est pas une position ; « nous recruterons des infirmiers » en est une.
- Vérifiable : la mesure est assez précise pour qu'on puisse dire si quelqu'un d'autre la propose ou non. Une intention générale (« agir pour l'école », « une France plus juste ») n'est pas une mesure.

TYPES
- "P" : le candidat propose ou défend explicitement une mesure, ou s'y oppose explicitement.
- "O" : le texte déclare lui-même, explicitement, que le candidat a modifié ou retiré une position qu'il avait auparavant (par exemple « nous avons renoncé à… », « nous ne proposons plus… », « contrairement à ce que nous annoncions… »). Tu ne proposes que la position nouvelle, telle que ce texte l'établit. Ne propose jamais "O" parce que tu crois savoir qu'une position a changé : seul le texte compte.
- Tu ne produis jamais d'autre type.

POSITION, relative à la mesure telle que tu la libelles
- "pour" : le candidat propose, promet ou défend la mesure.
- "contre" : le candidat s'oppose explicitement à la mesure, refuse de la faire ou annonce sa suppression.
- "conditionnel" : le candidat lie explicitement la mesure à une condition (« si…, alors… », « à condition que… »).
Libelle la mesure sous forme affirmative (« Instaurer… », « Supprimer… », « Abaisser… ») et exprime le refus par la position "contre", plutôt que d'écrire une mesure négative avec la position "pour".

THÈMES : exactement l'un de ces dix codes, celui de la mesure.
fiscalite_pouvoir_achat ; retraites ; travail_emploi ; sante ; education ; securite_justice ; immigration ; ecologie_energie ; institutions_democratie ; europe_defense_international.

HORS PÉRIMÈTRE : n'extrais rien de ce qui suit.
- Une position qui ne relève d'aucun des dix thèmes.
- Les opinions et jugements de valeur, les appréciations de faisabilité, le chiffrage du coût d'un programme ou d'une mesure. (Le montant, le taux, la date ou le périmètre qui font partie de la mesure elle-même ne sont pas du chiffrage : ils restent dans la citation et dans la quantification.)
- Les faits biographiques, les mandats, le bilan personnel, les affaires judiciaires.
- Tout ce que le candidat n'énonce pas lui-même.

CITATION VERBATIM : la règle la plus stricte.
- Recopie un passage continu du texte canonique, caractère pour caractère. Elle sera vérifiée par une comparaison de chaînes ; un seul caractère inventé, retiré ou corrigé la fait rejeter.
- Garde tout tel quel : coquilles, fautes d'accord, majuscules, ligatures, abréviations, chiffres, ponctuation, tirets de coupure de mot. Une faute dans la source reste dans la citation.
- Ne reformule pas, ne raccourcis pas l'intérieur du passage, n'ajoute ni « … » ni « [ ] », ne recolle pas deux morceaux éloignés, ne traduis pas, ne remets pas en forme.
- Seule tolérance : une suite d'espaces ou de sauts de ligne peut être rendue par une seule espace.
- Le passage doit suffire, à lui seul, à établir la position et ses chiffres. Prends la phrase entière qui porte la mesure, pas davantage que nécessaire.
- Si la position ne se lit qu'en réunissant des passages séparés, n'extrais pas.
- Le passage ne franchit jamais un caractère de saut de page (U+000C) : une citation à cheval sur deux pages est refusée.

PAGE (format "pdf" seulement)
- Les pages du texte sont séparées par le caractère U+000C. La page d'une citation est 1 plus le nombre de caractères U+000C qui la précèdent dans le texte. C'est le rang de la page dans le fichier, jamais le numéro imprimé sur la page.
- Pour tout autre format, n'écris pas le champ "page".

PARAPHRASE
- Une phrase courte, neutre, qui dit la mesure et la position sans rien ajouter qui ne soit dans la citation : ni motif, ni conséquence, ni chiffre absent, ni qualificatif.
- Ne nomme pas le candidat.

QUANTIFICATION (facultative)
- Seulement si la citation contient un montant, un taux, une date, une durée, un âge, un effectif ou un périmètre de la mesure. Chaque valeur vient de la citation, jamais d'une connaissance extérieure ni d'un calcul.
- Forme : {"dimensions": [{"type": …, "valeur": …, "unite": …, "operateur": …, "valeur_haute": …}]}
  - "type" : montant, taux, date, duree, age, effectif ou perimetre.
  - "valeur" : un nombre pour montant, taux, duree, age, effectif ; une date ISO AAAA-MM-JJ pour date ; le texte du périmètre pour perimetre.
  - "unite" et "operateur" : obligatoires pour montant, taux, duree, age, effectif. "operateur" vaut exact, au_moins, au_plus, environ ou fourchette, selon ce que dit la citation ; "valeur_haute" seulement pour fourchette.
- Si une valeur est ambiguë dans la citation, n'écris pas de quantification : l'annotateur la saisira.

EN CAS DE DOUTE, N'EXTRAIS PAS.
Une position manquée coûte un item ; une position mal attribuée ou inventée fausse la mesure. Un document qui ne contient aucune position dans le périmètre donne {"items": []}.

SORTIE
Réponds par un seul objet JSON, sans aucun texte avant ni après, sans bloc de code :
{"items": [ {"type": "P" ou "O", "candidat_id": "{candidat_id}", "mesure_proposee": {"libelle": "…", "theme": "<un des dix codes>"}, "position": "pour" | "contre" | "conditionnel", "citation_verbatim": "…", "page": <entier, format pdf seulement>, "paraphrase": "…", "quantification": {…} facultatif } ]}
N'ajoute aucun autre champ.

EXEMPLE FICTIF (texte inventé pour illustrer la forme ; il ne vient d'aucun programme réel)
Texte, format "pdf", deux pages séparées par U+000C :
« Notre constat : les centres de santé ferment trop tôt.[U+000C]Nous ouvrirons tous les centres de santé municipaux le dimanche. Nous créeront une prime de 150 euros pour chaque apprenti de première année. Nous rénoverons les musées de province. »
Sortie :
{"items": [
 {"type": "P", "candidat_id": "{candidat_id}", "mesure_proposee": {"libelle": "Ouvrir les centres de santé municipaux le dimanche", "theme": "sante"}, "position": "pour", "citation_verbatim": "Nous ouvrirons tous les centres de santé municipaux le dimanche.", "page": 2, "paraphrase": "Ouvrir tous les centres de santé municipaux le dimanche."},
 {"type": "P", "candidat_id": "{candidat_id}", "mesure_proposee": {"libelle": "Créer une prime pour les apprentis de première année", "theme": "travail_emploi"}, "position": "pour", "citation_verbatim": "Nous créeront une prime de 150 euros pour chaque apprenti de première année.", "page": 2, "paraphrase": "Créer une prime de 150 euros pour chaque apprenti de première année.", "quantification": {"dimensions": [{"type": "montant", "valeur": 150, "unite": "EUR", "operateur": "exact"}, {"type": "perimetre", "valeur": "apprentis de première année"}]}}
]}
Le constat de la page 1 n'est pas extrait : c'est un diagnostic, pas une position. Les musées ne relèvent d'aucun des dix thèmes : pas d'item. La coquille « créeront » est recopiée telle quelle.
```
