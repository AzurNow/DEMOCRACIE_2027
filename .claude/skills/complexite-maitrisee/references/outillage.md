# Outillage

Rien de ce qui suit n'est installé. Chaque bloc est un ajout de dépendance, donc une décision de
l'auteur (`CLAUDE.md`, « Arrêt obligatoire »). Les extraits sont prêts à coller le jour où la chaîne
d'outils existera.

## TypeScript — règle `complexity` d'ESLint

Seuil à 9 : la règle ESLint signale **au-dessus** de `max`, donc `max: 9` refuse 10 et laisse passer
9, ce qui est exactement « strictement sous 10 ».

```js
// eslint.config.js
export default [
  {
    rules: {
      complexity: ["error", { max: 9 }],
    },
  },
];
```

`error` et non `warn` : un avertissement qui ne casse pas le build n'est pas une règle, c'est un
souhait.

## TypeScript — complexité cognitive

Seconde règle, bloquante elle aussi, via `eslint-plugin-sonarjs`. Elle mesure autre chose : McCabe
compte les chemins, la cognitive compte ce qu'il faut tenir en tête. Une répartition plate et
exhaustive sur les six gabarits marque 1 en cognitive et 7 en McCabe ; trois `if` imbriqués marquent
6 en cognitive et 4 en McCabe. Prises ensemble, elles attrapent des défauts disjoints — et la
seconde protège l'idiome que `CLAUDE.md` réclame, le cas particulier traité en donnée plutôt qu'en
branche.

```js
// eslint.config.js
import sonarjs from "eslint-plugin-sonarjs";

export default [
  {
    plugins: { sonarjs },
    rules: {
      complexity: ["error", { max: 9 }],
      "sonarjs/cognitive-complexity": ["error", 15],
    },
  },
];
```

Côté Python, il n'existe pas d'équivalent officiel dans Ruff ; `flake8-cognitive-complexity` fait le
travail si l'on tient à la parité, sinon `C901` seul suffit pour le pipeline, dont les fonctions
sont plus plates que celles du site.

## Python — `C901` de Ruff

Ruff signale quand la complexité est **strictement supérieure** à `max-complexity`, donc la même
valeur de 9.

```toml
# pyproject.toml
[tool.ruff.lint]
select = ["C90"]

[tool.ruff.lint.mccabe]
max-complexity = 9
```

## Brancher sur `pnpm check`

`CLAUDE.md` promet que `pnpm check` couvre « types + lint + validation des schémas ». Les deux règles
ci-dessus appartiennent au lot `lint`, et elles doivent être bloquantes au même titre que les tests
de symétrie : une règle de qualité qu'on peut ignorer ne tient pas six mois.

Le même `pnpm check` devra aussi faire tourner la validation des 40 exemples de `schema/exemples/`
contre leur manifeste — c'est le point 3 de `docs/DETTE.md`, et les deux travaux se font bien
ensemble puisqu'ils supposent la même décision : choisir la chaîne d'outils.

## Mesurer à la main, en attendant

Compter sur le corps de la fonction : `1` de base, puis `+1` pour chacun de

- `if`, `else if` (mais pas `else` seul)
- `for`, `while`, `do`, chaque compréhension avec condition
- `case` d'un `switch` (chaque `case`, pas le `switch`)
- `catch`
- chaque `&&`, `||`, `??` dans une condition
- chaque ternaire
- chaque garde d'un `match` / pattern matching

Exemple, une fonction à `1 + 3 if + 1 for + 2 &&` vaut 7 : conforme, mais proche. Au-delà de 7, ne
pas attendre le linter — c'est le moment de regarder si un cas particulier ne devrait pas être une
donnée.

## Python disponible localement

`jsonschema` 4.26 est déjà présent sur le poste de développement et a servi à valider les schémas
sans rien ajouter au dépôt. Aucun outil de complexité n'y est installé ; si un contrôle ponctuel est
nécessaire avant que la chaîne existe, le faire à la main plutôt que d'installer quoi que ce soit.
