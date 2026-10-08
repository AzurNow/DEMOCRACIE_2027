/**
 * Accord entre le test des liens (Python), son schéma et ses exemples, sans validateur JSON Schema
 * côté Python (même montage que `tests/collecte/dores.test.ts`) :
 * - pytest vérifie que `pipeline/liens` reproduit les fichiers dorés octet pour octet
 *   (`tests/liens/test_principal.py`) ;
 * - ce test les valide contre `schema/existence-lien.schema.json` avec le registre de `pnpm check` ;
 * - et il vérifie que chaque exemple valide de `schema/exemples/existence-lien/` est identique octet
 *   pour octet à son fichier doré.
 * Si l'un des trois côtés dérive, un test rougit.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { valider } from "../../outils/schemas/valider.ts";

const racineDore = resolve(import.meta.dirname, "dore");
const racineExemples = resolve(import.meta.dirname, "../../schema/exemples/existence-lien");

const PAIRES: readonly { readonly dore: string; readonly exemple: string }[] = [
  { dore: "existe.json", exemple: "valide-01-existe-page-conservee.json" },
  { dore: "mort.json", exemple: "valide-02-mort-404.json" },
  { dore: "inaccessible-instantane.json", exemple: "valide-03-inaccessible-instantane-trouve.json" },
  { dore: "non-testable-robots.json", exemple: "valide-04-non-testable-robots.json" },
];

describe("fichiers dorés produits par pipeline/liens", () => {
  for (const paire of PAIRES) {
    it(`${paire.dore} est conforme à schema/existence-lien.schema.json`, () => {
      const contenu: unknown = JSON.parse(readFileSync(resolve(racineDore, paire.dore), "utf8"));
      expect(() => valider("existence-lien", contenu, paire.dore)).not.toThrow();
    });

    it(`schema/exemples/existence-lien/${paire.exemple} est la copie exacte de ${paire.dore}`, () => {
      expect(readFileSync(resolve(racineExemples, paire.exemple)).equals(readFileSync(resolve(racineDore, paire.dore)))).toBe(true);
    });
  }

  it("chaque lien doré est aussi un lien de notation valide (mêmes motifs, mêmes énumérations)", () => {
    for (const paire of PAIRES) {
      const contenu = JSON.parse(readFileSync(resolve(racineDore, paire.dore), "utf8")) as Record<string, unknown>;
      const lien = {
        url_citee: contenu["url_citee"],
        verdict_existence: contenu["verdict_existence"],
        verdict_soutien: "non_applicable",
        date_test: contenu["date_test"],
        ...Object.fromEntries(["url_finale", "code_http", "sha256_contenu", "archive_url"].filter((cle) => cle in contenu).map((cle) => [cle, contenu[cle]])),
      };
      const notation = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../schema/exemples/notation/valide-01-juge-exacte.json"), "utf8")) as Record<string, unknown>;
      const sourcage = { cite: true, liens: [lien] };
      expect(() => valider("notation", { ...notation, sourcage }, paire.dore)).not.toThrow();
    }
  });
});
