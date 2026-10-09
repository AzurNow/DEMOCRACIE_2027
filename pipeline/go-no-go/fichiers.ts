/**
 * Lecture et écriture des deux fichiers que le go/no-go touche : `run.json` et `checklist.json`.
 * Écriture par un fichier temporaire créé en exclusif, synchronisé, puis renommé : un fichier n'est
 * jamais à moitié écrit. Même procédé que `pipeline/notation/inscription-contrefactuel.ts`.
 */

import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { join } from "node:path";

export function cheminChecklist(repertoire_run: string): string {
  return join(repertoire_run, "checklist.json");
}

export function lireJson(chemin: string): unknown {
  return JSON.parse(readFileSync(chemin, "utf8"));
}

export function ecrireParRenommage(chemin: string, valeur: unknown): void {
  const temporaire = `${chemin}.go-no-go`;
  const descripteur = openSync(temporaire, "wx");
  try {
    writeSync(descripteur, `${JSON.stringify(valeur, null, 2)}\n`);
    fsyncSync(descripteur);
  } finally {
    closeSync(descripteur);
  }
  renameSync(temporaire, chemin);
}
