/**
 * Diagnostics de lot sur disque : `validation/diagnostics/<lot_id>/<instant>.json`.
 *
 * **Ajout seul, au sens strict : aucun fichier n'est jamais réécrit.** Un calcul identique au
 * dernier publié pour ce lot (à l'instant près) n'écrit rien ; un calcul différent écrit un
 * nouveau fichier, nommé par son instant, avec l'option `wx` du système de fichiers, qui échoue
 * plutôt que d'écraser. Le lien `supersede_par` change quand un lot est réannoté, et le
 * dénominateur change quand une contestation arrive (§4, 0.8) : l'historique de ces calculs est
 * publié tel quel (§9, « JSON, ajout seul »), jamais résumé par le dernier.
 *
 * Chaque diagnostic est confronté à `diagnostic-lot.schema.json` avant l'écriture et à la
 * relecture ; un fichier rangé sous un autre lot que le sien arrête la lecture.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import { derniersCalculs, memeCalcul, type DiagnosticPublie } from "../domaine/diagnostic-publie.ts";

export type IssueEcriture = "ecrit" | "inchange";

export class DiagnosticDejaEcrit extends Error {
  constructor(chemin: string) {
    super(
      `Un diagnostic différent existe déjà à ${chemin}. Un diagnostic publié n'est jamais réécrit : ` +
        `un nouveau calcul prend un nouvel instant.`,
    );
    this.name = "DiagnosticDejaEcrit";
  }
}

export class DiagnosticMalRange extends Error {
  constructor(chemin: string, lot_id: string) {
    super(`Diagnostic ${chemin} : il porte le lot ${lot_id}, pas celui du répertoire qui le range.`);
    this.name = "DiagnosticMalRange";
  }
}

/** `2026-10-12T18:04:11+02:00` → `2026-10-12T18-04-11+02-00.json` : aucun `:` dans un nom de fichier. */
function nomFichier(date_calcul: string): string {
  return `${date_calcul.replaceAll(":", "-")}.json`;
}

export function cheminDiagnostic(repertoire: string, diagnostic: DiagnosticPublie): string {
  return join(repertoire, diagnostic.lot_id, nomFichier(diagnostic.date_calcul));
}

function lireFichier(chemin: string, lot_id: string): DiagnosticPublie {
  const diagnostic = valider<DiagnosticPublie>("diagnostic-lot", JSON.parse(readFileSync(chemin, "utf8")), chemin);
  if (diagnostic.lot_id !== lot_id) throw new DiagnosticMalRange(chemin, diagnostic.lot_id);
  return diagnostic;
}

function lireLot(repertoire: string, lot_id: string): readonly DiagnosticPublie[] {
  const dossier = join(repertoire, lot_id);
  return readdirSync(dossier)
    .filter((nom) => nom.endsWith(".json"))
    .sort()
    .map((nom) => lireFichier(join(dossier, nom), lot_id));
}

/** Tous les diagnostics publiés, tous calculs confondus. Un répertoire absent : aucun calcul encore. */
export function lireDiagnostics(repertoire: string): readonly DiagnosticPublie[] {
  if (!existsSync(repertoire)) return [];
  return readdirSync(repertoire, { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .map((entree) => entree.name)
    .sort()
    .flatMap((lot_id) => lireLot(repertoire, lot_id));
}

function dernierPublie(repertoire: string, lot_id: string): DiagnosticPublie | null {
  if (!existsSync(join(repertoire, lot_id))) return null;
  const [dernier] = derniersCalculs(lireLot(repertoire, lot_id));
  return dernier === undefined ? null : dernier;
}

function ecrireSansEcraser(chemin: string, contenu: string): void {
  try {
    writeFileSync(chemin, contenu, { encoding: "utf8", flag: "wx" });
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "EEXIST") throw new DiagnosticDejaEcrit(chemin);
    throw erreur;
  }
}

export function ajouterDiagnostic(repertoire: string, diagnostic: DiagnosticPublie): IssueEcriture {
  const chemin = cheminDiagnostic(repertoire, diagnostic);
  valider("diagnostic-lot", diagnostic, `diagnostic à écrire dans ${chemin}`);
  const dernier = dernierPublie(repertoire, diagnostic.lot_id);
  if (dernier !== null && memeCalcul(dernier, diagnostic)) return "inchange";
  mkdirSync(join(repertoire, diagnostic.lot_id), { recursive: true });
  ecrireSansEcraser(chemin, `${JSON.stringify(diagnostic, null, 2)}\n`);
  return "ecrit";
}
