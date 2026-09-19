// Exactement deux règles, en erreur : complexité cyclomatique (McCabe) et cognitive. Pas de
// preset « recommended », pas de règle de style — décision du 2026-09-18 (docs/DETTE.md,
// « Règle de complexité »). Le parser typescript-eslint ne sert qu'à lire la syntaxe TypeScript :
// aucune règle de ce plugin n'est activée.
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

export default [
  {
    ignores: ["node_modules/**", "validation/client/dist/**", ".claude/worktrees/**"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      sonarjs,
    },
    rules: {
      complexity: ["error", { max: 9 }],
      "sonarjs/cognitive-complexity": ["error", 15],
    },
  },
];
