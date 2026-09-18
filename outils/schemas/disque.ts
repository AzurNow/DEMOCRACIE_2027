import { readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative, sep } from "node:path";

const NOM_MANIFESTE = "manifeste.json";

function estFichierJson(entree: Dirent): boolean {
  return entree.isFile() && entree.name.endsWith(".json");
}

function cheminRelatifPosix(racineExemples: string, entree: Dirent): string {
  const cheminAbsolu = join(entree.parentPath, entree.name);
  return relative(racineExemples, cheminAbsolu).split(sep).join("/");
}

/**
 * Tous les fichiers `*.json` sous `schema/exemples/`, chemin relatif en style POSIX, manifeste
 * exclu. Sert au contrôle inverse du manifeste (cas limite 4) : un fichier sur le disque que le
 * manifeste ne mentionne pas.
 */
export function listerFichiersExemplesSurDisque(racineExemples: string): readonly string[] {
  const entrees = readdirSync(racineExemples, { recursive: true, withFileTypes: true });
  const chemins = entrees
    .filter(estFichierJson)
    .map((entree) => cheminRelatifPosix(racineExemples, entree))
    .filter((chemin) => chemin !== NOM_MANIFESTE);
  return [...chemins].sort();
}
