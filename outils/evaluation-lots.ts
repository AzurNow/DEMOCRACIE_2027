/**
 * Le sort de chaque item des lots, recalculé depuis les sources : lots (après supersession),
 * journaux des annotateurs, `staging/`, registre des corrections de thème, registre des décisions
 * d'arbitrage. Partagé par `pnpm promote` et `pnpm arbitrer` : la file d'arbitrage que l'arbitre
 * voit est exactement celle que la promotion calcule, jamais un instantané (`file.json`).
 */

import { evaluerAvecArbitrage, type RegistreArbitrage } from "../validation/domaine/arbitrage.ts";
import type { RegistreCorrectionsMesure } from "../validation/domaine/corrections-mesure.ts";
import type { EtatAnnotateur } from "../validation/domaine/journal.ts";
import { lotsApresSupersession, type LotEffectif } from "../validation/domaine/lot.ts";
import type { Dossier, Issue } from "../validation/domaine/promotion.ts";
import type { EntreeDecision, Item, Lot } from "../validation/domaine/types.ts";
import { etatsDuLot } from "../validation/io/lecture-croisee.ts";
import { mesureDe, type Staging } from "../validation/io/staging.ts";

export interface Verdict {
  readonly lot_id: string;
  readonly item: Item;
  readonly dossier: Dossier;
  readonly issue: Issue;
}

/** Un item qu'un lot juge mais que `staging/` ne contient pas : il ne disparaît jamais en silence. */
export interface Introuvable {
  readonly lot_id: string;
  readonly item_id: string;
}

export interface SourcesEvaluation {
  readonly staging: Staging;
  readonly lots: readonly Lot[];
  readonly repertoire_decisions: string;
  readonly registre_mesures: RegistreCorrectionsMesure;
  readonly registre_arbitrage: RegistreArbitrage;
  readonly commit: string;
  readonly horodatage: string;
}

export interface Evaluation {
  readonly effectifs: readonly LotEffectif[];
  readonly verdicts: readonly Verdict[];
  readonly introuvables: readonly Introuvable[];
}

function decisionsActives(etats: ReadonlyMap<string, EtatAnnotateur>, item_id: string): EntreeDecision[] {
  const actives: EntreeDecision[] = [];
  for (const etat of etats.values()) {
    const decision = etat.decisions.get(item_id);
    if (decision !== undefined) actives.push(decision);
  }
  return actives;
}

/**
 * Un lot n'est évalué que sur les items qu'il juge encore : ceux qu'aucun lot de réannotation
 * postérieur ne reprend (§4, supersession). Le lot d'origine reste lu, publié et diagnostiqué ;
 * ses décisions ne comptent simplement plus pour les items rejugés.
 */
function evaluerLot(effectif: LotEffectif, sources: SourcesEvaluation): Evaluation {
  const etats = etatsDuLot(sources.repertoire_decisions, effectif.lot);
  const verdicts: Verdict[] = [];
  const introuvables: Introuvable[] = [];

  for (const reference of effectif.items) {
    const item = sources.staging.items.get(reference.item_id);
    if (item === undefined) {
      introuvables.push({ lot_id: effectif.lot.lot_id, item_id: reference.item_id });
      continue;
    }
    const dossier: Dossier = {
      item,
      mesure: mesureDe(sources.staging, item),
      lot_id: effectif.lot.lot_id,
      lot_nature: effectif.lot.nature,
      decisions: decisionsActives(etats, item.id),
      registre_corrections_mesure: sources.registre_mesures,
    };
    const issue = evaluerAvecArbitrage(dossier, sources.registre_arbitrage, sources);
    verdicts.push({ lot_id: effectif.lot.lot_id, item, dossier, issue });
  }
  return { effectifs: [effectif], verdicts, introuvables };
}

export function evaluerLots(sources: SourcesEvaluation): Evaluation {
  const effectifs = lotsApresSupersession(sources.lots);
  const evaluations = effectifs.map((effectif) => evaluerLot(effectif, sources));
  return {
    effectifs,
    verdicts: evaluations.flatMap((evaluation) => evaluation.verdicts),
    introuvables: evaluations.flatMap((evaluation) => evaluation.introuvables),
  };
}
