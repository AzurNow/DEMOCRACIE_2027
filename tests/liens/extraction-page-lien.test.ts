/**
 * Accord entre l'extraction du texte des copies (Python, `pipeline/liens/textes.py`, D27 (E)), son
 * schéma et ses exemples, sans validateur JSON Schema côté Python (même montage que
 * `dores-liens.test.ts`) : pytest reproduit les fichiers dorés octet pour octet
 * (`tests/liens/test_textes.py`), ce test les valide contre `schema/extraction-page-lien.schema.json`
 * et vérifie que chaque exemple valide leur est identique.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { valider } from "../../outils/schemas/valider.ts";

const racineDore = resolve(import.meta.dirname, "dore-textes");
const racineExemples = resolve(import.meta.dirname, "../../schema/exemples/extraction-page-lien");

const PAIRES: readonly { readonly dore: string; readonly exemple: string }[] = [
  { dore: "extraction-html.json", exemple: "valide-01-page-html-extraite.json" },
  { dore: "extraction-pdf.json", exemple: "valide-02-page-pdf-extraite.json" },
  { dore: "extraction-refus.json", exemple: "valide-03-extraction-refusee.json" },
];

describe("fiches dorées produites par pipeline/liens/textes.py", () => {
  for (const paire of PAIRES) {
    it(`${paire.dore} est conforme à schema/extraction-page-lien.schema.json`, () => {
      const contenu: unknown = JSON.parse(readFileSync(resolve(racineDore, paire.dore), "utf8"));
      expect(() => valider("extraction-page-lien", contenu, paire.dore)).not.toThrow();
    });

    it(`schema/exemples/extraction-page-lien/${paire.exemple} est la copie exacte de ${paire.dore}`, () => {
      expect(readFileSync(resolve(racineExemples, paire.exemple)).equals(readFileSync(resolve(racineDore, paire.dore)))).toBe(true);
    });
  }
});
