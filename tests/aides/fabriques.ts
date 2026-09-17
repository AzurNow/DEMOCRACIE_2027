/**
 * Fabriques d'objets pour les tests. Aucun candidat réel, aucune position réelle : les items
 * de test portent des identifiants ouvertement fictifs. Inventer une position attribuée à une
 * personne réelle est interdit sans réserve, et un fichier de test n'est pas une exception.
 */

import { empreinteContenuNotant, empreinteDe } from "../../validation/domaine/empreinte.ts";
import type {
  Correction,
  Decision,
  EntreeDecision,
  Grille,
  Item,
  Mesure,
  NatureLot,
  QuestionsSpecifiques,
  Source,
} from "../../validation/domaine/types.ts";

export const GRILLE_TOUT_VRAI: Grille = {
  citation_fidele: true,
  paraphrase_exacte: true,
  position_univoque: true,
  theme_correct: true,
  quantification_correcte: true,
};

export function source(surcharges: Partial<Source> = {}): Source {
  return {
    tier: "T1",
    url: "https://demo.invalid/programme.pdf",
    type_document: "programme_pdf",
    page: 14,
    sha256: "1".repeat(64),
    texte_sha256: "2".repeat(64),
    archive_url: "https://archive.invalid/programme.pdf",
    date_source: "2026-09-01",
    date_collecte: "2026-09-03T09:12:00+02:00",
    chemin_local: "validation/fixtures/archives/programme.pdf",
    publication: "publique",
    ...surcharges,
  };
}

export function mesure(surcharges: Partial<Mesure> = {}): Mesure {
  const socle: Mesure = {
    id: "01JBANCESSAI0000000MESURE1",
    version: 1,
    empreinte: "3".repeat(64),
    libelle: "TVA réduite sur l'énergie",
    theme: "fiscalite_pouvoir_achat",
    formulation_canonique: "ramener la TVA sur les produits énergétiques à 5,5 %",
    fictive: false,
    ...surcharges,
  };
  return socle;
}

export function itemP(surcharges: Partial<Item> = {}): Item {
  const socle: Item = {
    id: "01JBANCESSAI00000000ITEM01",
    version: 1,
    empreinte: "0".repeat(64),
    type: "P",
    candidat_id: "demo-alpha",
    mesure_id: "01JBANCESSAI0000000MESURE1",
    mesure_version: 1,
    statut_validation: "en_attente",
    statut_contestation: "aucune",
    valide_du: "2026-09-01",
    valide_au: null,
    assertion: {
      position: "pour",
      paraphrase: "Ramener la TVA sur les produits énergétiques de 20 % à 5,5 %.",
      citation_verbatim: "Nous ramènerons la TVA sur l'énergie à 5,5 %.",
      quantification: { dimensions: [{ type: "taux", valeur: 5.5, unite: "%", operateur: "exact" }] },
      source: source(),
    },
    validations: [],
    contestations: [],
    historique: [
      {
        date: "2026-09-03T10:00:00+02:00",
        changement: "création",
        commit: "a".repeat(40),
        version_resultante: 1,
      },
    ],
    ...surcharges,
  };
  return { ...socle, empreinte: empreinteContenuNotant(socle) };
}

export function itemA(surcharges: Partial<Item> = {}): Item {
  const { assertion: _ignore, ...sansAssertion } = itemP();
  const socle: Item = {
    ...sansAssertion,
    id: "01JBANCESSAI00000000ITEM02",
    type: "A",
    absence: {
      source_couverture_theme: source(),
      corpus_examine: [{ url: "https://demo.invalid/programme.pdf", sha256: "1".repeat(64), tier: "T1" }],
      date_examen: "2026-09-04T10:00:00+02:00",
      reverifications: [],
    },
    ...surcharges,
  };
  return { ...socle, empreinte: empreinteContenuNotant(socle) };
}

export function itemO(surcharges: Partial<Item> = {}): Item {
  const { assertion: _ignore, ...sansAssertion } = itemP();
  const socle: Item = {
    ...sansAssertion,
    id: "01JBANCESSAI00000000ITEM03",
    type: "O",
    obsolescence: {
      date_changement: "2026-11-03",
      etat_anterieur: {
        position: "pour",
        paraphrase: "Abaisser l'âge légal de départ à 60 ans.",
        citation_verbatim: "Nous rétablirons la retraite à 60 ans.",
        source: source(),
      },
      etat_posterieur: {
        position: "conditionnel",
        paraphrase: "Abaisser l'âge légal à 62 ans, sauf carrières longues.",
        citation_verbatim: "Ce sera 62 ans, et 60 ans pour les carrières longues.",
        source: source({ tier: "T2", type_document: "enregistrement_video" }),
      },
      remplace_item_id: null,
    },
    ...surcharges,
  };
  return { ...socle, empreinte: empreinteContenuNotant(socle) };
}

export function itemF(surcharges: Partial<Item> = {}): Item {
  const { assertion: _ignore, ...sansAssertion } = itemP();
  const socle: Item = {
    ...sansAssertion,
    id: "01JBANCESSAI00000000ITEM04",
    type: "F",
    mesure_id: "01JBANCESSAI0000000MESURE2",
    ...surcharges,
  };
  return { ...socle, empreinte: empreinteContenuNotant(socle) };
}

let compteur = 0;

export interface OptionsDecision {
  readonly annotateur_id: string;
  readonly item: Item;
  readonly decision: Decision;
  readonly lot_id?: string;
  readonly lot_nature?: NatureLot;
  readonly reponses_grille?: Grille;
  readonly reponses_par_etat?: EntreeDecision["reponses_par_etat"];
  readonly questions_specifiques?: QuestionsSpecifiques;
  readonly corrections?: readonly Correction[];
  readonly item_version?: number;
  readonly item_empreinte?: string;
  readonly commentaire?: string | null;
}

export function decision(options: OptionsDecision): EntreeDecision {
  compteur += 1;
  const grilleParDefaut =
    options.item.type === "O" ? {} : { reponses_grille: options.reponses_grille ?? GRILLE_TOUT_VRAI };
  const parEtat =
    options.item.type === "O"
      ? {
          reponses_par_etat: options.reponses_par_etat ?? {
            anterieur: GRILLE_TOUT_VRAI,
            posterieur: GRILLE_TOUT_VRAI,
          },
        }
      : {};

  const socle = {
    id: `01JBANCESSAIDECISION${String(compteur).padStart(6, "0")}`,
    journal_version: 1,
    type_entree: "decision" as const,
    annotateur_id: options.annotateur_id,
    lot_id: options.lot_id ?? "lot-001",
    lot_nature: options.lot_nature ?? ("reel" as NatureLot),
    item_id: options.item.id,
    item_version: options.item_version ?? options.item.version,
    item_empreinte: options.item_empreinte ?? options.item.empreinte,
    item_type: options.item.type,
    decision: options.decision,
    ...grilleParDefaut,
    ...parEtat,
    ...(options.questions_specifiques === undefined
      ? {}
      : { questions_specifiques: options.questions_specifiques }),
    corrections: options.corrections ?? [],
    commentaire: options.commentaire === undefined ? null : options.commentaire,
    horodatage: "2026-09-20T10:00:00+02:00",
    duree_affichage_ms: 40000,
    duree_active_ms: 38000,
    visite: 1,
  };
  return { ...socle, empreinte_ligne: empreinteDe(socle) };
}

export const OPTIONS_PROMOTION = {
  commit: "b".repeat(40),
  horodatage: "2026-09-21T09:00:00+02:00",
};
