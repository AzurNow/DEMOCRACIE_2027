/**
 * Les items reçus par `pnpm symmetry` sont-ils ceux du gel ? (conformité du 2026-09-29, n° 9 ;
 * `docs/DETTE.md`, 2026-09-28, point 2.)
 *
 * La barrière recalcule la référence de complétude — les questions engendrées au gel — sur les items
 * qu'on lui passe. Un sous-ensemble d'items réduirait cette référence dans la même proportion, et un
 * tirage fautif repasserait au vert. Décision de l'auteur du 2026-10-01 : le répertoire `--items` est
 * recoupé, fichier par fichier, avec ce même répertoire tel qu'il était au commit que le run inscrit au
 * gel (`run.versions.donnees_commit`). Le run doit donc porter ce commit dès le gel.
 *
 * La comparaison passe par les empreintes Git des fichiers (`git hash-object`, filtres du dépôt
 * appliqués, contre `git ls-tree` au commit) : mêmes noms, mêmes contenus, ni plus ni moins. Git est
 * lu en local ; rien ne sort de la machine.
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

/** Les items reçus ne sont pas ceux du gel, ou le gel ne peut pas être relu : la barrière ne juge pas. */
export class ItemsHorsDuGel extends Error {
  readonly ecarts: readonly string[];

  constructor(repertoire: string, ecarts: readonly string[]) {
    super(
      `Les items de ${repertoire} ne sont pas ceux du gel : ${ecarts.join(" ; ")}. La référence des ` +
        `questions engendrées au gel se calcule sur les items du gel, et sur eux seuls (§5).`,
    );
    this.name = "ItemsHorsDuGel";
    this.ecarts = ecarts;
  }
}

interface SortieGit {
  readonly ok: boolean;
  readonly sortie: string;
  readonly erreur: string;
}

function git(repertoire: string, arguments_: readonly string[]): SortieGit {
  const resultat = spawnSync("git", arguments_, { cwd: repertoire, encoding: "utf8" });
  return { ok: resultat.status === 0, sortie: resultat.stdout, erreur: resultat.stderr.trim() };
}

/** Nom de fichier → empreinte Git, pour les `*.json` directement sous le répertoire. */
export type Empreintes = ReadonlyMap<string, string>;

/** Le chemin du répertoire dans son dépôt (`data/items/`), ou le refus nommé s'il est hors d'un dépôt. */
function prefixeDansLeDepot(repertoire: string): string {
  const prefixe = git(repertoire, ["rev-parse", "--show-prefix"]);
  if (!prefixe.ok) throw new ItemsHorsDuGel(repertoire, [`répertoire hors d'un dépôt Git (${prefixe.erreur})`]);
  return prefixe.sortie.trim();
}

function exigerCommit(repertoire: string, commit: string): void {
  if (git(repertoire, ["cat-file", "-e", `${commit}^{commit}`]).ok) return;
  throw new ItemsHorsDuGel(repertoire, [`le commit ${commit} inscrit au gel est introuvable dans ce dépôt`]);
}

/** `git ls-tree -z --full-tree <commit> -- <prefixe>` : `mode type empreinte\tchemin`, séparés par NUL. */
function empreintesAuGel(repertoire: string, commit: string, prefixe: string): Empreintes {
  // --full-tree : le chemin passé et les chemins rendus partent de la racine du dépôt, pas du répertoire.
  const liste = git(repertoire, ["ls-tree", "-z", "--full-tree", commit, "--", prefixe.length === 0 ? "." : prefixe]);
  if (!liste.ok) throw new ItemsHorsDuGel(repertoire, [`lecture du commit ${commit} impossible (${liste.erreur})`]);
  const empreintes = new Map<string, string>();
  for (const ligne of liste.sortie.split("\0")) {
    const [entete, chemin] = ligne.split("\t");
    if (entete === undefined || chemin === undefined) continue;
    const [, type, empreinte] = entete.split(" ");
    const nom = chemin.slice(prefixe.length);
    if (type === "blob" && empreinte !== undefined && nom.endsWith(".json")) empreintes.set(nom, empreinte);
  }
  return empreintes;
}

/** Les empreintes des fichiers reçus, calculées comme Git les aurait commités. */
function empreintesRecues(repertoire: string): Empreintes {
  const noms = readdirSync(repertoire)
    .filter((nom) => nom.endsWith(".json"))
    .sort();
  if (noms.length === 0) return new Map();
  const calcul = git(repertoire, ["hash-object", "--", ...noms]);
  if (!calcul.ok) throw new ItemsHorsDuGel(repertoire, [`empreintes des fichiers reçus incalculables (${calcul.erreur})`]);
  const empreintes = calcul.sortie.trim().split("\n");
  if (empreintes.length !== noms.length) {
    throw new ItemsHorsDuGel(repertoire, [`${empreintes.length} empreinte(s) rendue(s) pour ${noms.length} fichier(s)`]);
  }
  return new Map(noms.map((nom, rang) => [nom, empreintes[rang] as string]));
}

/** Les écarts entre le répertoire reçu et le même répertoire au commit du gel, triés par nom. */
export function ecartsAuGel(gel: Empreintes, recues: Empreintes): readonly string[] {
  const noms = [...new Set([...gel.keys(), ...recues.keys()])].sort();
  return noms.flatMap((nom) => {
    const auGel = gel.get(nom);
    const recue = recues.get(nom);
    if (recue === undefined) return [`${nom} absent des items reçus`];
    if (auGel === undefined) return [`${nom} absent du gel`];
    return auGel === recue ? [] : [`${nom} modifié depuis le gel`];
  });
}

/**
 * Lève `ItemsHorsDuGel` si `repertoire` diffère de lui-même au commit `donnees_commit`, ou si ce
 * commit manque : un run sans commit du gel ne peut pas prouver que ses items sont ceux du gel.
 */
export function exigerItemsDuGel(repertoire: string, donnees_commit: string | undefined): void {
  if (donnees_commit === undefined) {
    throw new ItemsHorsDuGel(repertoire, [
      "le run n'inscrit pas versions.donnees_commit, le commit de data/ lu au gel, auquel les comparer",
    ]);
  }
  const prefixe = prefixeDansLeDepot(repertoire);
  exigerCommit(repertoire, donnees_commit);
  const ecarts = ecartsAuGel(empreintesAuGel(repertoire, donnees_commit, prefixe), empreintesRecues(repertoire));
  if (ecarts.length > 0) throw new ItemsHorsDuGel(repertoire, ecarts);
}
