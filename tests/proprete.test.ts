/**
 * `pnpm proprete` : chaque lecteur de signaux sur du code écrit en mémoire, puis le rapport. Un
 * signal manqué ne casse rien de visible, d'où un test par genre et un par faux positif connu.
 */
import { describe, expect, it } from "vitest";
import { signauxPython } from "../outils/proprete/python.ts";
import { detailSurUneLigne, nombreDeLignes, rapport, signauxDe } from "../outils/proprete/rapport.ts";
import { compteurDans, SEUIL_FICHIER_LIGNES, SEUIL_FONCTION_LIGNES, type Signal } from "../outils/proprete/signaux.ts";
import { signauxTypeScript } from "../outils/proprete/typescript.ts";

function genres(signaux: readonly Signal[]): string[] {
  return signaux.map((signal) => `${signal.genre}:${signal.ligne}`);
}

describe("signaux TypeScript", () => {
  it("une conversion `as T` est relevée, `as const` ne l'est pas", () => {
    const code = "const a = x as string;\nconst b = [1] as const;\nconst c = <number>y;\n";
    expect(genres(signauxTypeScript("f.ts", code))).toEqual(["conversion:1", "conversion:3"]);
  });

  it("un défaut littéral après `??` ou `||` est relevé, un défaut calculé ne l'est pas", () => {
    const code = [
      "const a = x ?? 0;",
      'const b = y || "";',
      "const c = z ?? [];",
      "const d = w ?? {};",
      "const e = v ?? calculer();",
      "const f = u ?? [1];",
      "const g = t && 0;",
    ].join("\n");
    expect(genres(signauxTypeScript("f.ts", code))).toEqual(["defaut:1", "defaut:2", "defaut:3", "defaut:4"]);
  });

  it("un catch sans nom ou vide est relevé, un catch qui nomme et traite ne l'est pas", () => {
    const code = [
      "try { a(); } catch { b(); }",
      "try { a(); } catch (e) {}",
      "try { a(); } catch (e) { journaliser(e); }",
    ].join("\n");
    const signaux = signauxTypeScript("f.ts", code);
    expect(genres(signaux)).toEqual(["capture:1", "capture:2"]);
    expect(signaux.map((s) => s.detail)).toEqual(["catch sans nom : l'erreur d'origine est perdue", "catch vide"]);
  });

  it(`une fonction de ${SEUIL_FONCTION_LIGNES + 1} lignes est relevée avec son nom, une de ${SEUIL_FONCTION_LIGNES} ne l'est pas`, () => {
    const corps = (lignes: number): string => Array.from({ length: lignes - 2 }, () => "  a();").join("\n");
    const longue = `function longue() {\n${corps(SEUIL_FONCTION_LIGNES + 1)}\n}`;
    const juste = `const juste = () => {\n${corps(SEUIL_FONCTION_LIGNES)}\n};`;
    expect(signauxTypeScript("f.ts", longue)).toEqual([
      { genre: "fonction-longue", fichier: "f.ts", ligne: 1, detail: `longue : ${SEUIL_FONCTION_LIGNES + 1} lignes` },
    ]);
    expect(signauxTypeScript("f.ts", juste)).toEqual([]);
  });

  it("un nombre en dur n'est relevé que dans un commentaire", () => {
    const code = [
      "// les seize schémas du registre",
      " * valide les 70 exemples",
      'const message = "seize schémas";',
    ].join("\n");
    expect(genres(signauxTypeScript("f.ts", code))).toEqual(["compteur:1", "compteur:2"]);
  });
});

describe("signaux Python", () => {
  it("`or` littéral et `.get(clé, défaut)` littéral sont relevés, `.get(clé)` ne l'est pas", () => {
    const code = ['a = x or ""', "b = d.get(cle, 0)", "c = d.get(cle)", "e = x or calculer()", "f = x or 0.5"].join("\n");
    expect(genres(signauxPython("f.py", code))).toEqual(["defaut:1", "defaut:2"]);
  });

  it("`except:` nu et `except …: pass` sont relevés, sur la même ligne ou la suivante", () => {
    const code = [
      "try:",
      "    a()",
      "except:",
      "    b()",
      "try:",
      "    a()",
      "except ValueError:",
      "",
      "    pass",
      "try:",
      "    a()",
      "except OSError: pass",
      "try:",
      "    a()",
      "except KeyError as erreur:",
      "    raise Autre() from erreur",
    ].join("\n");
    expect(genres(signauxPython("f.py", code))).toEqual(["capture:3", "capture:7", "capture:12"]);
  });
});

describe("compteurs", () => {
  it.each([
    ["les seize schémas", "seize schémas"],
    ["Les 70 exemples", "70 exemples"],
    ["dix-sept schémas", "dix-sept schémas"],
    ["trois cas limites", "trois cas limites"],
  ])("« %s » est relevé", (ligne, attendu) => {
    expect(compteurDans(ligne)).toBe(attendu);
  });

  it.each(["un schéma", "chaque exemple", "70 ms", "§5 tirage"])("« %s » ne l'est pas", (ligne) => {
    expect(compteurDans(ligne)).toBeNull();
  });
});

describe("rapport", () => {
  it("un fichier est long au-delà du seuil, le saut de ligne final ne comptant pas", () => {
    const juste = "a();\n".repeat(SEUIL_FICHIER_LIGNES);
    expect(nombreDeLignes(juste)).toBe(SEUIL_FICHIER_LIGNES);
    expect(signauxDe({ chemin: "f.ts", contenu: juste })).toEqual([]);
    expect(genres(signauxDe({ chemin: "f.ts", contenu: `${juste}a();\n` }))).toEqual(["fichier-long:1"]);
  });

  it("un fichier qui n'est ni TypeScript ni Python ne donne aucun signal", () => {
    expect(signauxDe({ chemin: "notes.md", contenu: "x ?? 0\n".repeat(500) })).toEqual([]);
  });

  it("compte production et tests, ne détaille que la production par défaut", () => {
    const sources = [
      { chemin: "pipeline/a.ts", contenu: "const a = x as string;\n" },
      { chemin: "tests/a.test.ts", contenu: "const b = y as number;\n" },
    ];
    const court = rapport(sources, false);
    expect(court).toContain("| Conversions de type `as` (hors `as const`) | 1 | 1 |");
    expect(court).toContain("- `pipeline/a.ts:1` — as string");
    expect(court).not.toContain("tests/a.test.ts:1");
    expect(rapport(sources, true)).toContain("- `tests/a.test.ts:1` — as number");
  });

  it("est déterministe : même rapport quel que soit l'ordre des fichiers", () => {
    const a = { chemin: "b.ts", contenu: "const a = x as string;\n" };
    const b = { chemin: "a.ts", contenu: "const b = y ?? 0;\n" };
    expect(rapport([a, b], false)).toBe(rapport([b, a], false));
  });

  it("un détail sur plusieurs lignes est ramené à une ligne et coupé", () => {
    expect(detailSurUneLigne("as {\n  a: string;\n}")).toBe("as { a: string; }");
    expect(detailSurUneLigne("x".repeat(200))).toHaveLength(90);
  });
});
