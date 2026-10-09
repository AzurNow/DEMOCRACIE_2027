/**
 * Les vingt-quatre schémas de `schema/` (voir `schema/README.md`, « Les dix-huit fichiers » : douze avec
 * `commun` et `lecture-comparateur`, treize avec `gabarits`, quatorze avec `collecte`, seize avec
 * `fiche-source` et `reprise-archivage`, dix-sept avec `extraction-texte`, dix-huit avec
 * `transcription`).
 * Nommés une seule fois
 * ici : tout le reste du module en dérive, jamais d'un `if` par nom.
 *
 * `decision` (journal de validation, §4) et `decision-mesure` (arbitrage des corrections de
 * thème, §4) rejoignent ce registre avec ce lot : les deux objets sont publiés au titre du §9 et
 * doivent donc, comme les dix autres, porter des exemples dans `schema/exemples/manifeste.json`
 * et être vérifiés par `pnpm check`. Avant ce lot, ils en étaient absents — un défaut nommé dans
 * `docs/DETTE.md` (2026-09-19, points 2 et 3 ; 2026-09-18, point 5), fermé ici.
 *
 * `gabarits` décrit la table des gabarits versionnée dans `prompts/` (§5, protocole 0.3). Ses
 * exemples sont vérifiés ici comme les autres ; le fichier réel `prompts/gabarits-1.0.0.json`
 * l'est par `tests/questions/gabarits.test.ts`, et par le chargeur à chaque import.
 *
 * `collecte`, `fiche-source` et `reprise-archivage` décrivent les trois fichiers écrits par
 * `pipeline/collecte` (Python, `docs/CONTRATS.md` §5) : manifeste de contenu, fiche par source,
 * reprise d'archivage. Python ne valide pas contre le schéma : les fichiers dorés de
 * `tests/collecte/dore/`, reproduits octet pour octet par pytest, sont validés ici par
 * `tests/collecte/dores.test.ts`, qui vérifie aussi que les exemples valides leur sont identiques.
 *
 * `extraction-texte` décrit la fiche d'extraction écrite par `pipeline/collecte/textes` (sous-lot C2,
 * `docs/CONTRATS.md` §1.1), vérifiée de la même façon.
 *
 * `transcription` décrit la fiche de transcription écrite par `pipeline/collecte/transcription`
 * (sous-lot C3, `docs/CONTRATS.md` §2.2), vérifiée de la même façon.
 *
 * `diagnostic-lot` décrit un calcul du kappa d'un lot, écrit en ajout seul par `pnpm diagnostics`
 * dans `validation/diagnostics/` et publié au titre du §9 (conformité 2026-09-24, n° 16) : le
 * dix-neuvième schéma.
 *
 * `decision-arbitrage` décrit une entrée du registre des décisions d'arbitrage,
 * `validation/arbitrage/decisions.json`, écrite en ajout seul par `pnpm arbitrer` et relue par
 * `pnpm promote` (§4, règle de concordance, protocole 0.10 ; conformité n° 18) : le vingtième.
 *
 * `notification-due` et `envoi-notification` décrivent les deux fichiers en ajout seul des
 * notifications aux campagnes (§4, droit de réponse, protocole 0.10) : la file
 * `validation/notifications/dues.jsonl`, écrite par promote, contester et panel, et le journal
 * `validation/notifications/envois.jsonl`, écrit par `pnpm notifier` (Python) seul. Ils
 * remplacent `item.notifications[]`, retiré du schéma d'item.
 *
 * `perimetre` décrit `config/perimetre.yaml` tel que l'auteur le saisit (conformité 2026-09-29, n° 23
 * et 25) : lu et validé par `pipeline/questions/charger-perimetre.ts`, qui en tire l'instantané
 * `run.perimetre` et les paramètres du tirage. Le vingt-troisième.
 *
 * `existence-lien` décrit le résultat du test HTTP d'un lien cité (§7, décision D20), écrit par
 * `pipeline/liens` (Python) dans `runs/<date>/volume/liens/` et lu par la notation
 * (`pipeline/notation/fournisseur-fichiers.ts`). Vérifié comme les fichiers de la collecte : fichiers
 * dorés de `tests/liens/dore/`, validés par `tests/liens/dores-liens.test.ts`. Le vingt-quatrième.
 *
 * `checklist` décrit `runs/<date>/checklist.json`, la checklist de run de l'annexe F, écrite par
 * `pnpm go-no-go` et contresignée par `pnpm go-no-go:contresigner` (décision D24 (4) de l'auteur) :
 * le vingt-cinquième.
 *
 * `extraction-page-lien` décrit la fiche d'extraction du texte d'une copie conservée par le test des
 * liens (décision D27 (E), charge-juge-v3), écrite par `pipeline/liens/textes.py` dans
 * `runs/<date>/volume/liens/extractions/` et lue par la notation (`fournisseur-fichiers.ts`).
 * Vérifiée comme la collecte : fichiers dorés de `tests/liens/dore-textes/`. Le vingt-sixième.
 */
export const NOMS_SCHEMAS = [
  "commun",
  "item",
  "question",
  "reponse",
  "notation",
  "verdict",
  "mesure",
  "run",
  "tirage",
  "lecture-comparateur",
  "decision",
  "decision-mesure",
  "gabarits",
  "collecte",
  "fiche-source",
  "reprise-archivage",
  "extraction-texte",
  "transcription",
  "diagnostic-lot",
  "decision-arbitrage",
  "notification-due",
  "envoi-notification",
  "perimetre",
  "existence-lien",
  "checklist",
  "extraction-page-lien",
] as const;

export type NomSchema = (typeof NOMS_SCHEMAS)[number];

export function cheminSchema(racineSchema: string, nom: NomSchema): string {
  return `${racineSchema}/${nom}.schema.json`;
}

export function urnSchema(nom: NomSchema): string {
  return `urn:banc-essai-2027:schema:${nom}`;
}

export function estNomSchema(valeur: string): valeur is NomSchema {
  return (NOMS_SCHEMAS as readonly string[]).includes(valeur);
}
