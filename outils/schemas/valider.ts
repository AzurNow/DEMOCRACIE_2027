/**
 * Validation de schéma à l'exécution, à chaque frontière (CLAUDE.md, « Validation de schéma à
 * chaque frontière, à l'entrée comme à la sortie » ; revue du 2026-09-23, constat 2).
 *
 * Une seule fonction, `valider(nom, valeur, provenance)` : elle renvoie la valeur telle quelle si
 * elle est conforme au schéma nommé, et lève `ErreurSchema` sinon, en nommant la provenance (un
 * chemin de fichier, une ligne de journal, une requête), le schéma et chaque chemin d'instance
 * fautif. Rien n'est complété, corrigé ni ignoré : ajv est réglé sans `useDefaults`,
 * `coerceTypes` ni `removeAdditional` (`registre.ts`), il ne touche donc pas à la valeur.
 *
 * Le registre des vingt schémas est construit **une fois par processus**, au premier appel, à
 * partir de `schema/` situé par rapport à ce fichier et non au répertoire courant : un outil lancé
 * depuis un autre répertoire, ou un bac d'essai qui porte sa propre copie partielle de
 * `schema/commun.schema.json`, valide contre les mêmes schémas que le dépôt.
 *
 * Les types TypeScript ne sont pas engendrés depuis les schémas : l'appelant donne le type attendu,
 * et l'assertion n'a lieu qu'après la validation.
 */

import { resolve } from "node:path";
import { copierErreurs, formaterErreur } from "./erreurs.ts";
import { estNomSchema, urnSchema, type NomSchema } from "./noms.ts";
import { construireRegistre, type Registre } from "./registre.ts";

export const RACINE_SCHEMAS = resolve(import.meta.dirname, "../../schema");

/**
 * Schémas qui ne décrivent aucun objet : `commun` n'est qu'une bibliothèque de `$defs`, et
 * n'importe quelle valeur lui est conforme. Valider contre lui serait une validation silencieuse.
 */
const SANS_OBJET: ReadonlySet<string> = new Set<NomSchema>(["commun"]);

export class ErreurSchema extends Error {
  readonly provenance: string;
  readonly schema: string;
  readonly chemins: readonly string[];

  constructor(provenance: string, schema: string, erreurs: readonly string[], chemins: readonly string[]) {
    super(
      `${provenance} : non conforme au schéma « ${schema} » (schema/${schema}.schema.json)\n` +
        erreurs.map((erreur) => `  ${erreur}`).join("\n"),
    );
    this.name = "ErreurSchema";
    this.provenance = provenance;
    this.schema = schema;
    this.chemins = chemins;
  }
}

export class SchemaInconnu extends Error {
  constructor(nom: string, provenance: string) {
    super(
      `${provenance} : « ${nom} » n'est pas un schéma qui décrit un objet (outils/schemas/noms.ts). ` +
        `Rien n'est validé en silence.`,
    );
    this.name = "SchemaInconnu";
  }
}

export type Valideur = <T>(nom: NomSchema, valeur: unknown, provenance: string) => T;

/**
 * Fabrique d'un valideur sur un registre construit paresseusement, une fois. Exportée pour les
 * tests (compter les constructions) ; le code de production utilise `valider`.
 */
export function creerValideur(construire: () => Registre): Valideur {
  let registre: Registre | null = null;
  const obtenirRegistre = (): Registre => {
    if (registre === null) registre = construire();
    return registre;
  };

  return <T>(nom: NomSchema, valeur: unknown, provenance: string): T => {
    const validateur = validateurDe(obtenirRegistre(), nom, provenance);
    if (validateur(valeur) === true) return valeur as T;
    const erreurs = copierErreurs(validateur.errors);
    throw new ErreurSchema(
      provenance,
      nom,
      erreurs.map(formaterErreur),
      erreurs.map((erreur) => erreur.instancePath),
    );
  };
}

function validateurDe(registre: Registre, nom: string, provenance: string) {
  if (!estNomSchema(nom) || SANS_OBJET.has(nom)) throw new SchemaInconnu(nom, provenance);
  const validateur = registre.ajv.getSchema(urnSchema(nom));
  if (validateur === undefined) throw new SchemaInconnu(nom, provenance);
  return validateur;
}

export const valider: Valideur = creerValideur(() => construireRegistre(RACINE_SCHEMAS));

/**
 * Même contrôle que `valider`, pour l'appelant qui doit **rapporter** la non-conformité au lieu de
 * s'arrêter (réponse HTTP 400, rapport de `pnpm promote`). Seule `ErreurSchema` est rendue ; un
 * schéma inconnu ou toute autre erreur remonte telle quelle.
 */
export function erreurDeSchema(nom: NomSchema, valeur: unknown, provenance: string): ErreurSchema | null {
  try {
    valider(nom, valeur, provenance);
    return null;
  } catch (erreur) {
    if (erreur instanceof ErreurSchema) return erreur;
    throw erreur;
  }
}
