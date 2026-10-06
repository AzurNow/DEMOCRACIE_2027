/**
 * Aides des tests de la chaîne de notation simulée (`pipeline/notation/chaine.ts`,
 * `notation-simulee.ts`) : le run de référence de `pnpm run:dry`, préparé sous un répertoire
 * temporaire, et les paramètres de `tests/notation/fixtures/notation-dry/`.
 *
 * Jamais sous `runs/` du dépôt : `mkdtemp` sous `os.tmpdir()`.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { Juge } from "../../pipeline/notation/juge.ts";
import type { ChargeJuge } from "../../pipeline/notation/charge-juge.ts";
import {
  lireParametresNotationSimulee,
  type OptionsNotationSimulee,
  type ParametresNotationSimulee,
} from "../../pipeline/notation/notation-simulee.ts";
import type { BiaisSimule } from "../../pipeline/notation/juge-simule.ts";

export const FIXTURES_INTERROGATION = join(import.meta.dirname, "../interrogation/fixtures/run-simule");
export const FIXTURES_NOTATION = join(import.meta.dirname, "fixtures/notation-dry");

const sorties: string[] = [];

export function nouvelleSortie(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-notation-dry-test-"));
  sorties.push(chemin);
  return chemin;
}

export function nettoyerSorties(): void {
  for (const chemin of sorties.splice(0)) rmSync(chemin, { recursive: true, force: true });
}

export function options(sortie: string): OptionsNotationSimulee {
  return { sortie, fixtures_interrogation: FIXTURES_INTERROGATION, fixtures_notation: FIXTURES_NOTATION };
}

export function parametresDeReference(): ParametresNotationSimulee {
  return lireParametresNotationSimulee(join(FIXTURES_NOTATION, "notation-simulee.json"));
}

/** Les paramètres de référence, avec un biais posé sur certains juges. */
export function avecBiais(biais: Readonly<Record<string, BiaisSimule>>): ParametresNotationSimulee {
  const reference = parametresDeReference();
  return {
    ...reference,
    juge_simule: {
      ...reference.juge_simule,
      juges: reference.juge_simule.juges.map((juge) => {
        const pose = biais[juge.juge_id];
        return pose === undefined ? juge : { ...juge, biais: pose };
      }),
    },
  };
}

export interface Appel {
  readonly juge_id: string;
  readonly charge: ChargeJuge;
}

/** Les juges reçus, qui consignent chaque charge, dans l'ordre des appels. */
export function enregistreurs(juges: readonly Juge[], appels: Appel[], avant?: (appel: Appel) => void): readonly Juge[] {
  return juges.map((juge) => ({
    identite: juge.identite,
    noter: (charge: ChargeJuge) => {
      const appel = { juge_id: juge.identite.juge_id, charge };
      if (avant !== undefined) avant(appel);
      appels.push(appel);
      return juge.noter(charge);
    },
  }));
}

/** Chemin relatif → empreinte du contenu et date de modification, pour tout fichier sous `racine`. */
export function instantane(racine: string): ReadonlyMap<string, string> {
  const fichiers = new Map<string, string>();
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) parcourir(chemin);
      else fichiers.set(relative(racine, chemin), `${createHash("sha256").update(readFileSync(chemin)).digest("hex")} ${statSync(chemin).mtimeMs}`);
    }
  };
  parcourir(racine);
  return fichiers;
}

/** Le contenu de chaque fichier d'un dossier, par nom. */
export function contenus(dossier: string): ReadonlyMap<string, string> {
  return new Map(readdirSync(dossier).sort().map((nom) => [nom, readFileSync(join(dossier, nom), "utf8")]));
}
