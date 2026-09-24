/**
 * Table des routes.
 *
 * Elle est **exportée** et c'est délibéré : le test d'aveuglement l'énumère, exécute chaque
 * gestionnaire sur un jeu où l'autre annotateur a laissé des valeurs sentinelles, et vérifie
 * qu'aucune n'apparaît dans une réponse. Le même test compare cette table à celle que le
 * serveur enregistre réellement, de sorte qu'une route ajoutée plus tard sans y penser fasse
 * tomber la suite.
 *
 * Aucun gestionnaire ne lit d'identité d'annotateur dans une requête : elle vient du contexte,
 * qui la tient de l'environnement.
 */

import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import { diagnostiquerLot } from "../domaine/analyse-lot.ts";
import {
  construireAnnulation,
  construireDecision,
  construireRetrait,
  type SoumissionDecision,
} from "../domaine/decision.ts";
import { validerCorrections } from "../domaine/corrections.ts";
import { RACCOURCIS, TOUCHES_DECISION, TOUCHE_CONFIRMATION, TOUCHES_REPONSE } from "../domaine/interaction.ts";
import { itemCourant, prochaineVisite, progression, rejouer } from "../domaine/journal.ts";
import { ordreAffichage } from "../domaine/lot.ts";
import { ulid } from "../domaine/ulid.ts";
import type { Item, ItemDuLot, Lot } from "../domaine/types.ts";
import { servirArchive } from "../io/archives.ts";
import { lireTexteCanonique, lireTranscription, mesureDe, type Staging } from "../io/staging.ts";
import { enumerationCommune } from "../io/referentiels.ts";
import type { Contexte } from "./contexte.ts";
import { emplacement, emplacementDuChemin } from "./emplacements.ts";
import { construireVueItem, construireVueLot, projeterLot } from "./vues.ts";

export interface Reponse {
  readonly statut: number;
  readonly corps?: unknown;
  readonly binaire?: Buffer;
  readonly type_mime?: string;
}

export interface Route {
  readonly nom: string;
  readonly methode: "GET" | "POST";
  readonly motif: RegExp;
  readonly gestionnaire: (contexte: Contexte, params: readonly string[], corps: unknown) => Reponse;
}

/* --------------------------------------------------------------- session */

function session(contexte: Contexte): Reponse {
  const lots = contexte.lots().filter((lot) => lot.annotateurs.includes(contexte.annotateur_id));
  const blocage = motifBlocage(contexte, lots);
  return {
    statut: 200,
    corps: {
      annotateur_id: contexte.annotateur_id,
      staging: contexte.configuration.racine_staging,
      // Lus dans schema/commun.schema.json : les dix thèmes du §3 n'ont pas de seconde copie.
      themes: enumerationCommune(contexte.configuration.racine_depot, "theme"),
      positions: enumerationCommune(contexte.configuration.racine_depot, "position"),
      lots: lots.map((lot) => ({
        ...projeterLot(lot),
        progression: progression(lot.items, rejouer(contexte.journal.lire(lot.lot_id))),
        accessible: lot.nature === "entrainement" || blocage === null,
        motif_inaccessible: lot.nature === "entrainement" ? null : blocage,
      })),
    },
  };
}

/**
 * §4 : les annotateurs sont formés sur 30 items d'entraînement communs **avant tout lot réel**.
 * L'interface ne sert donc aucun lot réel tant qu'un lot d'entraînement reste inachevé.
 */
function motifBlocage(contexte: Contexte, lots: readonly Lot[]): string | null {
  const entrainements = lots.filter((lot) => lot.nature === "entrainement");
  if (entrainements.length === 0) {
    return "Aucun lot d'entraînement n'est composé : le §4 en exige un avant tout lot réel.";
  }
  for (const lot of entrainements) {
    const avancement = progression(lot.items, rejouer(contexte.journal.lire(lot.lot_id)));
    if (!avancement.termine) {
      return `Lot d'entraînement ${lot.lot_id} inachevé : ${avancement.restants} item(s) restant(s).`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------- lot */

function vueLot(contexte: Contexte, params: readonly string[]): Reponse {
  const lot_id = params[0] as string;
  const lot = contexte.lot(lot_id);
  if (lot === null) return { statut: 404, corps: { erreur: `Lot inconnu : ${lot_id}` } };

  const etat = rejouer(contexte.journal.lire(lot_id));
  const ordre = ordreAffichage(lot, contexte.annotateur_id);
  const blocage = lot.nature === "entrainement" ? null : motifBlocage(contexte, contexte.lots());

  return {
    statut: 200,
    corps: construireVueLot({
      lot,
      ordre,
      etat,
      item_courant: itemCourant(ordre, etat),
      accessible: blocage === null,
      motif_inaccessible: blocage,
    }),
  };
}

/**
 * Le kappa du lot, seule lecture croisée du projet. Rien n'est renvoyé tant que les deux
 * annotateurs n'ont pas fini : avant, le chiffre n'existe pas, et le seul fait de l'afficher
 * dirait où en est l'autre.
 */
function diagnostic(contexte: Contexte, params: readonly string[]): Reponse {
  const lot_id = params[0] as string;
  const lot = contexte.lot(lot_id);
  if (lot === null) return { statut: 404, corps: { erreur: `Lot inconnu : ${lot_id}` } };

  const staging = contexte.staging();
  const resultat = diagnostiquerLot({
    lot,
    items: staging.items,
    etats: contexte.etatsDuLot(lot),
  });

  if (!resultat.les_deux_ont_fini) {
    return { statut: 200, corps: { lot_id, les_deux_ont_fini: false, kappa: null } };
  }
  return { statut: 200, corps: resultat };
}

/* ------------------------------------------------------------------ item */

function vueItem(contexte: Contexte, params: readonly string[]): Reponse {
  const lot_id = params[0] as string;
  const item_id = params[1] as string;
  const cadre = resoudre(contexte, lot_id, item_id);
  if ("erreur" in cadre) return cadre.erreur;

  const { lot, item, staging, ordre } = cadre;
  const retrait = retirerSiConteste(contexte, lot, item);
  if (retrait !== null) return retrait;

  const index = ordre.findIndex((entree) => entree.item_id === item_id);
  return {
    statut: 200,
    corps: {
      ...construireVueItem(item, mesureDe(staging, item), accesTextes(contexte), {
        index,
        total: ordre.length,
      }),
      lot_id,
      brouillon: brouillonDe(contexte, lot_id, item_id),
      annulable: annulable(contexte, lot_id),
    },
  };
}

function accesTextes(contexte: Contexte) {
  const racine = contexte.configuration.racine_staging;
  return {
    texte: (sha256: string | null) => (sha256 === null ? null : lireTexteCanonique(racine, sha256)),
    transcription: (sha256: string) => lireTranscription(racine, sha256),
  };
}

function brouillonDe(contexte: Contexte, lot_id: string, item_id: string) {
  const brouillon = contexte.brouillons.lire();
  if (brouillon === null) return null;
  if (brouillon.lot_id !== lot_id || brouillon.item_id !== item_id) return null;
  return brouillon;
}

function annulable(contexte: Contexte, lot_id: string): { id: string; item_id: string } | null {
  const etat = rejouer(contexte.journal.lire(lot_id));
  if (etat.annulable === null) return null;
  return { id: etat.annulable.id, item_id: etat.annulable.item_id };
}

/**
 * §4, droit de réponse : une contestation retire l'item du lot en cours, immédiatement. Le
 * retrait est journalisé, une fois, pour que le dénominateur du kappa reste auditable.
 */
function retirerSiConteste(contexte: Contexte, lot: Lot, item: Item): Reponse | null {
  if (item.statut_contestation === "aucune") return null;
  const etat = rejouer(contexte.journal.lire(lot.lot_id));
  if (!etat.retires.has(item.id)) {
    contexte.journal.ajouter(
      lot.lot_id,
      construireRetrait({
        identifiant: ulid(),
        annotateur_id: contexte.annotateur_id,
        lot_id: lot.lot_id,
        lot_nature: lot.nature,
        item_id: item.id,
        motif: `item ${item.statut_contestation}`,
        horodatage: contexte.maintenant(),
      }),
    );
  }
  return {
    statut: 409,
    corps: {
      retire: true,
      item_id: item.id,
      motif:
        "Cet item a été contesté : il sort du lot en cours et n'est pas à valider. " +
        "Le panel statue sous 14 jours (annexe E).",
    },
  };
}

/* -------------------------------------------------------------- décisions */

interface RequeteDecision extends SoumissionDecision {
  readonly lot_id: string;
}

function enregistrerDecision(contexte: Contexte, _params: readonly string[], corps: unknown): Reponse {
  const requete = corps as Partial<RequeteDecision>;
  const cadre = resoudre(contexte, requete.lot_id ?? "", requete.item_id ?? "");
  if ("erreur" in cadre) return cadre.erreur;

  const { lot, item } = cadre;
  const retrait = retirerSiConteste(contexte, lot, item);
  if (retrait !== null) return retrait;

  const corrections = validerCorrections(
    requete.corrections ?? [],
    accesCorrections(contexte, item),
  );
  if (!corrections.ok) return { statut: 422, corps: { ok: false, refus: corrections.refus } };

  const etat = rejouer(contexte.journal.lire(lot.lot_id));
  const construite = construireDecision(
    { ...(requete as RequeteDecision), corrections: corrections.corrections },
    {
      annotateur_id: contexte.annotateur_id,
      lot_id: lot.lot_id,
      lot_nature: lot.nature,
      item,
      visite: prochaineVisite(etat, item.id),
      horodatage: contexte.maintenant(),
      identifiant: ulid(),
    },
  );
  if (!construite.ok) return { statut: 422, corps: { ok: false, manquements: construite.manquements } };

  // L'entrée que le corps de la requête va devenir, confrontée à son schéma avant tout ajout
  // (revue du 2026-09-23, constat 2 : `decision: "approuver"` était écrit au journal, puis compté
  // « non évaluable » dans le kappa). Non conforme : HTTP 400, rien n'est écrit.
  const nonConforme = erreurDeSchema("decision", construite.entree, "requête POST /api/decisions");
  if (nonConforme !== null) return { statut: 400, corps: { ok: false, erreur: nonConforme.message } };

  contexte.journal.ajouter(lot.lot_id, construite.entree);
  contexte.brouillons.effacer();
  return { statut: 201, corps: { ok: true, id: construite.entree.id } };
}

function accesCorrections(contexte: Contexte, item: Item) {
  const acces = accesTextes(contexte);
  return {
    texteSource(chemin: string): string | null {
      const lieu = emplacementDuChemin(chemin);
      if (lieu === null) return null;
      const trouve = emplacement(item, lieu);
      if (trouve === null) return null;
      return acces.texte(trouve.source.texte_sha256 === undefined ? null : trouve.source.texte_sha256);
    },
    offsetsActuels(chemin: string) {
      const lieu = emplacementDuChemin(chemin);
      const trouve = lieu === null ? null : emplacement(item, lieu);
      const test = trouve?.etat?.test_verbatim;
      return {
        debut: test?.offset_debut === undefined ? null : test.offset_debut,
        fin: test?.offset_fin === undefined ? null : test.offset_fin,
      };
    },
  };
}

/** Annuler, c'est écrire une entrée de plus. Rien n'est effacé, jamais. */
function annuler(contexte: Contexte, _params: readonly string[], corps: unknown): Reponse {
  const requete = corps as { lot_id?: string; commentaire?: string | null };
  const lot = contexte.lot(requete.lot_id ?? "");
  if (lot === null) return { statut: 404, corps: { erreur: "Lot inconnu" } };

  const etat = rejouer(contexte.journal.lire(lot.lot_id));
  if (etat.annulable === null) {
    return { statut: 409, corps: { erreur: "Aucune décision à annuler dans ce lot." } };
  }

  const entree = construireAnnulation({
    identifiant: ulid(),
    annotateur_id: contexte.annotateur_id,
    lot_id: lot.lot_id,
    lot_nature: lot.nature,
    item_id: etat.annulable.item_id,
    annule: etat.annulable.id,
    horodatage: contexte.maintenant(),
    ...(requete.commentaire === undefined ? {} : { commentaire: requete.commentaire }),
  });
  contexte.journal.ajouter(lot.lot_id, entree);
  return { statut: 201, corps: { ok: true, id: entree.id, item_id: entree.item_id } };
}

/* -------------------------------------------------------------- brouillon */

function lireBrouillon(contexte: Contexte): Reponse {
  return { statut: 200, corps: contexte.brouillons.lire() };
}

function ecrireBrouillon(contexte: Contexte, _params: readonly string[], corps: unknown): Reponse {
  contexte.brouillons.ecrire(corps as never);
  return { statut: 204 };
}

/* ---------------------------------------------------------------- source */

function servirSource(contexte: Contexte, params: readonly string[]): Reponse {
  const cadre = resoudre(contexte, params[0] as string, params[1] as string);
  if ("erreur" in cadre) return cadre.erreur;

  const lieu = emplacement(cadre.item, params[2] as string);
  if (lieu === null) return { statut: 404, corps: { erreur: "Emplacement inconnu" } };
  if (lieu.source.chemin_local === undefined) {
    return { statut: 404, corps: { erreur: "Aucune copie locale pour cette source." } };
  }

  const servie = servirArchive({
    racine: contexte.configuration.racine_depot,
    chemin_local: lieu.source.chemin_local,
    sha256: lieu.source.sha256,
  });
  if (!servie.ok) {
    return {
      statut: 409,
      corps: {
        erreur: "Archive non conforme : rien n'est affiché.",
        motif: servie.motif,
        detail: servie.detail,
      },
    };
  }
  return { statut: 200, binaire: servie.contenu, type_mime: servie.type_mime };
}

/* ----------------------------------------------------------- raccourcis */

function raccourcis(): Reponse {
  return {
    statut: 200,
    corps: {
      raccourcis: RACCOURCIS,
      touches_decision: TOUCHES_DECISION,
      touche_confirmation: TOUCHE_CONFIRMATION,
      touches_reponse: TOUCHES_REPONSE,
    },
  };
}

/* ------------------------------------------------------------- résolution */

interface Cadre {
  readonly lot: Lot;
  readonly item: Item;
  readonly staging: Staging;
  readonly ordre: readonly ItemDuLot[];
}

function resoudre(contexte: Contexte, lot_id: string, item_id: string): Cadre | { erreur: Reponse } {
  const lot = contexte.lot(lot_id);
  if (lot === null) return { erreur: { statut: 404, corps: { erreur: `Lot inconnu : ${lot_id}` } } };

  const ordre = ordreAffichage(lot, contexte.annotateur_id);
  if (!ordre.some((entree) => entree.item_id === item_id)) {
    return { erreur: { statut: 404, corps: { erreur: `Item hors du lot ${lot_id}` } } };
  }

  const staging = contexte.staging();
  const item = staging.items.get(item_id);
  if (item === undefined) {
    return { erreur: { statut: 404, corps: { erreur: `Item ${item_id} absent de staging` } } };
  }
  return { lot, item, staging, ordre };
}

/* --------------------------------------------------------------- la table */

export const ROUTES: readonly Route[] = [
  { nom: "session", methode: "GET", motif: /^\/api\/session$/, gestionnaire: session },
  { nom: "lot", methode: "GET", motif: /^\/api\/lots\/([^/]+)$/, gestionnaire: vueLot },
  {
    nom: "diagnostic",
    methode: "GET",
    motif: /^\/api\/lots\/([^/]+)\/diagnostic$/,
    gestionnaire: diagnostic,
  },
  {
    nom: "item",
    methode: "GET",
    motif: /^\/api\/lots\/([^/]+)\/items\/([^/]+)$/,
    gestionnaire: vueItem,
  },
  { nom: "decision", methode: "POST", motif: /^\/api\/decisions$/, gestionnaire: enregistrerDecision },
  { nom: "annulation", methode: "POST", motif: /^\/api\/annulations$/, gestionnaire: annuler },
  { nom: "brouillon-lire", methode: "GET", motif: /^\/api\/brouillon$/, gestionnaire: lireBrouillon },
  { nom: "brouillon-ecrire", methode: "POST", motif: /^\/api\/brouillon$/, gestionnaire: ecrireBrouillon },
  { nom: "raccourcis", methode: "GET", motif: /^\/api\/raccourcis$/, gestionnaire: raccourcis },
  {
    nom: "source",
    methode: "GET",
    motif: /^\/api\/lots\/([^/]+)\/items\/([^/]+)\/source\/([^/]+)$/,
    gestionnaire: servirSource,
  },
];

/** Pour le test d'aveuglement : la liste des noms, comparée à celle du serveur. */
export const NOMS_ROUTES: readonly string[] = ROUTES.map((route) => route.nom);

export function trouverRoute(methode: string, chemin: string): { route: Route; params: string[] } | null {
  for (const route of ROUTES) {
    if (route.methode !== methode) continue;
    const trouve = route.motif.exec(chemin);
    if (trouve !== null) return { route, params: trouve.slice(1) };
  }
  return null;
}
