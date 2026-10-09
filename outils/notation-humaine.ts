/**
 * `pnpm notation:humaine <repertoire_run>` — l'écran local de notation humaine d'un run (§7 ; D18).
 *
 *   ANNOTATEUR_ID=a1 pnpm notation:humaine runs/2026-12-01 [--items=data/items] [--port=4174]
 *
 * L'annotateur est identifié par son pseudonyme, lu dans `ANNOTATEUR_ID` (jamais choisi dans
 * l'écran). Il reçoit ses tâches, voit chaque réponse comme la voit un juge (aveugle total : ni
 * l'outil, ni les notes d'un juge, ni celles d'un autre humain), saisit la grille du §7 ; la notation
 * est écrite dans `runs/<date>/volume/notations/` (règle 7 : jamais réécrite). Tout est local.
 *
 * `--items` désigne `data/items/` dans le dépôt Git qui porte le commit du gel du run (par défaut
 * `data/items` sous la racine du dépôt) : les items sont lus à ce commit, comme pour l'analyse.
 *
 * Les verdicts d'existence des liens (§7, D20) sont lus dans `volume/liens/`, écrit par `pnpm liens`
 * (`notation-humaine/serveur/fournisseur.ts:fournisseurDuRun`). Tant que ce passage n'a pas eu lieu,
 * ou pour un lien qu'il n'a pas pu trancher, la réponse qui le cite est comptée « en attente du test
 * des liens » et non proposée. Un fichier de résultat invalide ou incohérent empêche le démarrage.
 *
 * Codes de sortie : 2 si le run ne peut pas être lu ou si la commande est mal appelée (le nom de
 * l'erreur est imprimé) ; sinon le serveur reste en écoute.
 */

import { resolve } from "node:path";
import { demarrer } from "../notation-humaine/serveur/principal.ts";
import { pseudonymeDepuisEnvironnement } from "../notation-humaine/serveur/contexte.ts";
import { fournisseurDuRun } from "../notation-humaine/serveur/fournisseur.ts";
import { analyserArguments, entier, texte } from "./arguments.ts";

const USAGE = "usage : ANNOTATEUR_ID=<pseudonyme> pnpm notation:humaine <repertoire_run> [--items=<data/items>] [--port=<n>]";
const CLES_CONNUES: readonly string[] = ["items", "port"];
const PORT_PAR_DEFAUT = 4174;

interface Demande {
  readonly repertoire_run: string;
  readonly repertoire_items: string;
  readonly port: number;
}

function demandeDe(bruts: readonly string[]): Demande {
  const options = analyserArguments(bruts);
  const inconnues = [...options.keys()].filter((cle) => !CLES_CONNUES.includes(cle));
  if (inconnues.length > 0) throw new Error(`option(s) inconnue(s) : ${inconnues.map((cle) => `--${cle}`).join(", ")}. ${USAGE}`);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire_run] = positionnels;
  if (repertoire_run === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  const port = entier(options, "port", PORT_PAR_DEFAUT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port invalide : ${String(options.get("port"))}. ${USAGE}`);
  return {
    repertoire_run: resolve(repertoire_run),
    repertoire_items: resolve(texte(options, "items", resolve(import.meta.dirname, "..", "data/items"))),
    port,
  };
}

function lancer(bruts: readonly string[]): Error | null {
  try {
    const demande = demandeDe(bruts);
    const annotateur_id = pseudonymeDepuisEnvironnement(process.env);
    demarrer({ ...demande, annotateur_id, existences: fournisseurDuRun(demande.repertoire_run) });
    return null;
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw erreur;
  }
}

const echec = lancer(process.argv.slice(2));
if (echec !== null) {
  process.stderr.write(`Notation humaine non démarrée — ${echec.name} :\n  ${echec.message}\n`);
  process.exitCode = 2;
}
