/**
 * Règle 3 de `CLAUDE.md`, rendue vérifiable (lot contestation-notification, V1) : « aucun script,
 * aucun agent, aucune migration n'écrit dans `data/items/` directement ». Un seul module y écrit,
 * `validation/io/data-items.ts`, derrière ses contrôles (schéma, ajout seul, empreinte du fichier
 * lu). Aucun autre fichier de `outils/`, `pipeline/`, `validation/` ni `analysis/` ne combine une
 * écriture disque et le chemin `data/items`.
 *
 * Le contrôle est textuel, donc grossier : il attrape l'écriture directe, pas un chemin reconstruit
 * morceau par morceau. C'est un filet, pas une preuve ; la preuve reste la relecture.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(import.meta.dirname, "..");
const REPERTOIRES = ["outils", "pipeline", "validation", "analysis"];
const SEUL_ECRIVAIN = "validation/io/data-items.ts";
const IGNORES = new Set(["node_modules", "dist", "__pycache__"]);

const ECRITURE_TS =
  /\b(writeFileSync|appendFileSync|renameSync|linkSync|symlinkSync|copyFileSync|cpSync|rmSync|unlinkSync|mkdirSync|createWriteStream|writeFile|appendFile)\s*\(/;
const ECRITURE_PY = /\bopen\([^\n]*,\s*(mode\s*=\s*)?["'][rbt]*[wax+][rwxabt+]*["']|\.write_(text|bytes)\(|\bos\.(replace|rename|remove|unlink)\(|\bshutil\.(copy\w*|move)\(/;
const CHEMIN_DATA = /data\/items|["']data["']\s*,\s*["']items["']/;

function fichiersSources(repertoire: string): readonly string[] {
  const trouves: string[] = [];
  for (const nom of readdirSync(repertoire)) {
    if (IGNORES.has(nom)) continue;
    const chemin = join(repertoire, nom);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersSources(chemin));
    else if (/\.(ts|py)$/.test(nom)) trouves.push(chemin);
  }
  return trouves;
}

export function ecritDansData(chemin: string, contenu: string): boolean {
  const ecriture = chemin.endsWith(".py") ? ECRITURE_PY : ECRITURE_TS;
  return ecriture.test(contenu) && CHEMIN_DATA.test(contenu);
}

describe("détecteur", () => {
  it("attrape une écriture directe vers data/items, en TypeScript comme en Python", () => {
    expect(ecritDansData("x.ts", 'writeFileSync(join("data/items", nom), texte)')).toBe(true);
    expect(ecritDansData("x.ts", 'const d = join(racine, "data", "items"); renameSync(a, d)')).toBe(true);
    expect(ecritDansData("x.py", 'open(Path("data/items") / nom, "w")')).toBe(true);
    expect(ecritDansData("x.py", 'Path("data/items/x.json").write_text(s)')).toBe(true);
  });

  it("laisse passer une lecture de data/items, et une écriture ailleurs", () => {
    expect(ecritDansData("x.ts", 'readFileSync(join("data/items", nom), "utf8")')).toBe(false);
    expect(ecritDansData("x.ts", 'writeFileSync(join("staging/items", nom), texte)')).toBe(false);
    expect(ecritDansData("x.py", 'open(Path("data/items") / nom, encoding="utf-8")')).toBe(false);
  });
});

describe("règle 3 : un seul module écrit dans data/items", () => {
  const fichiers = REPERTOIRES.flatMap((repertoire) => fichiersSources(join(RACINE, repertoire)));

  it("le balayage porte sur des fichiers réels", () => {
    expect(fichiers.length).toBeGreaterThan(50);
    expect(fichiers.map((chemin) => relative(RACINE, chemin))).toContain(SEUL_ECRIVAIN);
  });

  it("le seul écrivain écrit bien sur disque (sinon le contrôle ne dit rien)", () => {
    expect(ECRITURE_TS.test(readFileSync(join(RACINE, SEUL_ECRIVAIN), "utf8"))).toBe(true);
  });

  it("aucun autre fichier ne combine écriture disque et chemin data/items", () => {
    const fautifs = fichiers
      .filter((chemin) => relative(RACINE, chemin) !== SEUL_ECRIVAIN)
      .filter((chemin) => ecritDansData(chemin, readFileSync(chemin, "utf8")))
      .map((chemin) => relative(RACINE, chemin));
    expect(fautifs).toEqual([]);
  });
});
