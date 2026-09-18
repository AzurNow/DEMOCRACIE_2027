/**
 * Énumérations lues **dans les schémas**, jamais recopiées.
 *
 * Les dix thèmes du §3 et le vocabulaire de positions vivent une seule fois, dans
 * `schema/commun.schema.json`. Les redéclarer en TypeScript pour peupler une liste déroulante
 * créerait une seconde source de vérité, qui divergerait au premier amendement — et un
 * annotateur choisirait alors un thème qui n'existe plus.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

interface SchemaCommun {
  $defs: Record<string, { enum?: readonly string[] }>;
}

export function enumerationCommune(racineDepot: string, nom: string): readonly string[] {
  const chemin = join(racineDepot, "schema", "commun.schema.json");
  const schema = JSON.parse(readFileSync(chemin, "utf8")) as SchemaCommun;
  const valeurs = schema.$defs[nom]?.enum;
  if (valeurs === undefined) {
    throw new Error(`L'énumération « ${nom} » est absente de schema/commun.schema.json`);
  }
  return valeurs;
}
