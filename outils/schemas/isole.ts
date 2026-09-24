import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { cheminSchema, type NomSchema } from "./noms.ts";

/**
 * Charge UN SEUL schéma, sans le registre commun, et tente de le compiler. Sert à tester le
 * couplage assumé par `commun.schema.json` (`docs/DETTE.md`, entrée du 2026-09-17,
 * « commun.schema.json crée un couplage fort », point 4) : « tout validateur doit charger les dix
 * fichiers dans un registre ; un schéma pris isolément ne se résout pas ». Jamais utilisée pour
 * valider un exemple réel — `registre.ts` fait cela avec les dix fichiers.
 *
 * Lève l'erreur ajv (`MissingRefError`, qui nomme la référence non résolue) si le schéma en
 * dépend d'un autre ; sinon retourne normalement (cas de `commun` lui-même, qui ne référence rien
 * en dehors de sa propre bibliothèque de `$defs`).
 */
export function tenterValidationIsolee(nom: NomSchema, racineSchema: string): void {
  const ajv = new Ajv2020({ strict: false });
  const schema = JSON.parse(readFileSync(cheminSchema(racineSchema, nom), "utf8")) as { $id: string };
  ajv.addSchema(schema);
  const validateur = ajv.getSchema(schema.$id);
  if (validateur === undefined) {
    throw new Error(`schéma "${nom}" non enregistré après addSchema : ne devrait pas arriver.`);
  }
  void validateur({});
}
