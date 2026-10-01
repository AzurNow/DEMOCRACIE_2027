/**
 * Conformité du 2026-09-29, n° 24 (§5.23, §5.38) : une entrée de tirage porte son thème et sa grappe.
 * La barrière de symétrie juge la répartition sur `entree.theme`, et le bootstrap du §8 rééchantillonne
 * par `grappe_id` : sans eux, une entrée tomberait dans une strate ou une grappe indéfinie.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { construireRegistre } from "../outils/schemas/registre.ts";
import { urnSchema } from "../outils/schemas/noms.ts";

const RACINE_SCHEMA = resolve(import.meta.dirname, "../schema");
const { ajv } = construireRegistre(RACINE_SCHEMA);

/** Les raisons de refus d'un tirage, `chemin mot-clé (propriété)`, dédoublonnées et triées. */
function raisons(fichier: string): readonly string[] {
  const valider = ajv.getSchema(urnSchema("tirage"));
  if (valider === undefined) throw new Error("schéma tirage absent du registre");
  const tirage = JSON.parse(readFileSync(resolve(RACINE_SCHEMA, "exemples", fichier), "utf8")) as unknown;
  if (valider(tirage)) return [];
  if (valider.errors === null || valider.errors === undefined) throw new Error("ajv n'a rendu aucune erreur");
  const textes = valider.errors
    .filter((erreur) => erreur.keyword !== "if")
    .map((erreur) => {
      const params = erreur.params as { missingProperty?: string };
      return `${erreur.instancePath} ${erreur.keyword}${params.missingProperty === undefined ? "" : ` (${params.missingProperty})`}`;
    });
  return [...new Set(textes)].sort();
}

describe("n° 24 : thème et grappe obligatoires dans une entrée de tirage", () => {
  it("le tirage nominal dont les invalides sont des copies reste valide", () => {
    expect(raisons("tirage/valide-01-tirage-nominal.json")).toEqual([]);
  });

  it("une entrée sans thème est refusée", () => {
    expect(raisons("tirage/invalide-10-entree-sans-theme.json")).toEqual(["/entrees/0 required (theme)"]);
  });

  it("une entrée sans grappe est refusée", () => {
    expect(raisons("tirage/invalide-11-entree-sans-grappe.json")).toEqual(["/entrees/0 required (grappe_id)"]);
  });
});
