/**
 * Diagnostic d'un lot : la **seule** lecture croisée entre deux annotateurs de tout le projet.
 *
 * Elle existe parce que le kappa n'a pas d'autre moyen d'exister. Elle est donc isolée dans ce
 * module, et son type de retour ne contient ni identifiant d'item, ni décision, ni rien qui
 * permette de remonter à un item précis : des agrégats, et le seul bit inévitable — « l'autre
 * a fini ce lot ». Ce bit est le prix du kappa, il est documenté comme tel, et il ne dit rien
 * d'un item.
 */

import { empreinteContenuNotant } from "./empreinte.ts";
import { CLES_GRILLE, reduireEtats } from "./grille.ts";
import { alerteReannotation, kappaPublie, kappaQuestion, type ResultatKappa } from "./kappa.ts";
import type { EtatAnnotateur } from "./journal.ts";
import { appliquerCorrections } from "./promotion.ts";
import type { CleGrille, Decision, EntreeDecision, Grille, Item, Lot } from "./types.ts";

export interface DiagnosticLot {
  readonly lot_id: string;
  readonly les_deux_ont_fini: boolean;
  /** Le chiffre publié et le critère go/no-go : trois catégories, non pondéré. */
  readonly kappa: ResultatKappa;
  /** Diagnostic secondaire, un par question de la grille. */
  readonly kappa_par_question: Readonly<Record<CleGrille, ResultatKappa>>;
  /**
   * Part des items que les deux ont corrigés vers des contenus notants divergents. Un taux qui
   * monte sans que le kappa bouge signale deux annotateurs d'accord sur le sort des items et en
   * désaccord sur leur contenu — ce que le kappa, par construction, ne peut pas voir.
   */
  readonly taux_double_correction_divergente: number | null;
  readonly alerte_reannotation: boolean;
}

export interface EntreeDiagnostic {
  readonly lot: Lot;
  readonly items: ReadonlyMap<string, Item>;
  /** État rejoué du journal, par annotateur. Exactement deux entrées. */
  readonly etats: ReadonlyMap<string, EtatAnnotateur>;
}

interface PaireDecisions {
  readonly item: Item;
  readonly a: EntreeDecision;
  readonly b: EntreeDecision;
}

export function diagnostiquerLot(entree: EntreeDiagnostic): DiagnosticLot {
  const [premier, second] = [...entree.etats.keys()].sort();
  if (premier === undefined || second === undefined) {
    throw new Error("Un diagnostic de lot exige exactement deux annotateurs.");
  }

  const etatA = entree.etats.get(premier) as EtatAnnotateur;
  const etatB = entree.etats.get(second) as EtatAnnotateur;
  const paires = apparier(entree, etatA, etatB);
  const kappa = kappaPublie(paires.map((paire) => ({ a: paire.a.decision, b: paire.b.decision })));

  return {
    lot_id: entree.lot.lot_id,
    les_deux_ont_fini: aFini(entree, etatA) && aFini(entree, etatB),
    kappa,
    kappa_par_question: kappaParQuestion(paires),
    taux_double_correction_divergente: tauxDivergence(paires),
    alerte_reannotation: alerteReannotation(kappa),
  };
}

/**
 * Un item retiré du lot pour contestation sort du dénominateur. Le §4 parle de lots de 50 ;
 * quand une contestation en retire un, le kappa porte sur ce qui reste, et `n` le dit.
 */
function apparier(
  entree: EntreeDiagnostic,
  etatA: EtatAnnotateur,
  etatB: EtatAnnotateur,
): readonly PaireDecisions[] {
  const paires: PaireDecisions[] = [];
  for (const reference of entree.lot.items) {
    if (etatA.retires.has(reference.item_id) || etatB.retires.has(reference.item_id)) continue;
    const a = etatA.decisions.get(reference.item_id);
    const b = etatB.decisions.get(reference.item_id);
    const item = entree.items.get(reference.item_id);
    if (a === undefined || b === undefined || item === undefined) continue;
    paires.push({ item, a, b });
  }
  return paires;
}

function aFini(entree: EntreeDiagnostic, etat: EtatAnnotateur): boolean {
  for (const reference of entree.lot.items) {
    if (etat.retires.has(reference.item_id)) continue;
    if (!etat.decisions.has(reference.item_id)) return false;
  }
  return true;
}

function kappaParQuestion(paires: readonly PaireDecisions[]): Record<CleGrille, ResultatKappa> {
  const resultats: Partial<Record<CleGrille, ResultatKappa>> = {};
  for (const cle of CLES_GRILLE) {
    resultats[cle] = kappaQuestion(
      paires.map((paire) => ({
        a: reponse(paire.a, paire.item, cle),
        b: reponse(paire.b, paire.item, cle),
      })),
    );
  }
  return resultats as Record<CleGrille, ResultatKappa>;
}

/** Sur un item O, la réponse comparée est la réduction des deux états — la même qu'à la promotion. */
function reponse(decision: EntreeDecision, item: Item, cle: CleGrille): boolean | null {
  const grille = grilleEffective(decision, item);
  if (grille === null) return null;
  return grille[cle];
}

function grilleEffective(decision: EntreeDecision, item: Item): Grille | null {
  if (item.type !== "O") return decision.reponses_grille ?? null;
  const parEtat = decision.reponses_par_etat;
  if (parEtat === undefined) return null;
  return reduireEtats(parEtat.anterieur, parEtat.posterieur);
}

function tauxDivergence(paires: readonly PaireDecisions[]): number | null {
  const doubles = paires.filter((paire) => estDouble(paire, "corriger"));
  if (doubles.length === 0) return null;
  const divergentes = doubles.filter((paire) => contenusDivergents(paire));
  return divergentes.length / doubles.length;
}

function estDouble(paire: PaireDecisions, decision: Decision): boolean {
  return paire.a.decision === decision && paire.b.decision === decision;
}

function contenusDivergents(paire: PaireDecisions): boolean {
  const versionA = appliquerCorrections(paire.item, paire.a.corrections);
  const versionB = appliquerCorrections(paire.item, paire.b.corrections);
  return empreinteContenuNotant(versionA) !== empreinteContenuNotant(versionB);
}

/**
 * Taux de « non évaluable » par annotateur, garde-fou du §4 contre l'usage de la sortie de
 * secours : un écart durable entre les deux annotateurs déclenche une séance de calibration.
 *
 * Volontairement **hors** de `DiagnosticLot` : ce chiffre part dans le rapport de promotion,
 * lu par l'auteur, et n'est jamais renvoyé par une route de l'interface. Un annotateur qui
 * verrait le taux de l'autre ne serait plus à l'aveugle.
 */
export function tauxNonEvaluable(etat: EtatAnnotateur, lot: Lot): number | null {
  let decides = 0;
  let nonEvaluables = 0;
  for (const reference of lot.items) {
    const decision = etat.decisions.get(reference.item_id);
    if (decision === undefined) continue;
    decides += 1;
    if (decision.decision === "non_evaluable") nonEvaluables += 1;
  }
  return decides === 0 ? null : nonEvaluables / decides;
}
