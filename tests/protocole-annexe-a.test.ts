/**
 * Conformité du 2026-09-29, n° 34 (décision de l'auteur du 2026-10-02) : l'instance d'item de
 * l'annexe A du protocole est « une instance valide de `schema/item.schema.json` » (A.17), et son
 * empreinte est celle de son contenu notant (A.10). Depuis #50, l'annexe avait dérivé sans qu'aucun
 * test ne tombe : sa source n'avait pas de `format`, et son empreinte n'était pas la bonne.
 *
 * Le test lit le seul bloc ```json de l'annexe A dans `docs/PROTOCOLE.md`, tel quel : un changement
 * de schéma ou de calcul d'empreinte qui rend l'annexe fausse fait désormais tomber la CI.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { construireRegistre } from "../outils/schemas/registre.ts";
import { urnSchema } from "../outils/schemas/noms.ts";
import { empreinteContenuNotant } from "../validation/domaine/empreinte.ts";
import type { Item } from "../validation/domaine/types.ts";

const RACINE = resolve(import.meta.dirname, "..");
const { ajv } = construireRegistre(resolve(RACINE, "schema"));

/** Le premier bloc ```json qui suit le titre de l'annexe A. Lève s'il manque : jamais d'instance par défaut. */
function instanceAnnexeA(): unknown {
  const protocole = readFileSync(resolve(RACINE, "docs/PROTOCOLE.md"), "utf8");
  const debutAnnexe = protocole.indexOf("**A. Schéma d'un item de référence.**");
  if (debutAnnexe < 0) throw new Error("annexe A introuvable dans docs/PROTOCOLE.md");
  const bloc = /```json\n([\s\S]*?)\n```/.exec(protocole.slice(debutAnnexe));
  if (bloc?.[1] === undefined) throw new Error("bloc json de l'annexe A introuvable");
  return JSON.parse(bloc[1]) as unknown;
}

describe("annexe A du protocole (conformité n° 34)", () => {
  it("l'instance de l'annexe A est valide au schéma de l'item", () => {
    const valider = ajv.getSchema(urnSchema("item"));
    if (valider === undefined) throw new Error("schéma item absent du registre");
    const valide = valider(instanceAnnexeA());
    expect(valider.errors ?? []).toEqual([]);
    expect(valide).toBe(true);
  });

  it("l'empreinte publiée dans l'annexe A est celle de son contenu notant", () => {
    const item = instanceAnnexeA() as Item;
    expect(item.empreinte).toBe(empreinteContenuNotant(item));
  });
});
