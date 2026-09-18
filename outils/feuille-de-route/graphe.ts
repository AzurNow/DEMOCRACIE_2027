/**
 * Détection de cycle et calcul de l'état des lots.
 *
 * Le graphe doit être acyclique quel que soit le type de dépendance : une dépendance
 * `informe` qui boucle est tout aussi inexploitable pour ordonner le travail qu'une
 * dépendance `bloque`. La détection porte donc sur les deux indifféremment.
 *
 * L'état d'un lot suit exactement la règle du brief : le niveau prime (un lot à T3 ou plus est
 * `atteint`, même si une dépendance ou une décision qu'il porte ne l'est pas) ; sinon un lot est
 * `bloque` si une dépendance `bloque` pointe vers un lot sous T3, ou si une décision qu'il porte
 * est `en_attente` ; sinon il est `debloque`.
 */

import type { Decision, Lot, Niveau } from "./types.ts";

export class CycleDetecte extends Error {
  readonly cycle: readonly string[];

  constructor(cycle: readonly string[]) {
    super(`Cycle de dépendances : ${cycle.join(" → ")}`);
    this.name = "CycleDetecte";
    this.cycle = cycle;
  }
}

export type EtatLot =
  | { readonly type: "atteint" }
  | { readonly type: "debloque" }
  | { readonly type: "bloque"; readonly bloqueurs: readonly string[] };

const RANG_NIVEAU: Readonly<Record<Niveau, number>> = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 };
const RANG_ATTEINT = RANG_NIVEAU.T3;

type EtatVisite = "en_cours" | "fini";

function visiter(id: string, parId: ReadonlyMap<string, Lot>, etats: Map<string, EtatVisite>, pile: string[]): void {
  if (etats.get(id) === "fini") return;
  if (etats.get(id) === "en_cours") {
    const debut = pile.indexOf(id);
    throw new CycleDetecte([...pile.slice(debut), id]);
  }
  etats.set(id, "en_cours");
  pile.push(id);
  const lot = parId.get(id);
  if (lot !== undefined) {
    for (const dependance of lot.depend_de) visiter(dependance.lot, parId, etats, pile);
  }
  pile.pop();
  etats.set(id, "fini");
}

/** Lève `CycleDetecte` dès qu'une chaîne de dépendances (bloque ou informe) revient sur elle-même. */
export function verifierAcyclique(lots: readonly Lot[]): void {
  const parId = new Map(lots.map((lot) => [lot.id, lot]));
  const etats = new Map<string, EtatVisite>();
  for (const lot of lots) visiter(lot.id, parId, etats, []);
}

function decisionsBloquantes(lot: Lot, decisionParId: ReadonlyMap<string, Decision>): readonly string[] {
  return lot.decisions
    .map((id) => decisionParId.get(id))
    .filter((decision): decision is Decision => decision !== undefined && decision.statut === "en_attente")
    .map((decision) => decision.id)
    .sort();
}

function lotsBloquants(lot: Lot, lotParId: ReadonlyMap<string, Lot>): readonly string[] {
  return lot.depend_de
    .filter((dependance) => dependance.type === "bloque")
    .map((dependance) => lotParId.get(dependance.lot))
    .filter((cible): cible is Lot => cible !== undefined && RANG_NIVEAU[cible.niveau] < RANG_ATTEINT)
    .map((cible) => cible.id)
    .sort();
}

function calculerEtatLot(lot: Lot, lotParId: ReadonlyMap<string, Lot>, decisionParId: ReadonlyMap<string, Decision>): EtatLot {
  if (RANG_NIVEAU[lot.niveau] >= RANG_ATTEINT) return { type: "atteint" };
  const bloqueurs = [...decisionsBloquantes(lot, decisionParId), ...lotsBloquants(lot, lotParId)];
  if (bloqueurs.length === 0) return { type: "debloque" };
  return { type: "bloque", bloqueurs };
}

/** Calcule l'état de chaque lot. Lève `CycleDetecte` si les dépendances ne forment pas un DAG. */
export function calculerEtats(lots: readonly Lot[], decisions: readonly Decision[]): ReadonlyMap<string, EtatLot> {
  verifierAcyclique(lots);
  const lotParId = new Map(lots.map((lot) => [lot.id, lot]));
  const decisionParId = new Map(decisions.map((decision) => [decision.id, decision]));
  const resultat = new Map<string, EtatLot>();
  for (const lot of lots) resultat.set(lot.id, calculerEtatLot(lot, lotParId, decisionParId));
  return resultat;
}
