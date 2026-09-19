/**
 * Seuils de non-publication du §8.
 *
 * Deux règles, deux sources différentes, et c'est voulu :
 *
 * - le seuil de couverture par candidat est **lu** dans `run.perimetre.candidats[].sous_seuil`,
 *   compté au gel et stocké (§4). Le recalculer ici ferait vivre le seuil à deux endroits ;
 * - la part de réponses manquantes par outil est **calculée** ici, à partir des réponses du run,
 *   parce que c'est la mesure elle-même. `run.perimetre.outils[].run_incomplet` est alors le
 *   report de ce calcul, jamais un second calcul.
 */

import { filtrerContexteRun } from "./filtre.ts";
import { taux, type IdentifiantCourt, type Reponse, type Run, type Taux } from "./types.ts";

export interface PartageCandidats {
  /** Candidats entrant dans les comparaisons inter-candidats. */
  readonly compares: readonly IdentifiantCourt[];
  /** §4 : « rapporté à part, mention couverture insuffisante ». Rapporté, jamais effacé. */
  readonly rapportes_a_part: readonly IdentifiantCourt[];
}

export function candidatsComparables(run: Run): PartageCandidats {
  const compares: IdentifiantCourt[] = [];
  const rapportes_a_part: IdentifiantCourt[] = [];
  for (const candidat of run.perimetre.candidats) {
    if (candidat.sous_seuil) rapportes_a_part.push(candidat.candidat_id);
    else compares.push(candidat.candidat_id);
  }
  return { compares, rapportes_a_part };
}

/** Part des réponses manquantes d'un outil, sur les seules réponses du run (§6, §8). */
export function partReponsesManquantes(
  reponses: readonly Reponse[],
  outil_id: IdentifiantCourt,
): Taux {
  const siennes = filtrerContexteRun(reponses).filter((r) => r.outil_id === outil_id);
  const manquantes = siennes.filter((r) => r.statut_reponse === "manquante");
  return taux(manquantes.length, siennes.length);
}

/**
 * §8 : « plus de 20 % ». Le test est entier — `5 × manquantes > total` — pour que l'égalité à un
 * cinquième soit décidée par l'arithmétique et non par la représentation flottante de 0,2.
 * Un outil sans aucune réponse n'est pas « complet » : il n'est pas qualifiable, donc il lève.
 */
export function runIncomplet(part: Taux): boolean {
  if (part.denominateur === 0) {
    throw new Error("Outil sans aucune réponse dans le run : le seuil de 20 % n'est pas décidable.");
  }
  return 5 * part.numerateur > part.denominateur;
}

export interface PartageOutils {
  readonly compares: readonly IdentifiantCourt[];
  /** §8 : « marqué run incomplet et exclu des comparaisons de ce run ». */
  readonly incomplets: readonly IdentifiantCourt[];
}

export function outilsComparables(reponses: readonly Reponse[]): PartageOutils {
  const compares: IdentifiantCourt[] = [];
  const incomplets: IdentifiantCourt[] = [];
  for (const outil_id of outilsPresents(reponses)) {
    const part = partReponsesManquantes(reponses, outil_id);
    if (runIncomplet(part)) incomplets.push(outil_id);
    else compares.push(outil_id);
  }
  return { compares, incomplets };
}

function outilsPresents(reponses: readonly Reponse[]): IdentifiantCourt[] {
  const vus: IdentifiantCourt[] = [];
  for (const reponse of filtrerContexteRun(reponses)) {
    if (!vus.includes(reponse.outil_id)) vus.push(reponse.outil_id);
  }
  return vus;
}
