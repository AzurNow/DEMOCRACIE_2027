/**
 * L'ordre des instants d'un gel (décisions D45 (4) et D48 (1)) : `date_gel` ≤ l'instant d'exécution
 * du gel < `fenetre.debut`, et `date_gel` ≤ `fenetre.debut`. Trois refus nommés, contrôlés avant
 * tout appel réseau :
 *
 * - `gel_avant_date_gel` : le gel est exécuté avant `date_gel`. Égal, il est accepté. C'est le
 *   refus général ; celui du tour drand pas encore émis (`balise.ts:exigerTourEmis`) reste après
 *   lui, pour l'intervalle de moins d'une période où `date_gel` est passée et son tour pas encore
 *   émis ;
 * - `gel_apres_ouverture_fenetre` (D48 (1)) : le gel est exécuté à `fenetre.debut` ou après. Égal,
 *   il est refusé : des réponses obtenues avant le gel ne seraient couvertes par aucun tirage
 *   publié ;
 * - `fenetre_avant_date_gel` : la fenêtre d'interrogation s'ouvre avant `date_gel`. Égale, elle est
 *   acceptée par ce contrôle ; mais aucun instant d'exécution ne satisfait alors les deux premiers,
 *   et le gel est refusé `gel_apres_ouverture_fenetre`.
 */

export type MotifOrdre = "gel_avant_date_gel" | "gel_apres_ouverture_fenetre" | "fenetre_avant_date_gel";

/** La décision qui fonde chaque refus, citée dans son message. */
const DECISION: Readonly<Record<MotifOrdre, string>> = {
  gel_avant_date_gel: "D45 (4)",
  gel_apres_ouverture_fenetre: "D48 (1)",
  fenetre_avant_date_gel: "D45 (4)",
};

export class OrdreDesInstantsRefuse extends Error {
  readonly motif: MotifOrdre;

  constructor(motif: MotifOrdre, detail: string) {
    super(`Ordre des instants refusé (${motif}, décision ${DECISION[motif]}) : ${detail} Rien n'est écrit.`);
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

/**
 * D48 (1) : lève si le gel est exécuté à l'ouverture de sa fenêtre ou après ; strictement avant, il
 * est accepté. Des réponses obtenues avant le gel ne seraient couvertes par aucun tirage publié.
 */
export function exigerGelAvantFenetre(maintenant_ms: number, fenetre_debut_ms: number): void {
  if (maintenant_ms < fenetre_debut_ms) return;
  throw new OrdreDesInstantsRefuse(
    "gel_apres_ouverture_fenetre",
    `le gel est exécuté le ${iso(maintenant_ms)}, à l'ouverture de la fenêtre (${iso(fenetre_debut_ms)}) ou après.`,
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
