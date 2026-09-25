/**
 * Contestation d'un item publié et décision du panel : la logique, sans le disque (protocole 0.10,
 * §4 « Droit de réponse », §10 « Panel d'arbitrage », annexe E).
 *
 * - `ajouterContestation` : l'item passe en « contestee » (y compris depuis « arbitree ») et sort
 *   du tirage suivant ; son contenu notant ne bouge pas.
 * - `appliquerDecisionPanel` : pose une décision motivée sur une contestation qui n'en a pas.
 *   L'item est « arbitree » seulement quand toutes ses contestations sont décidées ; un retrait le
 *   rend « retire_par_panel », une non-évaluabilité « non_evaluable » ; une correction passe par la
 *   liste blanche des corrections et **rejoue le test verbatim** sur le texte canonique, incrémente
 *   la version et recalcule l'empreinte.
 *
 * Décisions du protocole 0.10 tenues ici : un texte de plus de 1 000 caractères (points de code
 * après NFC) est **refusé**, jamais tronqué ni résumé ; un texte vide est refusé ; une décision
 * rendue après 14 jours reste valable et son délai se calcule depuis les deux dates publiées.
 * Aucune adresse de contestataire n'entre ici : aucun champ ne la reçoit.
 */

import { DecisionsPanelSimultanees } from "../../pipeline/questions/contestation.ts";
import { ancienneteEnJours } from "./corrections-mesure.ts";
import { validerCorrections, type AccesTexte, type RefusCorrection } from "./corrections.ts";
import { canoniser, empreinteContenuNotant } from "./empreinte.ts";
import { appliquerCorrections } from "./promotion.ts";
import type { AutorisationReecriture } from "./ajout-seul.ts";
import type { Correction, Item, Source } from "./types.ts";

export const LONGUEUR_MAX_CONTESTATION = 1000;

export const TYPES_CONTESTATAIRE = ["campagne", "parti", "citoyen", "media", "autre"] as const;
export type TypeContestataire = (typeof TYPES_CONTESTATAIRE)[number];

export const DECISIONS_PANEL = ["maintien", "correction", "retrait", "non_evaluabilite"] as const;
export type DecisionPanel = (typeof DECISIONS_PANEL)[number];

export interface Contestation {
  readonly id: string;
  readonly date_reception: string;
  readonly texte: string;
  readonly contestataire_type: TypeContestataire;
  readonly caviardage: boolean;
  readonly sources_nouvelles?: readonly Source[];
}

interface DecisionPanelPubliee {
  readonly date: string;
  readonly decision: DecisionPanel;
  readonly motivation: string;
  readonly opinions_dissidentes: readonly string[];
  readonly arbitre_seul: boolean;
}

interface ContestationPubliee extends Contestation {
  readonly decision_panel?: DecisionPanelPubliee;
}

export interface DecisionDuPanel {
  readonly contestation_id: string;
  readonly decision: DecisionPanel;
  /** La version de l'item que le panel a jugée : une version dépassée est refusée. */
  readonly version_jugee: number;
  readonly motivation: string;
  readonly opinions_dissidentes: readonly string[];
  readonly arbitre_seul: boolean;
  /** Non vide si et seulement si la décision est « correction ». */
  readonly corrections: readonly Correction[];
  readonly date: string;
}

export interface TraceEcriture {
  readonly date: string;
  readonly commit: string;
}

/* ------------------------------------------------------------------ erreurs */

export class TexteContestationRefuse extends Error {
  constructor(detail: string) {
    super(`Texte de contestation refusé : ${detail}`);
    this.name = "TexteContestationRefuse";
  }
}

export class ContestationEnDouble extends Error {
  constructor(item_id: string, id: string) {
    super(`Item ${item_id} : la contestation ${id} est déjà enregistrée.`);
    this.name = "ContestationEnDouble";
  }
}

export class ContestationInexistante extends Error {
  constructor(item_id: string, id: string) {
    super(`Item ${item_id} : aucune contestation ${id}.`);
    this.name = "ContestationInexistante";
  }
}

export class ContestationDejaDecidee extends Error {
  constructor(item_id: string, id: string) {
    super(`Item ${item_id} : la contestation ${id} porte déjà une décision du panel, qui n'est jamais remplacée.`);
    this.name = "ContestationDejaDecidee";
  }
}

export class VersionJugeePerimee extends Error {
  constructor(item_id: string, jugee: number, courante: number) {
    super(`Item ${item_id} : le panel a jugé la version ${jugee}, l'item publié est en version ${courante}.`);
    this.name = "VersionJugeePerimee";
  }
}

export class CorrectionsDuPanelRefusees extends Error {
  constructor(item_id: string, motifs: readonly string[]) {
    super(`Item ${item_id} : corrections du panel refusées :\n${motifs.map((motif) => `  ${motif}`).join("\n")}`);
    this.name = "CorrectionsDuPanelRefusees";
  }
}

/* -------------------------------------------------------------------- texte */

/**
 * Le texte publié d'une contestation : normalisé NFC (docs/CONTRATS.md), compté en points de
 * code. Au-delà de 1 000, refusé ; jamais tronqué (§4, 0.10).
 */
export function texteDeContestation(brut: string): string {
  const texte = brut.normalize("NFC");
  if (texte.trim().length === 0) throw new TexteContestationRefuse("texte vide.");
  const longueur = [...texte].length;
  if (longueur > LONGUEUR_MAX_CONTESTATION) {
    throw new TexteContestationRefuse(
      `${longueur} caractères, ${LONGUEUR_MAX_CONTESTATION} au plus (§4). Il n'est ni tronqué ni résumé : ` +
        `le contestataire est invité à envoyer une version de 1 000 caractères au plus ; le texte intégral va au dossier du panel.`,
    );
  }
  return texte;
}

/* ------------------------------------------------------------- contestation */

function requis<T>(valeur: readonly T[] | undefined, item: Item, cle: string): readonly T[] {
  if (valeur === undefined) throw new Error(`Item ${item.id} sans ${cle}[] : non conforme à item.schema.json`);
  return valeur;
}

function contestationsDe(item: Item): readonly ContestationPubliee[] {
  return requis(item.contestations, item, "contestations") as readonly ContestationPubliee[];
}

function entreeHistorique(item: Item, version: number, trace: TraceEcriture, changement: string, motif: string) {
  return [
    ...requis(item.historique, item, "historique"),
    { date: trace.date, changement, motif, commit: trace.commit, version_resultante: version },
  ];
}

export function ajouterContestation(item: Item, contestation: Contestation, trace: TraceEcriture): Item {
  const texte = texteDeContestation(contestation.texte);
  if (texte !== contestation.texte) throw new TexteContestationRefuse("texte non normalisé NFC par l'appelant.");
  const existantes = contestationsDe(item);
  if (existantes.some((existante) => existante.id === contestation.id)) throw new ContestationEnDouble(item.id, contestation.id);
  return {
    ...item,
    statut_contestation: "contestee",
    contestations: [...existantes, contestation],
    historique: entreeHistorique(item, item.version, trace, "contestation reçue", `contestation ${contestation.id}`),
  };
}

/** Délai de la décision, en jours entiers depuis la réception : publié, jamais une cause de refus. */
export function delaiDecisionJours(contestation: Contestation, date_decision: string): number {
  return ancienneteEnJours(contestation.date_reception, date_decision);
}

/* -------------------------------------------------------------------- panel */

const STATUT_VALIDATION_PAR_DECISION: ReadonlyMap<DecisionPanel, string | null> = new Map([
  ["maintien", null],
  ["correction", null],
  ["retrait", "retire_par_panel"],
  ["non_evaluabilite", "non_evaluable"],
]);

function controlerCible(item: Item, decision: DecisionDuPanel): ContestationPubliee {
  const cible = contestationsDe(item).find((contestation) => contestation.id === decision.contestation_id);
  if (cible === undefined) throw new ContestationInexistante(item.id, decision.contestation_id);
  if (cible.decision_panel !== undefined) throw new ContestationDejaDecidee(item.id, decision.contestation_id);
  if (decision.version_jugee !== item.version) throw new VersionJugeePerimee(item.id, decision.version_jugee, item.version);
  return cible;
}

/** Deux décisions différentes au même instant rendraient la dernière indéterminable (§5, tirage). */
function controlerSimultaneite(item: Item, decision: DecisionDuPanel): void {
  const instant = Date.parse(decision.date);
  for (const contestation of contestationsDe(item)) {
    const autre = contestation.decision_panel;
    if (autre === undefined || Date.parse(autre.date) !== instant || autre.decision === decision.decision) continue;
    throw new DecisionsPanelSimultanees(item.id, decision.date, [autre.decision, decision.decision].sort());
  }
}

function lirePointeur(item: Item, chemin: string): unknown {
  return chemin
    .split("/")
    .slice(1)
    .reduce<unknown>((noeud, segment) => (noeud as Record<string, unknown> | undefined)?.[segment], item);
}

function motifsCorrections(item: Item, decision: DecisionDuPanel, acces: AccesTexte): readonly string[] {
  const attendues = decision.decision === "correction";
  if (attendues !== decision.corrections.length > 0) {
    return ["une décision « correction » porte au moins une correction, et seule elle en porte"];
  }
  const motifs = decision.corrections
    .filter((correction) => correction.cible !== "item")
    .map((correction) => `${correction.chemin} : seul le contenu de l'item se corrige ici, pas la mesure`);
  const perimees = decision.corrections
    .filter((correction) => canoniser(lirePointeur(item, correction.chemin)) !== canoniser(correction.ancienne_valeur))
    .map((correction) => `${correction.chemin} : ancienne_valeur ne correspond plus à l'item publié`);
  const resultat = validerCorrections(decision.corrections.filter((correction) => correction.cible === "item"), acces);
  const refus: readonly RefusCorrection[] = resultat.ok ? [] : resultat.refus;
  return [...motifs, ...perimees, ...refus.map((un) => `${un.chemin} : ${un.motif}`)];
}

function contenuDecide(item: Item, decision: DecisionDuPanel): Item {
  if (decision.decision !== "correction") return item;
  const corrige = appliquerCorrections(item, decision.corrections);
  return { ...corrige, version: item.version + 1, empreinte: empreinteContenuNotant(corrige) };
}

function statutValidation(item: Item, decision: DecisionPanel): string {
  const statut = STATUT_VALIDATION_PAR_DECISION.get(decision);
  if (statut === undefined) throw new Error(`Décision du panel hors énumération : ${decision}`);
  return statut === null ? item.statut_validation : statut;
}

function publier(decision: DecisionDuPanel): DecisionPanelPubliee {
  return {
    date: decision.date,
    decision: decision.decision,
    motivation: decision.motivation,
    opinions_dissidentes: decision.opinions_dissidentes,
    arbitre_seul: decision.arbitre_seul,
  };
}

export interface ResultatPanel {
  readonly item: Item;
  /** À passer à `reecrireItem` : une correction du panel autorise la liste blanche, rien d'autre. */
  readonly autorisation: AutorisationReecriture;
}

export function appliquerDecisionPanel(
  item: Item,
  decision: DecisionDuPanel,
  trace: TraceEcriture,
  acces: AccesTexte,
): ResultatPanel {
  const cible = controlerCible(item, decision);
  controlerSimultaneite(item, decision);
  const motifs = motifsCorrections(item, decision, acces);
  if (motifs.length > 0) throw new CorrectionsDuPanelRefusees(item.id, motifs);

  const contenu = contenuDecide(item, decision);
  const contestations = contestationsDe(item).map((contestation) =>
    contestation.id === cible.id ? { ...contestation, decision_panel: publier(decision) } : contestation,
  );
  const toutesDecidees = contestations.every((contestation) => contestation.decision_panel !== undefined);
  return {
    item: {
      ...contenu,
      statut_validation: statutValidation(item, decision.decision),
      statut_contestation: toutesDecidees ? "arbitree" : "contestee",
      contestations,
      historique: entreeHistorique(
        item,
        contenu.version,
        trace,
        `décision du panel : ${decision.decision}`,
        `contestation ${cible.id}, délai ${delaiDecisionJours(cible, decision.date)} jour(s)`,
      ),
    },
    autorisation: { corrections: decision.decision === "correction" },
  };
}
