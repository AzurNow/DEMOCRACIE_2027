/**
 * D22 : l'écran de notation humaine n'offre pas « soutient » quand le schéma de notation le
 * refuserait. Le test d'alignement construit chaque combinaison de lien, la valide contre
 * `notation.schema.json` et exige que `soutiensAdmis` retienne un soutien si et seulement si le
 * schéma l'accepte : un changement du schéma fait échouer ce test.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { soutiensAdmis } from "../../notation-humaine/client/soutiens.ts";
import type { Existence } from "../../notation-humaine/client/types.ts";
import { ErreurSchema, valider } from "../../outils/schemas/valider.ts";

const RACINE = join(import.meta.dirname, "..", "..");
const BASE = join(RACINE, "schema", "exemples", "notation", "valide-01-juge-exacte.json");
const SCHEMA = JSON.parse(readFileSync(join(RACINE, "schema", "notation.schema.json"), "utf8")) as {
  properties: { sourcage: { properties: { liens: { items: { properties: { verdict_existence: { enum: string[] }; verdict_soutien: { enum: string[] } } } } } } };
};
const PROPRIETES_LIEN = SCHEMA.properties.sourcage.properties.liens.items.properties;
const EXISTENCES = PROPRIETES_LIEN.verdict_existence.enum;
const SOUTIENS = PROPRIETES_LIEN.verdict_soutien.enum;
const ARCHIVE = "https://web.archive.org/web/20260101000000/https://exemple.invalid/p";
const EMPREINTE = "a".repeat(64);

function lien(verdict_existence: string, archive: boolean, empreinte: boolean): Existence {
  return {
    url_citee: "https://exemple.invalid/p",
    verdict_existence,
    date_test: "2026-10-01T00:00:00Z",
    ...(archive ? { archive_url: ARCHIVE } : {}),
    ...(empreinte ? { sha256_contenu: EMPREINTE } : {}),
  };
}

function schemaAccepte(l: Existence, verdict_soutien: string): boolean {
  const base = JSON.parse(readFileSync(BASE, "utf8")) as { sourcage: object };
  const notation = { ...base, sourcage: { cite: true, liens: [{ ...l, verdict_soutien }] } };
  try {
    valider("notation", notation, "test-soutiens");
    return true;
  } catch (erreur) {
    if (erreur instanceof ErreurSchema) return false;
    throw erreur;
  }
}

describe("soutiensAdmis (D22)", () => {
  it("1. un lien mort perd « soutient » et garde les trois autres", () => {
    expect(soutiensAdmis(lien("mort", true, true), SOUTIENS)).toEqual(["ne_soutient_pas", "indetermine", "non_applicable"]);
  });

  for (const existence of ["inaccessible", "non_testable"]) {
    it(`2/3. ${existence} : « soutient » seulement avec archive_url ET sha256_contenu`, () => {
      expect(soutiensAdmis(lien(existence, false, false), SOUTIENS)).not.toContain("soutient");
      expect(soutiensAdmis(lien(existence, true, false), SOUTIENS)).not.toContain("soutient");
      expect(soutiensAdmis(lien(existence, false, true), SOUTIENS)).not.toContain("soutient");
      expect(soutiensAdmis(lien(existence, true, true), SOUTIENS)).toContain("soutient");
    });
  }

  it("4. un lien qui existe garde « soutient », avec ou sans archive", () => {
    expect(soutiensAdmis(lien("existe", false, false), SOUTIENS)).toEqual(SOUTIENS);
    expect(soutiensAdmis(lien("existe", true, true), SOUTIENS)).toEqual(SOUTIENS);
  });

  it("5. est exactement aligné sur le schéma, pour chaque combinaison", () => {
    for (const existence of EXISTENCES) {
      for (const archive of [false, true]) {
        for (const empreinte of [false, true]) {
          const l = lien(existence, archive, empreinte);
          const admis = soutiensAdmis(l, SOUTIENS);
          for (const soutien of SOUTIENS) {
            expect(admis.includes(soutien), `${existence} archive=${archive} sha=${empreinte} ${soutien}`).toBe(schemaAccepte(l, soutien));
          }
        }
      }
    }
  });

  it("6. conserve l'ordre de la grille servie", () => {
    const grille = ["non_applicable", "soutient", "indetermine", "ne_soutient_pas"];
    expect(soutiensAdmis(lien("mort", false, false), grille)).toEqual(["non_applicable", "indetermine", "ne_soutient_pas"]);
    expect(soutiensAdmis(lien("existe", false, false), grille)).toEqual(grille);
  });
});
