/**
 * Règle 3 de `CLAUDE.md`, rendue vérifiable (lot contestation-notification, V1, étendu à
 * `data/mesures/` par la décision D38) : « aucun script, aucun agent, aucune migration n'écrit dans
 * `data/` directement ». Un seul module écrit dans chaque répertoire protégé, derrière ses contrôles
 * (schéma, ajout seul, empreinte du fichier lu) : `validation/io/data-items.ts` pour `data/items`,
 * `validation/io/data-mesures.ts` pour `data/mesures`, `validation/io/data-formulations.ts` pour
 * `data/formulations` (décision D39). Aucun autre fichier de `outils/`,
 * `pipeline/`, `validation/` ni `analysis/` ne combine une écriture disque et le chemin d'un
 * répertoire protégé, et un écrivain n'est autorisé que pour le sien. Ajouter un répertoire
 * protégé, c'est ajouter une ligne à `PROTEGES`.
 *
 * Le contrôle est textuel, donc grossier : il attrape l'écriture directe, pas un chemin reconstruit
 * morceau par morceau. C'est un filet, pas une preuve ; la preuve reste la relecture.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(import.meta.dirname, "..");
const REPERTOIRES = ["outils", "pipeline", "validation", "analysis"];
const IGNORES = new Set(["node_modules", "dist", "__pycache__"]);

interface Protege {
  readonly repertoire: string;
  readonly ecrivain: string;
  readonly chemin: RegExp;
}

/** Répertoire protégé → seul écrivain autorisé. Des données : aucun cas particulier dans le code. */
const PROTEGES: readonly Protege[] = [
  { repertoire: "data/items", ecrivain: "validation/io/data-items.ts", chemin: /data\/items|["']data["']\s*,\s*["']items["']/ },
  { repertoire: "data/mesures", ecrivain: "validation/io/data-mesures.ts", chemin: /data\/mesures|["']data["']\s*,\s*["']mesures["']/ },
  // Décision D39 : seule la relecture des formulations promeut vers data/formulations, par ce module.
  {
    repertoire: "data/formulations",
    ecrivain: "validation/io/data-formulations.ts",
    chemin: /data\/formulations|["']data["']\s*,\s*["']formulations["']/,
  },
];

const ECRITURE_TS =
  /\b(writeFileSync|appendFileSync|renameSync|linkSync|symlinkSync|copyFileSync|cpSync|rmSync|unlinkSync|mkdirSync|createWriteStream|writeFile|appendFile)\s*\(/;
const ECRITURE_PY = /\bopen\([^\n]*,\s*(mode\s*=\s*)?["'][rbt]*[wax+][rwxabt+]*["']|\.write_(text|bytes)\(|\bos\.(replace|rename|remove|unlink)\(|\bshutil\.(copy\w*|move)\(/;

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

/** Les répertoires protégés que ce contenu écrit (écriture disque et chemin du répertoire). */
export function repertoiresEcrits(chemin: string, contenu: string): readonly string[] {
  const ecriture = chemin.endsWith(".py") ? ECRITURE_PY : ECRITURE_TS;
  if (!ecriture.test(contenu)) return [];
  return PROTEGES.filter((protege) => protege.chemin.test(contenu)).map((protege) => protege.repertoire);
}

export function ecritDansData(chemin: string, contenu: string): boolean {
  return repertoiresEcrits(chemin, contenu).length > 0;
}

/** Les répertoires qu'un fichier écrit sans en être l'écrivain déclaré. */
function ecrituresInterdites(chemin: string, contenu: string): readonly string[] {
  return repertoiresEcrits(chemin, contenu).filter(
    (repertoire) => PROTEGES.find((protege) => protege.repertoire === repertoire)?.ecrivain !== chemin,
  );
}

describe("détecteur", () => {
  it("attrape une écriture directe vers data/items, en TypeScript comme en Python", () => {
    expect(ecritDansData("x.ts", 'writeFileSync(join("data/items", nom), texte)')).toBe(true);
    expect(ecritDansData("x.ts", 'const d = join(racine, "data", "items"); renameSync(a, d)')).toBe(true);
    expect(ecritDansData("x.py", 'open(Path("data/items") / nom, "w")')).toBe(true);
    expect(ecritDansData("x.py", 'Path("data/items/x.json").write_text(s)')).toBe(true);
  });

  it("attrape une écriture directe vers data/mesures, en TypeScript comme en Python", () => {
    expect(ecritDansData("x.ts", 'writeFileSync(join("data/mesures", nom), texte)')).toBe(true);
    expect(ecritDansData("x.ts", 'const d = join(racine, "data", "mesures"); renameSync(a, d)')).toBe(true);
    expect(ecritDansData("x.py", 'open(Path("data/mesures") / nom, "w")')).toBe(true);
    expect(ecritDansData("x.py", 'Path("data/mesures/x.json").write_text(s)')).toBe(true);
  });

  it("laisse passer une lecture de data/items, et une écriture ailleurs", () => {
    expect(ecritDansData("x.ts", 'readFileSync(join("data/items", nom), "utf8")')).toBe(false);
    expect(ecritDansData("x.ts", 'writeFileSync(join("staging/items", nom), texte)')).toBe(false);
    expect(ecritDansData("x.py", 'open(Path("data/items") / nom, encoding="utf-8")')).toBe(false);
  });

  it("laisse passer une lecture de data/mesures, et une écriture dans staging/mesures", () => {
    expect(ecritDansData("x.ts", 'readFileSync(join("data/mesures", nom), "utf8")')).toBe(false);
    expect(ecritDansData("x.ts", 'writeFileSync(join("staging/mesures", nom), texte)')).toBe(false);
    expect(ecritDansData("x.py", 'open(Path("data/mesures") / nom, encoding="utf-8")')).toBe(false);
  });

  it("cas limite 10 : data/formulations a un seul écrivain déclaré, et toute autre écriture y est attrapée", () => {
    const ecrivains = PROTEGES.filter((protege) => protege.repertoire === "data/formulations").map((protege) => protege.ecrivain);
    expect(ecrivains).toEqual(["validation/io/data-formulations.ts"]);
    const versFormulations = 'writeFileSync(join("data/formulations", nom), texte)';
    expect(ecritDansData("x.ts", versFormulations)).toBe(true);
    expect(ecritDansData("x.ts", 'const d = join(racine, "data", "formulations"); renameSync(a, d)')).toBe(true);
    expect(ecritDansData("x.py", 'Path("data/formulations/q.json").write_text(s)')).toBe(true);
    expect(ecritDansData("x.ts", 'readFileSync(join("data/formulations", nom), "utf8")')).toBe(false);
    expect(ecrituresInterdites("validation/io/data-formulations.ts", versFormulations)).toEqual([]);
    expect(ecrituresInterdites("validation/serveur/formulations.ts", versFormulations)).toEqual(["data/formulations"]);
    expect(ecrituresInterdites("validation/io/data-mesures.ts", versFormulations)).toEqual(["data/formulations"]);
  });

  it("un écrivain n'est autorisé que pour son propre répertoire", () => {
    const [items, mesures] = PROTEGES.map((protege) => protege.ecrivain) as [string, string];
    const versMesures = 'writeFileSync(join("data/mesures", nom), texte)';
    const versItems = 'writeFileSync(join("data/items", nom), texte)';
    expect(ecrituresInterdites(items, versItems)).toEqual([]);
    expect(ecrituresInterdites(mesures, versMesures)).toEqual([]);
    expect(ecrituresInterdites(items, versMesures)).toEqual(["data/mesures"]);
    expect(ecrituresInterdites(mesures, versItems)).toEqual(["data/items"]);
    expect(ecrituresInterdites("outils/x.ts", versItems + versMesures)).toEqual(["data/items", "data/mesures"]);
  });
});

describe("règle 3 : un seul module écrit dans chaque répertoire de data/", () => {
  const fichiers = REPERTOIRES.flatMap((repertoire) => fichiersSources(join(RACINE, repertoire)));

  it("le balayage porte sur des fichiers réels", () => {
    expect(fichiers.length).toBeGreaterThan(50);
    const relatifs = fichiers.map((chemin) => relative(RACINE, chemin));
    for (const { ecrivain } of PROTEGES) expect(relatifs).toContain(ecrivain);
  });

  it.each(PROTEGES)("l'écrivain de $repertoire écrit bien sur disque vers $repertoire", (protege) => {
    const contenu = readFileSync(join(RACINE, protege.ecrivain), "utf8");
    expect(repertoiresEcrits(protege.ecrivain, contenu)).toContain(protege.repertoire);
  });

  it("aucun fichier n'écrit dans un répertoire protégé sans en être l'écrivain", () => {
    const fautifs = fichiers
      .map((chemin) => relative(RACINE, chemin))
      .map((chemin) => ({ chemin, ecrits: ecrituresInterdites(chemin, readFileSync(join(RACINE, chemin), "utf8")) }))
      .filter(({ ecrits }) => ecrits.length > 0);
    expect(fautifs).toEqual([]);
  });
});
