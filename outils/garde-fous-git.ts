/**
 * Garde-fous communs aux commandes qui écrivent une donnée publiée (`pnpm promote`, `pnpm arbitrer`,
 * `pnpm contester`, `pnpm panel`), repris de `pnpm promote` :
 *
 * - la commande **simule** par défaut, et n'écrit qu'avec `--ecrire`, saisi par un humain ;
 * - `--ecrire` exige un arbre Git propre : le commit courant (HEAD) est inscrit dans l'historique
 *   de chaque item écrit, et il ne décrirait pas l'état du dépôt si des modifications traînaient ;
 * - aucune commande ne commite : elle imprime la commande Git, et c'est l'humain qui signe.
 */

import { execFileSync } from "node:child_process";

export function arbrePropre(racine: string): boolean {
  const sortie = execFileSync("git", ["status", "--porcelain"], { cwd: racine, encoding: "utf8" });
  return sortie.trim().length === 0;
}

export function commitCourant(racine: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: racine, encoding: "utf8" }).trim();
}

export const MESSAGE_ARBRE_SALE =
  "Arbre Git non propre. --ecrire inscrit le commit courant dans l'historique de chaque item\n" +
  "écrit ; avec des modifications non commitées à côté, ce commit ne décrirait pas l'état\n" +
  "du dépôt. Commitez ou remisez, puis relancez.\n";

/** Vrai si l'écriture peut commencer ; sinon le refus est imprimé et le code de sortie posé. */
export function ecriturePermise(racine: string): boolean {
  if (arbrePropre(racine)) return true;
  process.stderr.write(MESSAGE_ARBRE_SALE);
  process.exitCode = 1;
  return false;
}

/** La commande que l'humain lance pour signer ; aucune commande du dépôt ne commite. */
export function commandeGit(chemins: readonly string[], titre: string, lignes: readonly string[]): string {
  return (
    `Rien n'est commité : c'est vous qui signez.\n\n` +
    `  git add ${chemins.join(" ")}\n` +
    `  git commit -m "${titre}\n\n` +
    lignes.map((ligne) => `  ${ligne}`).join("\n") +
    `\n"\n`
  );
}
