/**
 * Analyses de robustesse préenregistrées (§8).
 *
 * « Recalcul des métriques primaires (a) sur la seule notation humaine de l'échantillon de 10 %,
 * (b) en excluant les items contestés à un run ultérieur, (c) en excluant les formulations
 * orientées. Un résultat qui ne survit pas à ces trois recalculs est signalé comme fragile. »
 *
 * Deux lectures assumées, toutes deux visibles dans la sortie :
 *
 * - « Ne pas survivre » se dit d'un résultat **établi** au calcul principal qui cesse de l'être
 *   dans l'un des trois recalculs. Une différence déjà non établie n'avait rien à faire
 *   survivre ; la marquer fragile laisserait croire à un résultat rabaissé.
 * - Un recalcul **qui ne peut plus être calculé** (plus aucune réponse après restriction) ne
 *   confirme rien : il rend le résultat fragile, avec son motif. Une absence de confirmation
 *   n'est pas une confirmation.
 */

import { differenceAppariee, type DifferenceTaux, type OptionsBootstrap, type Statistique } from "./bootstrap.ts";
import type { UniteAnalyse } from "./filtre.ts";
import type { Run } from "./types.ts";

export type Recalcul = "echantillon_humain" | "items_contestes" | "formulations_orientees";

export interface RecalculRobustesse {
  readonly recalcul: Recalcul;
  readonly difference: DifferenceTaux;
}

export interface ResultatRobustesse {
  readonly principal: DifferenceTaux;
  readonly recalculs: readonly RecalculRobustesse[];
  readonly fragile: boolean;
  readonly motifs_fragilite: readonly Recalcul[];
}

/** §8(a) : `verdict.dans_echantillon_humain`, le drapeau qui définit l'échantillon de 10 % (§7). */
export function restreindreEchantillonHumain(unites: readonly UniteAnalyse[]): UniteAnalyse[] {
  return unites.filter((u) => u.dans_echantillon_humain);
}

/** §8(b) : `run.contestations_posterieures[]`, contestations reçues APRÈS le gel du run. */
export function exclureItemsContestes(unites: readonly UniteAnalyse[], run: Run): UniteAnalyse[] {
  const contestations = run.contestations_posterieures;
  if (contestations === undefined) return [...unites];
  const contestes = new Set(contestations.map((c) => c.item_id));
  return unites.filter((u) => !contestes.has(u.item_principal_id));
}

/** §8(c) : les formulations orientées du §5. */
export function exclureFormulationsOrientees(unites: readonly UniteAnalyse[]): UniteAnalyse[] {
  return unites.filter((u) => u.registre !== "oriente");
}

export function evaluerRobustesse(
  unitesA: readonly UniteAnalyse[],
  unitesB: readonly UniteAnalyse[],
  run: Run,
  statistique: Statistique,
  options: OptionsBootstrap,
): ResultatRobustesse {
  const principal = differenceAppariee(unitesA, unitesB, statistique, options);
  const recalculs = restrictions(run).map(({ recalcul, restreindre }) => ({
    recalcul,
    difference: differenceAppariee(restreindre(unitesA), restreindre(unitesB), statistique, options),
  }));
  const motifs = motifsDeFragilite(principal, recalculs);
  return { principal, recalculs, fragile: motifs.length > 0, motifs_fragilite: motifs };
}

interface Restriction {
  readonly recalcul: Recalcul;
  readonly restreindre: (unites: readonly UniteAnalyse[]) => UniteAnalyse[];
}

/** Ordre figé : (a), (b), (c) du §8, dans cet ordre, pour que le rapport soit comparable d'un run à l'autre. */
function restrictions(run: Run): readonly Restriction[] {
  return [
    { recalcul: "echantillon_humain", restreindre: restreindreEchantillonHumain },
    { recalcul: "items_contestes", restreindre: (unites) => exclureItemsContestes(unites, run) },
    { recalcul: "formulations_orientees", restreindre: exclureFormulationsOrientees },
  ];
}

function motifsDeFragilite(
  principal: DifferenceTaux,
  recalculs: readonly RecalculRobustesse[],
): Recalcul[] {
  if (principal.qualificatif !== "etablie") return [];
  return recalculs
    .filter((r) => r.difference.qualificatif !== "etablie")
    .map((r) => r.recalcul);
}
