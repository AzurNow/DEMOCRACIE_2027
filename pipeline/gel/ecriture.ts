/**
 * L'écriture du gel, tout ou rien : les trois fichiers du run sont écrits dans un répertoire
 * temporaire voisin, puis ce répertoire est renommé en `<date>/` d'un seul geste. Une erreur à
 * l'écriture de l'un d'eux supprime le temporaire : aucun fichier du run n'apparaît, ni partiel ni
 * complet. Un arrêt brutal laisse au plus le temporaire `.gel-<date>-*` dans le parent, jamais un
 * répertoire de run à moitié écrit ; sous `runs/`, ce temporaire rend le dépôt sale, et le gel
 * suivant est refusé tant qu'un humain ne l'a pas examiné.
 *
 * Mince par construction : le contenu vient de `assemblage.ts`, la destination de
 * `destination.ts`. Ce module ne connaît aucun chemin de `data/`.
 */

import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FichierDuGel } from "./assemblage.ts";
import { exigerAbsent } from "./destination.ts";
import type { Destination } from "./destination.ts";

/** Écrit un fichier qui n'existe pas encore ; injectable pour éprouver l'écriture tout ou rien. */
export type EcrireFichier = (chemin: string, texte: string) => void;

/** L'écriture réelle : création exclusive, jamais un remplacement. */
export const ecrireExclusif: EcrireFichier = (chemin, texte) => {
  writeFileSync(chemin, texte, { encoding: "utf8", flag: "wx" });
};

/** Écrit les fichiers dans `destination.chemin`, tous ou aucun. Rend le chemin du run. */
export function ecrireToutOuRien(destination: Destination, fichiers: readonly FichierDuGel[], ecrire: EcrireFichier): string {
  mkdirSync(destination.parent, { recursive: true });
  const temporaire = mkdtempSync(join(destination.parent, `.gel-${destination.nom}-`));
  let pose = false;
  try {
    for (const fichier of fichiers) ecrire(join(temporaire, fichier.nom), fichier.texte);
    exigerAbsent(destination.chemin);
    renameSync(temporaire, destination.chemin);
    pose = true;
  } finally {
    if (!pose) rmSync(temporaire, { recursive: true, force: true });
  }
  return destination.chemin;
}
