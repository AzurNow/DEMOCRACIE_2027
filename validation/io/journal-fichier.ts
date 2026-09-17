/**
 * Le journal sur disque : un fichier JSONL par annotateur et par lot, ouvert en **ajout seul**.
 *
 * Trois propriétés, et aucune n'est négociable :
 *
 * 1. **Ce module n'expose aucune fonction de modification ni de suppression.** Pas de `mettre à
 *    jour`, pas de `supprimer`, pas de réécriture. Un changement d'avis est une entrée de plus.
 * 2. **Le chemin est clos à la construction.** Une instance est liée à un annotateur ; il
 *    n'existe aucun moyen, depuis l'extérieur, de lui faire lire le journal d'un autre.
 * 3. **Une corruption bloque au lieu d'être rattrapée.** Une ligne tronquée par un arrêt brutal
 *    ou une ligne modifiée à la main arrêtent l'interface avec un message précis. Ignorer une
 *    ligne illisible ferait disparaître une décision sans que personne ne le sache, dans le
 *    seul fichier qui prouve ce que les annotateurs ont fait.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { empreinteCoherente } from "../domaine/decision.ts";
import type { EntreeJournal } from "../domaine/types.ts";

const IDENTIFIANT_COURT = /^[a-z0-9]([a-z0-9_-]{0,62}[a-z0-9])?$/;

export class JournalIncomplet extends Error {
  constructor(chemin: string, octets: number) {
    super(
      `Journal interrompu en cours d'écriture : ${chemin}\n` +
        `La dernière ligne (${octets} octets) n'est pas terminée — l'interface a probablement été\n` +
        `arrêtée pendant un enregistrement. Rien n'est réparé automatiquement : ce fichier est la\n` +
        `preuve de ce qui a été décidé.\n` +
        `Inspecter :  tail -c ${octets + 200} ${chemin}\n` +
        `Puis, si la ligne partielle est bien à écarter, la retirer à la main et relancer.`,
    );
    this.name = "JournalIncomplet";
  }
}

export class LigneAlteree extends Error {
  constructor(chemin: string, numero: number) {
    super(
      `Entrée altérée dans ${chemin}, ligne ${numero} : son empreinte ne correspond pas à son\n` +
        `contenu. Le journal de validation est publié tel quel ; une entrée modifiée après coup\n` +
        `invalide le lot entier tant qu'elle n'est pas expliquée.`,
    );
    this.name = "LigneAlteree";
  }
}

export class JournalAnnotateur {
  readonly #repertoire: string;
  readonly #annotateur_id: string;

  constructor(racineDecisions: string, annotateur_id: string) {
    if (!IDENTIFIANT_COURT.test(annotateur_id)) {
      throw new Error(`Identifiant d'annotateur invalide : ${JSON.stringify(annotateur_id)}`);
    }
    this.#annotateur_id = annotateur_id;
    this.#repertoire = resolve(racineDecisions, annotateur_id);
  }

  get annotateur_id(): string {
    return this.#annotateur_id;
  }

  /** Chemin du journal d'un lot. Aucun paramètre d'annotateur : il est fixé à la construction. */
  chemin(lot_id: string): string {
    if (!IDENTIFIANT_COURT.test(lot_id)) {
      throw new Error(`Identifiant de lot invalide : ${JSON.stringify(lot_id)}`);
    }
    return join(this.#repertoire, `${lot_id}.jsonl`);
  }

  lire(lot_id: string): readonly EntreeJournal[] {
    const chemin = this.chemin(lot_id);
    if (!existsSync(chemin)) return [];
    return analyser(readFileSync(chemin, "utf8"), chemin);
  }

  /** Ajout en fin de fichier, et rien d'autre. Le descripteur est ouvert en mode « a ». */
  ajouter(lot_id: string, entree: EntreeJournal): void {
    if (entree.annotateur_id !== this.#annotateur_id) {
      throw new Error(
        `Entrée refusée : elle porte l'annotateur ${entree.annotateur_id}, ce journal est celui de ${this.#annotateur_id}.`,
      );
    }
    mkdirSync(this.#repertoire, { recursive: true });
    appendFileSync(this.chemin(lot_id), `${JSON.stringify(entree)}\n`, { encoding: "utf8", flag: "a" });
  }

  /** Lots pour lesquels cet annotateur a déjà écrit au moins une entrée. */
  lotsCommences(): readonly string[] {
    if (!existsSync(this.#repertoire)) return [];
    return readdirSync(this.#repertoire)
      .filter((nom) => nom.endsWith(".jsonl"))
      .map((nom) => nom.slice(0, -".jsonl".length))
      .sort();
  }
}

function analyser(contenu: string, chemin: string): readonly EntreeJournal[] {
  if (contenu.length === 0) return [];
  if (!contenu.endsWith("\n")) {
    const dernierSaut = contenu.lastIndexOf("\n");
    throw new JournalIncomplet(chemin, contenu.length - dernierSaut - 1);
  }

  const entrees: EntreeJournal[] = [];
  const lignes = contenu.slice(0, -1).split("\n");
  lignes.forEach((ligne, index) => {
    const entree = JSON.parse(ligne) as EntreeJournal;
    if (!empreinteCoherente(entree)) throw new LigneAlteree(chemin, index + 1);
    entrees.push(entree);
  });
  return entrees;
}
