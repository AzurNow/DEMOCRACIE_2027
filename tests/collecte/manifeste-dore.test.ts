/**
 * Accord entre le code Python de collecte et `schema/collecte.schema.json`, sans ajouter de
 * validateur JSON Schema côté Python : pytest vérifie que `pipeline/collecte` reproduit ces fichiers
 * dorés octet pour octet (`tests/collecte/test_collecte.py`), et ce test les valide contre le schéma
 * avec le registre ajv de `pnpm check`. Si l'un des deux côtés dérive, un des deux tests rougit.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { construireRegistre } from "../../outils/schemas/registre.ts";
import { urnSchema } from "../../outils/schemas/noms.ts";

const racineSchema = resolve(import.meta.dirname, "../../schema");
const racineDore = resolve(import.meta.dirname, "dore");

const FICHIERS_DORES = ["manifeste-archive.json", "manifeste-echec-archivage.json"] as const;

function lireDore(nom: string): unknown {
  return JSON.parse(readFileSync(resolve(racineDore, nom), "utf8"));
}

describe("manifestes dorés produits par pipeline/collecte", () => {
  const { ajv } = construireRegistre(racineSchema);
  const valider = ajv.getSchema(urnSchema("collecte"));

  it("le schéma collecte est enregistré au registre", () => {
    expect(valider).toBeDefined();
  });

  for (const nom of FICHIERS_DORES) {
    it(`${nom} est conforme à schema/collecte.schema.json`, () => {
      if (valider === undefined) throw new Error("schéma collecte absent du registre");
      const valide = valider(lireDore(nom));
      expect(valider.errors).toBeNull();
      expect(valide).toBe(true);
    });
  }

  it("les deux branches d'archivage sont couvertes : une archive_url, un echec_archivage", () => {
    const [archive, echec] = FICHIERS_DORES.map((nom) => lireDore(nom) as Record<string, unknown>);
    expect(archive).toHaveProperty("archive_url");
    expect(archive).not.toHaveProperty("echec_archivage");
    expect(echec).toHaveProperty("echec_archivage");
    expect(echec).not.toHaveProperty("archive_url");
  });
});
