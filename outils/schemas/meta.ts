import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { copierErreurs, formaterErreur } from "./erreurs.ts";
import { cheminSchema, NOMS_SCHEMAS, type NomSchema } from "./noms.ts";

export interface ConformiteSchema {
  readonly nom: NomSchema;
  readonly conforme: boolean;
  readonly erreurs: readonly string[];
}

/**
 * Conformité au méta-schéma draft 2020-12 (cas limite 2), à ne pas confondre avec les
 * avertissements `strict` de `registre.ts` : `validateSchema` vérifie la syntaxe du document de
 * schéma lui-même contre le méta-schéma officiel, pas les heuristiques de style propres à ajv.
 * Une instance jetable, sans registre commun : la conformité au méta-schéma d'un fichier ne dépend
 * pas de la résolution de ses `$ref`.
 */
export function verifierConformiteMetaSchema(racineSchema: string): readonly ConformiteSchema[] {
  const ajv = new Ajv2020({ strict: false });
  return NOMS_SCHEMAS.map((nom) => verifierUnSchema(ajv, racineSchema, nom));
}

function verifierUnSchema(ajv: Ajv2020, racineSchema: string, nom: NomSchema): ConformiteSchema {
  const brut = readFileSync(cheminSchema(racineSchema, nom), "utf8");
  const schema = JSON.parse(brut) as object;
  const conforme = ajv.validateSchema(schema) === true;
  const erreurs = conforme ? [] : copierErreurs(ajv.errors).map(formaterErreur);
  return { nom, conforme, erreurs };
}
