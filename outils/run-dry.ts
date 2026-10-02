/**
 * `pnpm run:dry` — un run d'interrogation complet en mode simulé : aucun appel réseau, aucun SDK.
 *
 *   pnpm run:dry                     écrit dans un répertoire temporaire neuf
 *   pnpm run:dry --sortie <chemin>   écrit sous <chemin> (relancer sur le même chemin reprend le run)
 *
 * Jamais dans `runs/` par défaut : un run simulé n'est pas un run. Chaque réponse est validée contre
 * `schema/reponse.schema.json` au moment de son écriture ; le bilan imprimé est relu du disque.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { LigneBilan } from "../pipeline/interrogation/bilan.ts";
import { lancerRunSimule } from "../pipeline/interrogation/run-simule.ts";

const FIXTURES = resolve(import.meta.dirname, "../tests/interrogation/fixtures/run-simule");

/** `--sortie <chemin>` ou `--sortie=<chemin>` ; absent, un répertoire temporaire neuf. */
function sortieDemandee(argv: readonly string[]): string {
  const rang = argv.findIndex((a) => a === "--sortie" || a.startsWith("--sortie="));
  if (rang === -1) return mkdtempSync(join(tmpdir(), "banc-run-dry-"));
  const argument = argv[rang] as string;
  const valeur = argument === "--sortie" ? argv[rang + 1] : argument.slice("--sortie=".length);
  if (valeur === undefined || valeur.length === 0 || valeur.startsWith("--")) {
    throw new Error("--sortie attend un chemin.");
  }
  return resolve(valeur);
}

function pourcentage(ligne: LigneBilan): string {
  const { valeur } = ligne.part_manquantes;
  return valeur === undefined ? "indéfini" : `${(valeur * 100).toFixed(1)} %`;
}

function imprimerLigne(ligne: LigneBilan): void {
  const incomplet = ligne.run_incomplet ? "  RUN INCOMPLET (§8, > 20 %)" : "";
  process.stdout.write(
    `  ${ligne.outil_id.padEnd(14)} ${ligne.mode.padEnd(15)} obtenues ${String(ligne.obtenues).padStart(3)}` +
      ` (dont refus API ${String(ligne.refus_api).padStart(2)})` +
      `  manquantes : échecs ${String(ligne.manquantes_echecs).padStart(2)}, hors fenêtre ${String(ligne.manquantes_hors_fenetre).padStart(2)}` +
      `  taux de manquantes ${ligne.part_manquantes.numerateur}/${ligne.part_manquantes.denominateur} = ${pourcentage(ligne)}${incomplet}\n`,
  );
}

async function principal(): Promise<void> {
  const sortie = sortieDemandee(process.argv.slice(2));
  const resultat = await lancerRunSimule({ sortie, fixtures: FIXTURES });
  process.stdout.write(`Run simulé (aucun appel réseau) — ${resultat.disposition.run}\n`);
  process.stdout.write(
    `Requêtes : ${resultat.execution.ecrites} écrites, ${resultat.execution.deja_ecrites} déjà écrites (reprise).\n`,
  );
  process.stdout.write("Bilan par outil × mode :\n");
  resultat.bilan.forEach(imprimerLigne);
}

await principal();
