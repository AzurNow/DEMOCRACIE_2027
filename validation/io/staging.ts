/**
 * Lecture de `staging/`. En lecture seule, sans la moindre exception : le pipeline écrit ici,
 * l'interface de validation lit, et `pnpm promote` écrit ailleurs.
 *
 * Y compris pour les textes canoniques des sources : un texte extrait faux se corrige en
 * réextrayant la source, jamais depuis l'écran de validation (docs/CONTRATS.md §1).
 *
 * Chaque item et chaque mesure est confronté à son JSON Schema à la lecture : un fichier non
 * conforme arrête le chargement en nommant le fichier, il n'est ni ignoré ni complété.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NomSchema } from "../../outils/schemas/noms.ts";
import { valider } from "../../outils/schemas/valider.ts";
import type { Item, Mesure } from "../domaine/types.ts";

export interface Staging {
  readonly items: ReadonlyMap<string, Item>;
  readonly mesures: ReadonlyMap<string, Mesure>;
  readonly racine: string;
}

export function chargerStaging(racine: string): Staging {
  return {
    items: chargerJson<Item>("item", join(racine, "items"), (item) => item.id),
    mesures: chargerJson<Mesure>("mesure", join(racine, "mesures"), (mesure) => mesure.id),
    racine,
  };
}

function chargerJson<T>(
  schema: NomSchema,
  repertoire: string,
  cle: (valeur: T) => string,
): ReadonlyMap<string, T> {
  const table = new Map<string, T>();
  if (!existsSync(repertoire)) return table;
  for (const nom of readdirSync(repertoire).sort()) {
    if (!nom.endsWith(".json")) continue;
    const chemin = join(repertoire, nom);
    const valeur = valider<T>(schema, JSON.parse(readFileSync(chemin, "utf8")), chemin);
    table.set(cle(valeur), valeur);
  }
  return table;
}

/**
 * Texte canonique d'une source, indexé par l'empreinte du texte lui-même. Renvoie `null` quand
 * il manque : l'appelant décide quoi en dire, mais personne n'invente un texte de substitution.
 */
export function lireTexteCanonique(racine: string, texte_sha256: string): string | null {
  const chemin = join(racine, "textes", `${texte_sha256}.txt`);
  if (!existsSync(chemin)) return null;
  return readFileSync(chemin, "utf8");
}

export function lireTranscription(racine: string, source_sha256: string): string | null {
  const chemin = join(racine, "transcriptions", `${source_sha256}.vtt`);
  if (!existsSync(chemin)) return null;
  return readFileSync(chemin, "utf8");
}

/**
 * Mesure associée à un item. Une mesure manquante est une erreur de données, pas un cas à
 * contourner : sans elle, ni le thème ni la formulation canonique ne sont connus.
 */
export function mesureDe(staging: Staging, item: Item): Mesure {
  const mesure = staging.mesures.get(item.mesure_id);
  if (mesure === undefined) {
    throw new Error(`Mesure ${item.mesure_id} introuvable pour l'item ${item.id}`);
  }
  return mesure;
}
