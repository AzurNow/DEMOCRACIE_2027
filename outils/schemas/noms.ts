/**
 * Les douze schémas de `schema/` (voir `schema/README.md`, « Les dix fichiers » — en réalité
 * douze avec `commun` et `lecture-comparateur`). Nommés une seule fois ici : tout le reste du
 * module en dérive, jamais d'un `if` par nom.
 *
 * `decision` (journal de validation, §4) et `decision-mesure` (arbitrage des corrections de
 * thème, §4) rejoignent ce registre avec ce lot : les deux objets sont publiés au titre du §9 et
 * doivent donc, comme les dix autres, porter des exemples dans `schema/exemples/manifeste.json`
 * et être vérifiés par `pnpm check`. Avant ce lot, ils en étaient absents — un défaut nommé dans
 * `docs/DETTE.md` (2026-09-19, points 2 et 3 ; 2026-09-18, point 5), fermé ici.
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
