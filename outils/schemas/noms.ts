/**
 * Les dix schémas de `schema/` (voir `schema/README.md`, « Les huit fichiers » — en réalité dix
 * avec `commun` et `lecture-comparateur`). Nommés une seule fois ici : tout le reste du module en
 * dérive, jamais d'un `if` par nom.
 *
 * `decision.schema.json` existe aussi dans `schema/` mais ne fait pas partie de ce registre : il
 * ne porte aucun exemple dans `schema/exemples/manifeste.json` et n'est référencé par aucun des
 * dix ci-dessous (vérifié par recherche textuelle). Le brief qui a produit ce fichier est explicite
 * sur « les dix schémas réels » ; l'inclure serait un ajout non demandé.
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
