/**
 * `schema/run.schema.json` : publication du test contrefactuel des noms de candidats (§7 ; D14,
 * D16 ; lot notation, PR C, cas limite 11 du brief). Les exemples valides passent, et chaque
 * exemple invalide tombe pour sa seule règle : la liste COMPLÈTE des erreurs ajv est comparée, pas
 * seulement la première (les erreurs `if`, qui ne font que signaler la branche prise, sont écartées).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { urnSchema } from "../outils/schemas/noms.ts";
import { construireRegistre } from "../outils/schemas/registre.ts";

const RACINE_SCHEMA = resolve(import.meta.dirname, "../schema");
const { ajv } = construireRegistre(RACINE_SCHEMA);

interface ErreurLue {
  readonly chemin: string;
  readonly mot_cle: string;
  readonly detail: string;
}

function erreurs(fichier: string): readonly ErreurLue[] {
  const valider = ajv.getSchema(urnSchema("run"));
  if (valider === undefined) throw new Error("schéma run absent du registre");
  const exemple: unknown = JSON.parse(readFileSync(join(RACINE_SCHEMA, "exemples", "run", fichier), "utf8"));
  if (valider(exemple) === true) return [];
  return (valider.errors ?? [])
    .filter((e) => e.keyword !== "if")
    .map((e) => ({ chemin: e.instancePath, mot_cle: e.keyword, detail: JSON.stringify(e.params) }));
}

describe("11. bloc contrefactuel_candidats et effectifs des juges", () => {
  it("valides : test terminé (valide-01), test indéfini (valide-05), deux juges retirés et run invalide (valide-06)", () => {
    expect(erreurs("valide-01-mensuel-publie.json")).toEqual([]);
    expect(erreurs("valide-05-contrefactuel-indefini.json")).toEqual([]);
    expect(erreurs("valide-06-invalide-deux-juges-retires.json")).toEqual([]);
  });

  it("run publié sans le bloc : tombe pour cette seule obligation", () => {
    expect(erreurs("invalide-27-publie-sans-contrefactuel.json")).toEqual([
      { chemin: "", mot_cle: "required", detail: JSON.stringify({ missingProperty: "contrefactuel_candidats" }) },
    ]);
  });

  it("test indéfini et un juge qui publie un taux et ses effectifs : tombe sur ces deux champs seuls", () => {
    expect(erreurs("invalide-28-indefini-avec-taux-de-juge.json").map((e) => [e.chemin, e.mot_cle])).toEqual([
      ["/juges/0/taux_changement_contrefactuel", "false schema"],
      ["/juges/0/changements_contrefactuel", "false schema"],
    ]);
  });

  it("taux de juge sans ses effectifs : tombe sur la dépendance seule", () => {
    expect(erreurs("invalide-29-taux-sans-changements.json")).toEqual([
      {
        chemin: "/juges/0",
        mot_cle: "dependentRequired",
        detail: JSON.stringify({ property: "taux_changement_contrefactuel", missingProperty: "changements_contrefactuel", depsCount: 1, deps: "changements_contrefactuel" }),
      },
    ]);
  });

  it("test terminé et un juge sans taux ni effectifs : tombe sur l'obligation de les publier", () => {
    expect(erreurs("invalide-30-termine-sans-taux-de-juge.json")).toEqual([
      { chemin: "/juges/1", mot_cle: "required", detail: JSON.stringify({ missingProperty: "taux_changement_contrefactuel" }) },
      { chemin: "/juges/1", mot_cle: "required", detail: JSON.stringify({ missingProperty: "changements_contrefactuel" }) },
    ]);
  });
});
