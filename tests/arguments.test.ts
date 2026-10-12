/**
 * `outils/arguments.ts` (revue de code du 2026-10-12, constat 3) : une option que la commande ne
 * déclare pas est refusée avant toute lecture ou écriture. Ignorée, une coquille ferait publier dans
 * `data/` une décision privée de la pièce que l'option devait joindre, sans aucun message.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyserArguments, multiples, OptionsInconnues } from "../outils/arguments.ts";
import { executerOutil, RACINE_PROJET } from "./aides/depot.ts";

describe("analyserArguments", () => {
  it("lit --cle=valeur et --drapeau, et laisse les positionnels aux commandes", () => {
    const table = analyserArguments(["run/", "--item=I-1", "--ecrire"], ["item", "ecrire"]);
    expect([...table.entries()]).toEqual([
      ["item", "I-1"],
      ["ecrire", "true"],
    ]);
  });

  it("une valeur peut contenir « = » : seul le premier sépare la clé", () => {
    expect(analyserArguments(["--motif=a=b"], ["motif"]).get("motif")).toBe("a=b");
  });

  it("refuse une option non déclarée, et nomme celles qui sont admises", () => {
    const appel = (): unknown => analyserArguments(["--dissidence=avis.txt", "--ecrire"], ["dissidence-fichier", "ecrire"]);
    expect(appel).toThrow(OptionsInconnues);
    expect(appel).toThrow("option(s) inconnue(s) : --dissidence ; options admises : --dissidence-fichier, --ecrire.");
  });

  it("refuse un drapeau non déclaré (--help n'est pas une aide implicite)", () => {
    expect(() => analyserArguments(["--help"], ["verifier"])).toThrow("option(s) inconnue(s) : --help");
  });

  it("une commande sans option refuse toute option, en le disant", () => {
    expect(() => analyserArguments(["run/", "--run=x"], [])).toThrow("--run ; cette commande n'admet aucune option.");
  });

  it("nomme toutes les options inconnues, pas seulement la première", () => {
    expect(() => analyserArguments(["--a=1", "--b", "--c=2"], ["c"])).toThrow("option(s) inconnue(s) : --a, --b ;");
  });

  it("une option répétable se déclare comme les autres, et multiples() rend toutes ses valeurs", () => {
    const bruts = ["--case=1:faite", "--case=2:non_faite"];
    expect(() => analyserArguments(bruts, ["case"])).not.toThrow();
    expect(multiples(bruts, "case")).toEqual(["1:faite", "2:non_faite"]);
  });
});

/** Chaque commande refuse la coquille avant d'avoir rien lu : aucune autre option n'est nécessaire. */
describe("les commandes qui écrivent refusent une coquille", () => {
  const cas: ReadonlyArray<readonly [string, readonly string[], string]> = [
    ["panel.ts", ["--item=I-1", "--dissidence=avis.txt", "--ecrire"], "--dissidence"],
    ["contester.ts", ["--item=I-1", "--source=s.json", "--ecrire"], "--source"],
    ["arbitrer.ts", ["--item=I-1", "--motivation=m.txt", "--ecrire"], "--motivation"],
    ["promote.ts", ["--stagin=ailleurs", "--ecrire"], "--stagin"],
    ["mesures.ts", ["--mesure=M-1", "--decison=acceptee", "--ecrire"], "--decison"],
    ["lots.ts", ["--graine=g", "--anotateurs=a1,a2", "--ecrire"], "--anotateurs"],
    ["diagnostics.ts", ["--diagnostic=ailleurs"], "--diagnostic"],
    ["symmetry.ts", ["--mesure=m.json"], "--mesure"],
  ];

  for (const [outil, arguments_, coquille] of cas) {
    it(`${outil} ${coquille} : refus nommé, code non nul`, () => {
      const resultat = executerOutil(outil, arguments_);
      expect(resultat.status).not.toBe(0);
      expect(resultat.erreur).toContain(`option(s) inconnue(s) : ${coquille} ;`);
    });
  }

  it("feuille-de-route --help ne réécrit pas docs/FEUILLE-DE-ROUTE.md", () => {
    const chemin = join(RACINE_PROJET, "docs/FEUILLE-DE-ROUTE.md");
    const avant = { contenu: readFileSync(chemin, "utf8"), date: statSync(chemin).mtimeMs };
    const resultat = executerOutil("feuille-de-route.ts", ["--help"]);
    expect(resultat.status).not.toBe(0);
    expect(resultat.erreur).toContain("option(s) inconnue(s) : --help ; options admises : --verifier.");
    expect(resultat.sortie).not.toContain("Écrit");
    expect({ contenu: readFileSync(chemin, "utf8"), date: statSync(chemin).mtimeMs }).toEqual(avant);
  });
});
