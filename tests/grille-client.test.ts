/**
 * `app.ts:grilleComplete()` ne doit plus recopier à la main la liste des cinq clés de la grille
 * (docs/DETTE.md, décision du 2026-09-18) : elle doit importer `CLES_GRILLE` de
 * `domaine/grille.ts`, source unique de vérité déjà envoyée au client dans `vue.questions`.
 *
 * `app.ts` importe `document`/`addEventListener` au niveau module (`void demarrer();`) : il ne
 * peut pas être chargé dans Vitest sans environnement DOM, ce que la décision écarte
 * explicitement. Le test est donc structurel — il lit le code source — comme le fait déjà
 * `tests/interface.test.ts` pour vérifier l'absence de ressource distante.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLES_GRILLE } from "../validation/domaine/grille.ts";

const APP_TS = join(import.meta.dirname, "..", "validation/client/app.ts");

describe("grilleComplete() du client", () => {
  it("18. importe CLES_GRILLE plutôt que de recopier les cinq clés à la main", () => {
    const contenu = readFileSync(APP_TS, "utf8");

    expect(contenu).toMatch(/import\s*\{\s*CLES_GRILLE\s*\}\s*from\s*"\.\.\/domaine\/grille\.ts"/);

    // Aucune des clés de la grille n'apparaît comme littéral de chaîne dans app.ts : la seule
    // façon d'en disposer est l'import ci-dessus. Une clé ajoutée à CLES_GRILLE se répercute
    // donc sans qu'aucune ligne de app.ts n'ait à changer.
    for (const cle of CLES_GRILLE) {
      expect(contenu).not.toContain(`"${cle}"`);
    }

    // La liste de vérité elle-même n'est pas vide, sans quoi le test ci-dessus serait trivial.
    expect(CLES_GRILLE.length).toBeGreaterThan(0);
  });
});
