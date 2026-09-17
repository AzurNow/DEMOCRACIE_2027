/**
 * Brouillons de saisie : la grille à moitié remplie au moment où l'annotateur ferme la fenêtre.
 *
 * Un brouillon n'est pas une décision. Il est donc **hors** du journal append-only, écrasable,
 * hors dépôt et hors publication. Les mélanger reviendrait à publier des hésitations comme des
 * actes, et à faire perdre au journal sa propriété la plus utile : chaque ligne est une
 * décision que quelqu'un a prise.
 *
 * Perdre un brouillon coûte une grille à ressaisir ; perdre une décision coûte le lot.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Grille, QuestionsSpecifiques } from "../domaine/types.ts";

export interface Brouillon {
  readonly item_id: string;
  readonly lot_id: string;
  /** Réponses déjà données. Une question absente est une question non répondue. */
  readonly reponses?: Partial<Grille>;
  readonly reponses_par_etat?: {
    readonly anterieur?: Partial<Grille>;
    readonly posterieur?: Partial<Grille>;
  };
  readonly questions_specifiques?: QuestionsSpecifiques;
  readonly commentaire?: string;
  /** Millisecondes déjà passées sur cet item avant la fermeture de la fenêtre. */
  readonly duree_affichage_ms: number;
  readonly duree_active_ms: number;
}

export class Brouillons {
  readonly #chemin: string;

  constructor(racine: string, annotateur_id: string) {
    mkdirSync(resolve(racine), { recursive: true });
    this.#chemin = join(resolve(racine), `${annotateur_id}.json`);
  }

  lire(): Brouillon | null {
    if (!existsSync(this.#chemin)) return null;
    const contenu = readFileSync(this.#chemin, "utf8").trim();
    if (contenu.length === 0) return null;
    return JSON.parse(contenu) as Brouillon;
  }

  ecrire(brouillon: Brouillon): void {
    writeFileSync(this.#chemin, `${JSON.stringify(brouillon)}\n`, "utf8");
  }

  effacer(): void {
    if (existsSync(this.#chemin)) writeFileSync(this.#chemin, "", "utf8");
  }
}
