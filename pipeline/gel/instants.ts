/**
 * L'ordre des instants d'un gel (décision D45 (4)) : `date_gel` ≤ l'instant d'exécution du gel, et
 * `date_gel` ≤ `fenetre.debut`. Deux refus nommés, contrôlés avant tout appel réseau :
 *
 * - `gel_avant_date_gel` : le gel est exécuté avant `date_gel`. Égal, il est accepté. C'est le
 *   refus général ; celui du tour drand pas encore émis (`balise.ts:exigerTourEmis`) reste après
 *   lui, pour l'intervalle de moins d'une période où `date_gel` est passée et son tour pas encore
 *   émis ;
 * - `fenetre_avant_date_gel` : la fenêtre d'interrogation s'ouvre avant `date_gel`. Égale, elle est
 *   acceptée.
 *
 * Un gel exécuté après l'ouverture de sa propre fenêtre n'est réglé par aucune décision : il n'est
 * pas refusé ici.
 */

export type MotifOrdre = "gel_avant_date_gel" | "fenetre_avant_date_gel";

export class OrdreDesInstantsRefuse extends Error {
  readonly motif: MotifOrdre;

  constructor(motif: MotifOrdre, detail: string) {
    super(`Ordre des instants refusé (${motif}, décision D45 (4)) : ${detail} Rien n'est écrit.`);
    this.name = "OrdreDesInstantsRefuse";
    this.motif = motif;
  }
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Lève si le gel est exécuté avant `date_gel` ; à `date_gel` exactement, il est accepté. */
export function exigerGelApresDateGel(maintenant_ms: number, date_gel_ms: number): void {
  if (maintenant_ms >= date_gel_ms) return;
  throw new OrdreDesInstantsRefuse(
    "gel_avant_date_gel",
    `le gel est exécuté le ${iso(maintenant_ms)}, avant date_gel (${iso(date_gel_ms)}).`,
  );
}

/** Lève si la fenêtre s'ouvre avant `date_gel` ; ouverte à `date_gel` exactement, elle est acceptée. */
export function exigerFenetreApresDateGel(fenetre_debut_ms: number, date_gel_ms: number): void {
  if (fenetre_debut_ms >= date_gel_ms) return;
  throw new OrdreDesInstantsRefuse(
    "fenetre_avant_date_gel",
    `la fenêtre s'ouvre le ${iso(fenetre_debut_ms)}, avant date_gel (${iso(date_gel_ms)}).`,
  );
}
