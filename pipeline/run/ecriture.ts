/**
 * L'écriture d'un `run.json` déjà fusionné et validé par l'appelant : un fichier temporaire créé en
 * exclusif, synchronisé, puis renommé. `run.json` n'est jamais à moitié écrit ; un temporaire
 * laissé par une écriture interrompue fait échouer la suivante plutôt que d'être écrasé.
 *
 * Partagée par l'inscription du test contrefactuel (`pipeline/notation/inscription-contrefactuel.ts`)
 * et l'invalidation (`invalidation.ts`) ; `suffixe` nomme le temporaire de chacune.
 */

import { closeSync, fsyncSync, openSync, renameSync, writeSync } from "node:fs";

export function ecrireParRenommage(chemin: string, valeur: unknown, suffixe: string): void {
  const temporaire = `${chemin}.${suffixe}`;
  const descripteur = openSync(temporaire, "wx");
  try {
    writeSync(descripteur, `${JSON.stringify(valeur, null, 2)}\n`);
    fsyncSync(descripteur);
  } finally {
    closeSync(descripteur);
  }
  renameSync(temporaire, chemin);
}
