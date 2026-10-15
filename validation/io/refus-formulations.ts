/**
 * `validation/formulations/refus.jsonl` : le journal des propositions de formulations refusées à la
 * relecture (`schema/refus-formulation.schema.json`, décisions D39 et D42), un objet JSON par ligne,
 * en **ajout seul**. Ce module n'expose ni modification ni suppression : un refus est un fait publié.
 *
 * Seul lecteur et seul écrivain du journal : l'interface le relit pour ne plus proposer une
 * proposition refusée ; `pnpm reformuler` le relit par `pipeline/reformulation/reprise.ts` pour
 * rappeler le modèle sur une question dont la proposition a été refusée.
 *
 * Une ligne illisible (JSON invalide, ligne vide, ligne tronquée par un arrêt brutal) ou non
 * conforme au schéma arrête la lecture avec `JournalRefusIllisible`, qui nomme la ligne : l'ignorer
 * ferait réapparaître une proposition déjà refusée, sans que personne ne le sache.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { ErreurSchema, valider } from "../../outils/schemas/valider.ts";
import type { RefusFormulation } from "../../pipeline/reformulation/relecture.ts";

export class JournalRefusIllisible extends Error {
  readonly chemin: string;
  readonly ligne: number;

  constructor(chemin: string, ligne: number, detail: string) {
    super(
      `${chemin}, ligne ${ligne} : journal des refus illisible, ${detail} Rien n'est relu, promu ni rappelé ` +
        `tant que le journal n'est pas lisible ; il n'est jamais réparé automatiquement.`,
    );
    this.name = "JournalRefusIllisible";
    this.chemin = chemin;
    this.ligne = ligne;
  }
}

function analyserLigne(chemin: string, ligne: string, numero: number): RefusFormulation {
  let brut: unknown;
  try {
    brut = JSON.parse(ligne);
  } catch (erreur) {
    if (erreur instanceof SyntaxError) throw new JournalRefusIllisible(chemin, numero, `JSON illisible (${erreur.message}).`);
    throw erreur;
  }
  try {
    return valider<RefusFormulation>("refus-formulation", brut, `${chemin}, ligne ${numero}`);
  } catch (erreur) {
    if (erreur instanceof ErreurSchema) throw new JournalRefusIllisible(chemin, numero, `non conforme au schéma : ${erreur.message}`);
    throw erreur;
  }
}

/** Tous les refus, dans l'ordre du journal. Un journal absent ou vide est un journal sans refus. */
export function lireRefusFormulations(chemin: string): readonly RefusFormulation[] {
  if (!existsSync(chemin)) return [];
  const contenu = readFileSync(chemin, "utf8");
  if (contenu.length === 0) return [];
  const lignes = contenu.split("\n");
  if (lignes.at(-1) !== "") throw new JournalRefusIllisible(chemin, lignes.length, "dernière ligne non terminée (écriture interrompue).");
  return lignes.slice(0, -1).map((ligne, index) => analyserLigne(chemin, ligne, index + 1));
}

/** Ajoute un refus en fin de journal, après validation contre le schéma. Le descripteur est ouvert en « a ». */
export function ajouterRefusFormulation(chemin: string, refus: RefusFormulation): void {
  // Le journal existant doit être lisible avant tout ajout : on n'écrit pas derrière une ligne corrompue.
  lireRefusFormulations(chemin);
  valider("refus-formulation", refus, `refus à ajouter à ${chemin}`);
  mkdirSync(dirname(chemin), { recursive: true });
  appendFileSync(chemin, `${JSON.stringify(refus)}\n`, { encoding: "utf8", flag: "a" });
}
