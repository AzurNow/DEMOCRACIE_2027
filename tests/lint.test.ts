/**
 * Cas limites des deux règles de complexité : un test par seuil, sur du code construit en mémoire
 * et vérifié par l'API Linter, jamais par un processus. Ces deux règles sont redéclarées ici à
 * l'identique de `eslint.config.js`, sans les règles typées (D9), qui exigent un projet TypeScript.
 */

import { Linter } from "eslint";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

describe("règles ESLint : complexité cyclomatique et cognitive", () => {
  const configuration: Linter.Config = {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs },
    rules: {
      complexity: ["error", { max: 9 }],
      "sonarjs/cognitive-complexity": ["error", 15],
    },
  };

  function verifier(code: string): readonly string[] {
    const linter = new Linter();
    return linter.verify(code, configuration, { filename: "sondage.ts" }).map((message) => message.ruleId ?? "");
  }

  function fonctionAvecNIfsAPlat(nombreDeIf: number): string {
    const corps = Array.from({ length: nombreDeIf }, (_, index) => `if (x === ${index}) return ${index};`).join(" ");
    return `function f(x: number) { ${corps} return -1; }`;
  }

  it("9. une fonction à dix branches est refusée, à neuf branches acceptée (complexité cyclomatique)", () => {
    expect(verifier(fonctionAvecNIfsAPlat(8))).toEqual([]); // 1 + 8 if = 9 : accepté
    expect(verifier(fonctionAvecNIfsAPlat(9))).toContain("complexity"); // 1 + 9 if = 10 : refusé
  });

  it("10. cognitive 16 est refusée, 15 est acceptée", () => {
    // Cinq `if` imbriqués : 1+2+3+4+5 = 15, accepté.
    const cognitive15 =
      "function f(x: number) { if (x===0) { if (x===1) { if (x===2) { if (x===3) { " +
      "if (x===4) { return 1; } } } } } return 0; }";
    // Un sixième `if`, non imbriqué (+1 seulement) : 16, refusé.
    const cognitive16 =
      "function f(x: number) { if (x===0) { if (x===1) { if (x===2) { if (x===3) { " +
      "if (x===4) { return 1; } } } } } if (x===5) { return 2; } return 0; }";

    expect(verifier(cognitive15)).toEqual([]);
    expect(verifier(cognitive16)).toContain("sonarjs/cognitive-complexity");
  });
});
