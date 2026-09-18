/**
 * Règle de promotion : quand deux décisions font-elles un item vérifié ?
 *
 * C'est la seule porte entre `staging/` et `data/`, et elle ne s'ouvre pas toute seule : ce
 * module ne décide que du **sort** d'un item ; l'écriture est le fait de `pnpm promote
 * --ecrire`, lancé à la main. Aucune fonction d'ici n'écrit quoi que ce soit.
 *
 * Deux asymétries voulues, qui viennent du protocole et non du confort :
 *
 * - **Non-évaluable l'emporte sur retenu.** Si l'un dit « non évaluable » et l'autre « accepter »
 *   ou « corriger », l'item est non évaluable, sans arbitrage (§4). Le coût des deux erreurs
 *   n'est pas le même : inclure une position floue fabrique de fausses erreurs d'outils, tandis
 *   qu'exclure une vraie position ne coûte qu'un item.
 * - **Rejeter contre non-évaluable reste un désaccord.** L'un dit que l'extraction est fausse,
 *   l'autre que le candidat est flou : le statut final diffère, l'arbitre tranche.
 */

import { empreinteContenuNotant } from "./empreinte.ts";
import { reduireEtats } from "./grille.ts";
import type {
  Correction,
  Decision,
  EntreeDecision,
  Grille,
  Item,
  Mesure,
  NatureLot,
} from "./types.ts";

export type MotifAttente =
  | "lot_entrainement"
  | "item_conteste"
  | "decisions_insuffisantes"
  | "correction_mesure_en_attente";

export type MotifArbitrage =
  | "versions_differentes"
  | "desaccord"
  | "corrections_divergentes"
  | "paraphrase_seule"
  | "confirmation_absence_manquante";

export type StatutPromu = "verifie" | "rejete" | "non_evaluable";

export interface IssuePromouvoir {
  readonly sort: "promouvoir";
  readonly statut: StatutPromu;
  readonly item: Item;
  readonly corrections_appliquees: boolean;
}

export interface IssueArbitrage {
  readonly sort: "arbitrage";
  readonly motif: MotifArbitrage;
}

export interface IssueAttente {
  readonly sort: "attente";
  readonly motif: MotifAttente;
}

export type Issue = IssuePromouvoir | IssueArbitrage | IssueAttente;

export interface Dossier {
  readonly item: Item;
  readonly mesure: Mesure;
  readonly lot_id: string;
  readonly lot_nature: NatureLot;
  /** Décisions actives, une par annotateur. */
  readonly decisions: readonly EntreeDecision[];
}

export interface OptionsPromotion {
  /** Commit du dépôt au moment de la promotion. L'arbre doit être propre : c'est lui qui décrit l'état d'où sort la promotion. */
  readonly commit: string;
  readonly horodatage: string;
}

export function evaluerPromotion(dossier: Dossier, options: OptionsPromotion): Issue {
  const barrage = controlerPrealables(dossier);
  if (barrage !== null) return barrage;

  const [premiere, seconde] = dossier.decisions as [EntreeDecision, EntreeDecision];
  if (!memeVersionJugee(premiere, seconde)) {
    return { sort: "arbitrage", motif: "versions_differentes" };
  }

  return resoudre(dossier, premiere, seconde, options);
}

function controlerPrealables(dossier: Dossier): Issue | null {
  if (dossier.lot_nature === "entrainement") return { sort: "attente", motif: "lot_entrainement" };
  if (dossier.item.statut_contestation !== "aucune") {
    return { sort: "attente", motif: "item_conteste" };
  }
  if (!deuxAnnotateursDistincts(dossier.decisions)) {
    return { sort: "attente", motif: "decisions_insuffisantes" };
  }
  if (correctionDeMesureEnAttente(dossier)) {
    return { sort: "attente", motif: "correction_mesure_en_attente" };
  }
  return null;
}

function deuxAnnotateursDistincts(decisions: readonly EntreeDecision[]): boolean {
  if (decisions.length !== 2) return false;
  const [premiere, seconde] = decisions as [EntreeDecision, EntreeDecision];
  return premiere.annotateur_id !== seconde.annotateur_id;
}

function memeVersionJugee(premiere: EntreeDecision, seconde: EntreeDecision): boolean {
  return (
    premiere.item_version === seconde.item_version &&
    premiere.item_empreinte === seconde.item_empreinte
  );
}

/**
 * Le thème appartient à la mesure, référent partagé par plusieurs candidats. Une correction de
 * thème est donc une demande adressée au référentiel, pas une modification de l'item : tant que
 * la mesure ne porte pas le thème demandé, l'item attend. Une fois la mesure corrigée par la
 * commande dédiée, l'item est promu sans revalidation — la correction est ce que l'annotateur
 * demandait.
 */
function correctionDeMesureEnAttente(dossier: Dossier): boolean {
  for (const decision of dossier.decisions) {
    for (const correction of decision.corrections) {
      if (correction.cible !== "mesure") continue;
      if (!correctionDeMesureSatisfaite(correction, dossier.mesure)) return true;
    }
  }
  return false;
}

function correctionDeMesureSatisfaite(correction: Correction, mesure: Mesure): boolean {
  if (correction.chemin !== "/theme") return false;
  return mesure.theme === correction.nouvelle_valeur;
}

/* ----------------------------------------------- résolution des deux décisions */

function resoudre(
  dossier: Dossier,
  premiere: EntreeDecision,
  seconde: EntreeDecision,
  options: OptionsPromotion,
): Issue {
  const paire = new Set<Decision>([premiere.decision, seconde.decision]);

  if (estNonEvaluableEmportant(paire)) return terminal(dossier, "non_evaluable", options);
  if (paire.size === 1 && paire.has("rejeter")) return terminal(dossier, "rejete", options);
  if (paire.size === 1 && paire.has("accepter")) return verifier(dossier, premiere, seconde, options);
  if (paire.size === 1 && paire.has("corriger")) return verifier(dossier, premiere, seconde, options);
  return { sort: "arbitrage", motif: "desaccord" };
}

/**
 * « non évaluable » face à « accepter » ou « corriger » : exception du §4, sans arbitrage.
 * Face à « rejeter », c'est un désaccord ordinaire — les deux statuts finaux diffèrent.
 */
function estNonEvaluableEmportant(paire: ReadonlySet<Decision>): boolean {
  if (!paire.has("non_evaluable")) return false;
  if (paire.size === 1) return true;
  return paire.has("accepter") || paire.has("corriger");
}

function terminal(dossier: Dossier, statut: StatutPromu, options: OptionsPromotion): Issue {
  return {
    sort: "promouvoir",
    statut,
    item: appliquerValidations(dossier, dossier.item, statut, options, false),
    corrections_appliquees: false,
  };
}

function verifier(
  dossier: Dossier,
  premiere: EntreeDecision,
  seconde: EntreeDecision,
  options: OptionsPromotion,
): Issue {
  const manqueConfirmation = dossier.item.type === "A" && !absenceConfirmee(premiere, seconde);
  if (manqueConfirmation) {
    return { sort: "arbitrage", motif: "confirmation_absence_manquante" };
  }

  const corrige = fusionnerCorrections(dossier.item, premiere, seconde);
  if (corrige.sort === "arbitrage") return corrige;

  return {
    sort: "promouvoir",
    statut: "verifie",
    item: appliquerValidations(dossier, corrige.item, "verifie", options, corrige.modifie),
    corrections_appliquees: corrige.modifie,
  };
}

function absenceConfirmee(premiere: EntreeDecision, seconde: EntreeDecision): boolean {
  return (
    premiere.questions_specifiques?.confirmation_absence === true &&
    seconde.questions_specifiques?.confirmation_absence === true
  );
}

interface FusionReussie {
  readonly sort: "fusion";
  readonly item: Item;
  readonly modifie: boolean;
}

/**
 * Deux corrections sont concordantes si elles aboutissent au **même contenu notant**, ce qui
 * exclut la paraphrase : deux humains qui réécrivent une phrase divergent toujours d'un mot.
 * Contenu notant identique et paraphrases divergentes part en arbitrage marqué
 * « paraphrase seule », traité en lot ; jamais de choix silencieux entre deux paraphrases.
 */
function fusionnerCorrections(
  item: Item,
  premiere: EntreeDecision,
  seconde: EntreeDecision,
): FusionReussie | IssueArbitrage {
  if (premiere.decision === "accepter") return { sort: "fusion", item, modifie: false };

  const itemA = appliquerCorrections(item, premiere.corrections);
  const itemB = appliquerCorrections(item, seconde.corrections);

  if (empreinteContenuNotant(itemA) !== empreinteContenuNotant(itemB)) {
    return { sort: "arbitrage", motif: "corrections_divergentes" };
  }
  if (!memesParaphrases(itemA, itemB)) {
    return { sort: "arbitrage", motif: "paraphrase_seule" };
  }
  return { sort: "fusion", item: itemA, modifie: true };
}

function memesParaphrases(a: Item, b: Item): boolean {
  return JSON.stringify(paraphrases(a)) === JSON.stringify(paraphrases(b));
}

function paraphrases(item: Item): readonly (string | null)[] {
  return [
    item.assertion?.paraphrase ?? null,
    item.obsolescence?.etat_anterieur.paraphrase ?? null,
    item.obsolescence?.etat_posterieur.paraphrase ?? null,
  ];
}

/* ------------------------------------------- projection vers item.validations */

function appliquerValidations(
  dossier: Dossier,
  item: Item,
  statut: StatutPromu,
  options: OptionsPromotion,
  modifie: boolean,
): Item {
  const validations = dossier.decisions.map((decision) => projeterValidation(decision, item));
  const versionResultante = modifie ? item.version + 1 : item.version;

  return {
    ...item,
    version: versionResultante,
    // L'empreinte n'est recalculée que si le contenu notant a changé. La recalculer sur un item
    // intact remplacerait l'empreinte contre laquelle les deux annotateurs ont jugé par une
    // autre, calculée ici : l'épinglage des décisions ne pointerait plus sur rien.
    empreinte: modifie ? empreinteContenuNotant(item) : item.empreinte,
    statut_validation: statut,
    validations,
    ...(item.type === "A" && statut === "verifie"
      ? { absence: ajouterConfirmation(dossier, item, options) }
      : {}),
    historique: [
      ...(item.historique ?? []),
      {
        date: options.horodatage,
        changement: `promotion vers data/ : ${statut}`,
        motif: `lot ${dossier.lot_id}, deux décisions concordantes`,
        commit: options.commit,
        version_resultante: versionResultante,
      },
    ],
  };
}

function ajouterConfirmation(dossier: Dossier, item: Item, options: OptionsPromotion) {
  const bloc = item.absence;
  if (bloc === undefined) throw new Error(`Item A sans bloc absence : ${item.id}`);
  return {
    ...bloc,
    confirmation_initiale: {
      lot_id: dossier.lot_id,
      date: options.horodatage,
      annotateurs: dossier.decisions.map((decision) => decision.annotateur_id).sort(),
    },
  };
}

/** `item.validations[]` n'est qu'une projection appauvrie du journal, qui reste la trace primaire. */
function projeterValidation(decision: EntreeDecision, item: Item) {
  return {
    annotateur_id: decision.annotateur_id,
    decision: decision.decision,
    date: decision.horodatage,
    lot_id: decision.lot_id,
    reponses_grille: grillePourItem(decision, item),
    ...(decision.commentaire === null || decision.commentaire === undefined
      ? {}
      : { commentaire: decision.commentaire }),
  };
}

/** Un item O porte deux grilles ; `item.schema.json` en attend une. La réduction est ici. */
function grillePourItem(decision: EntreeDecision, item: Item): Grille {
  if (item.type !== "O") {
    const grille = decision.reponses_grille;
    if (grille === undefined) throw new Error(`Décision sans grille sur ${decision.item_id}`);
    return grille;
  }
  const parEtat = decision.reponses_par_etat;
  if (parEtat === undefined) throw new Error(`Décision d'item O sans grille par état : ${decision.item_id}`);
  return reduireEtats(parEtat.anterieur, parEtat.posterieur);
}

/* ------------------------------------------------- application des corrections */

/**
 * Champs qu'une correction peut atteindre. Liste blanche : ce qui n'y figure pas est
 * inatteignable depuis l'interface, identifiants, empreintes, statuts et sources compris.
 * Une source ne se corrige pas — un texte extrait faux se solde par un rejet et un renvoi au
 * pipeline (docs/CONTRATS.md §1).
 */
const CHEMINS_MODIFIABLES: readonly RegExp[] = [
  /^\/valide_du$/,
  /^\/valide_au$/,
  /^\/assertion\/(position|paraphrase|citation_verbatim|quantification)$/,
  /^\/obsolescence\/date_changement$/,
  /^\/obsolescence\/etat_(anterieur|posterieur)\/(position|paraphrase|citation_verbatim|quantification)$/,
];

export function cheminModifiable(chemin: string): boolean {
  return CHEMINS_MODIFIABLES.some((motif) => motif.test(chemin));
}

export function appliquerCorrections(item: Item, corrections: readonly Correction[]): Item {
  let resultat: unknown = structuredClone(item);
  for (const correction of corrections) {
    if (correction.cible !== "item") continue;
    if (!cheminModifiable(correction.chemin)) {
      throw new Error(`Chemin non modifiable depuis l'interface de validation : ${correction.chemin}`);
    }
    resultat = ecrireChemin(resultat, correction.chemin, correction.nouvelle_valeur);
  }
  return resultat as Item;
}

/** Écriture par pointeur JSON (RFC 6901), restreinte aux chemins de la liste blanche. */
function ecrireChemin(racine: unknown, chemin: string, valeur: unknown): unknown {
  const segments = chemin.split("/").slice(1);
  let noeud = racine as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    const suivant = noeud[segment];
    if (suivant === null || typeof suivant !== "object") {
      throw new Error(`Chemin absent de l'item : ${chemin}`);
    }
    noeud = suivant as Record<string, unknown>;
  }
  const dernier = segments[segments.length - 1] as string;
  noeud[dernier] = valeur;
  return racine;
}
