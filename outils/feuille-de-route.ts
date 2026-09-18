/**
 * `pnpm feuille-de-route` — engendre `docs/FEUILLE-DE-ROUTE.md` depuis `docs/feuille-de-route.json`.
 *
 * Ne fait que lire le JSON, appeler le domaine (validation, graphe, rendu) et écrire le
 * Markdown. `docs/FEUILLE-DE-ROUTE.md` est un artefact généré, jamais édité à la main.
 *
 * Avec `--verifier`, la commande n'écrit rien : elle sort avec le code 1 si le Markdown sur
 * disque diffère de celui qu'elle produirait, code 0 sinon.
 *
 *   pnpm feuille-de-route
 *   pnpm feuille-de-route --verifier
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyserArguments, drapeau } from "./arguments.ts";
import { calculerEtats } from "./feuille-de-route/graphe.ts";
import { validerFeuilleDeRoute } from "./feuille-de-route/lecture.ts";
import { genererMarkdown } from "./feuille-de-route/markdown.ts";
import { estAJour } from "./feuille-de-route/verification.ts";

interface Chemins {
  readonly json: string;
  readonly markdown: string;
}

function cheminsParDefaut(): Chemins {
  const racine = resolve(import.meta.dirname, "..");
  return {
    json: resolve(racine, "docs/feuille-de-route.json"),
    markdown: resolve(racine, "docs/FEUILLE-DE-ROUTE.md"),
  };
}

function engendrerMarkdown(cheminJson: string): string {
  const brut = readFileSync(cheminJson, "utf8");
  const feuille = validerFeuilleDeRoute(JSON.parse(brut));
  const etats = calculerEtats(feuille.lots, feuille.decisions);
  return genererMarkdown(feuille, etats);
}

function verifier(cheminMarkdown: string, genere: string): void {
  const surDisque = existsSync(cheminMarkdown) ? readFileSync(cheminMarkdown, "utf8") : undefined;
  if (estAJour(surDisque, genere)) {
    process.stdout.write("docs/FEUILLE-DE-ROUTE.md est à jour.\n");
    return;
  }
  process.stderr.write("docs/FEUILLE-DE-ROUTE.md n'est pas à jour avec docs/feuille-de-route.json.\n");
  process.exitCode = 1;
}

function ecrire(cheminMarkdown: string, genere: string): void {
  writeFileSync(cheminMarkdown, genere, "utf8");
  process.stdout.write(`Écrit : ${cheminMarkdown}\n`);
}

function principal(): void {
  const table = analyserArguments(process.argv.slice(2));
  const chemins = cheminsParDefaut();
  const genere = engendrerMarkdown(chemins.json);

  if (drapeau(table, "verifier")) {
    verifier(chemins.markdown, genere);
    return;
  }
  ecrire(chemins.markdown, genere);
}

principal();
