/**
 * Passe de conformité du 2026-09-29, côté schéma de l'item :
 *
 * - n° 33, annexe A (A.04, A.05, A.08) : « le thème appartient à la mesure », l'item épingle la
 *   version de sa mesure, et la quantification est une liste de dimensions typées. Trois formes que
 *   le schéma refusait déjà sans qu'aucun exemple invalide ne le garde ;
 * - n° 31, §10 : l'adresse du contestataire « n'entre dans aucun fichier du projet ». Seul
 *   `contestataire_type` est enregistré.
 *
 * Chaque exemple invalide doit être refusé pour sa seule raison : un exemple refusé pour une autre
 * cause ne garderait plus rien le jour où cette autre cause disparaît.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { construireRegistre } from "../outils/schemas/registre.ts";
import { urnSchema } from "../outils/schemas/noms.ts";

const RACINE_SCHEMA = resolve(import.meta.dirname, "../schema");
const { ajv } = construireRegistre(RACINE_SCHEMA);

function lire(fichier: string): unknown {
  return JSON.parse(readFileSync(resolve(RACINE_SCHEMA, "exemples", fichier), "utf8")) as unknown;
}

/** Les raisons de refus d'un item, `chemin mot-clé (propriété)`, dédoublonnées et triées. */
function raisons(fichier: string): readonly string[] {
  const valider = ajv.getSchema(urnSchema("item"));
  if (valider === undefined) throw new Error("schéma item absent du registre");
  if (valider(lire(fichier))) return [];
  if (valider.errors === null || valider.errors === undefined) throw new Error("ajv n'a rendu aucune erreur");
  const textes = valider.errors
    .filter((erreur) => erreur.keyword !== "if")
    .map((erreur) => {
      const params = erreur.params as { additionalProperty?: string; missingProperty?: string };
      const propriete = params.additionalProperty ?? params.missingProperty;
      return `${erreur.instancePath} ${erreur.keyword}${propriete === undefined ? "" : ` (${propriete})`}`;
    });
  return [...new Set(textes)].sort();
}

describe("annexe A : formes de l'item gardées par un exemple invalide (conformité n° 33)", () => {
  it("les deux exemples valides dont les invalides sont des copies restent valides", () => {
    expect(raisons("item/valide-01-position-t1.json")).toEqual([]);
    expect(raisons("item/valide-05-retire-par-panel-attestation-conservee.json")).toEqual([]);
  });

  it("A.04 : un item qui porte son thème est refusé, le thème appartient à la mesure", () => {
    expect(raisons("item/invalide-22-item-portant-son-theme.json")).toEqual([" additionalProperties (theme)"]);
  });

  it("A.05 : un item sans mesure_version est refusé", () => {
    expect(raisons("item/invalide-23-sans-mesure-version.json")).toEqual([" required (mesure_version)"]);
  });

  it("A.08 : une quantification hors de dimensions[] est refusée", () => {
    expect(raisons("item/invalide-24-quantification-hors-dimensions.json")).toEqual([
      "/assertion/quantification additionalProperties (operateur)",
      "/assertion/quantification additionalProperties (perimetre)",
      "/assertion/quantification additionalProperties (taux)",
      "/assertion/quantification additionalProperties (unite)",
      "/assertion/quantification required (dimensions)",
    ]);
  });
});

describe("§10 : aucune adresse de contestataire dans un fichier du projet (conformité n° 31)", () => {
  it("une contestation qui porte l'adresse du contestataire est refusée", () => {
    expect(raisons("item/invalide-25-contestation-avec-adresse.json")).toEqual([
      "/contestations/0 additionalProperties (contestataire_adresse)",
    ]);
  });
});
