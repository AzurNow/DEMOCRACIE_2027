/**
 * Aucun fichier source suivi ne contient de caractère de contrôle écrit tel quel.
 *
 * Un NUL brut se lit comme une espace et fait classer le fichier comme binaire par Git, dont les
 * diffs disparaissent alors des PR : la dérivation de toutes les graines en a dépendu jusqu'à la
 * revue du 2026-09-23 (`docs/revues/2026-09-23.md`, constat 1). Un caractère de contrôle voulu
 * s'écrit par échappement (`\0`, `\f`), jamais en clair.
 *
 * Sont exclus les textes canoniques et les transcriptions, qui reproduisent leur source octet pour
 * octet et contiennent légitimement `\f` entre les pages d'un PDF (docs/CONTRATS.md §1.2).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = join(import.meta.dirname, "..");
const EXTENSIONS = [".ts", ".js", ".py", ".md", ".json", ".toml", ".yaml", ".yml", ".css", ".html"];
const TABULATION = 9;
const SAUT_DE_LIGNE = 10;

/** Première position d'un caractère de contrôle autre que tabulation et saut de ligne. */
export function premierControle(contenu: string): { ligne: number; code: number } | null {
  let ligne = 1;
  for (const caractere of contenu) {
    const code = caractere.codePointAt(0) as number;
    if (code === SAUT_DE_LIGNE) ligne += 1;
    else if ((code < 32 && code !== TABULATION) || code === 127) return { ligne, code };
  }
  return null;
}

function sourcesSuivies(): string[] {
  const sortie = spawnSync("git", ["ls-files", "-z"], { cwd: RACINE, encoding: "utf8" });
  if (sortie.status !== 0) throw new Error(`git ls-files a échoué : ${sortie.stderr}`);
  return sortie.stdout
    .split(String.fromCodePoint(0))
    .filter((chemin) => EXTENSIONS.some((extension) => chemin.endsWith(extension)));
}

describe("sources lisibles", () => {
  it("aucun fichier source suivi ne contient de caractère de contrôle brut", () => {
    const fautifs = sourcesSuivies().flatMap((chemin) => {
      const trouve = premierControle(readFileSync(join(RACINE, chemin), "utf8"));
      return trouve === null ? [] : [`${chemin}:${trouve.ligne} (U+${trouve.code.toString(16).padStart(4, "0")})`];
    });
    expect(fautifs).toEqual([]);
  });

  it("le détecteur voit un NUL, un saut de page et un retour chariot, et laisse passer tabulation et saut de ligne", () => {
    expect(premierControle(`a\tb${String.fromCodePoint(10)}c`)).toBeNull();
    expect(premierControle(`a${String.fromCodePoint(10)}b${String.fromCodePoint(0)}`)).toEqual({ ligne: 2, code: 0 });
    expect(premierControle(`x${String.fromCodePoint(12)}`)).toEqual({ ligne: 1, code: 12 });
    expect(premierControle(`x${String.fromCodePoint(13)}`)).toEqual({ ligne: 1, code: 13 });
  });
});
