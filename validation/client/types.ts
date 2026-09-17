/**
 * Formes des charges utiles renvoyées par le serveur, vues du client.
 *
 * Elles sont volontairement écrites à la main plutôt qu'importées du serveur : le client ne
 * doit pas pouvoir toucher, même par un type, à ce que le serveur ne lui envoie pas.
 */

export type TypeItem = "P" | "A" | "O" | "F";
export type Decision = "accepter" | "corriger" | "rejeter" | "non_evaluable";
export type CleEmplacement = "assertion" | "anterieur" | "posterieur" | "couverture";

export interface SourceProjetee {
  tier: string;
  url: string;
  type_document: string;
  page: number | null;
  extrait: { debut: string; fin: string } | null;
  date_source: string;
  archive_url: string;
  sha256: string;
  texte_sha256: string | null;
  publication: string;
}

export interface EtatProjete {
  position: string;
  paraphrase: string;
  citation_verbatim: string;
  quantification: unknown;
  source: SourceProjetee;
  offsets: { debut: number; fin: number } | null;
}

export interface ItemProjete {
  id: string;
  version: number;
  empreinte: string;
  type: TypeItem;
  candidat_id: string;
  valide_du: string;
  valide_au: string | null;
  mesure: {
    libelle: string;
    theme: string;
    formulation_canonique: string;
    fictive: boolean;
    origine_fictive: string | null;
    verification_fictivite: {
      date: string;
      corpus_verifies: string[];
      resultat: string;
    } | null;
  };
  assertion: EtatProjete | null;
  absence: {
    source_couverture_theme: SourceProjetee;
    corpus_examine: { url: string; tier: string }[];
    date_examen: string;
  } | null;
  obsolescence: {
    date_changement: string;
    etat_anterieur: EtatProjete;
    etat_posterieur: EtatProjete;
  } | null;
}

export interface SourceAffichee {
  cle: CleEmplacement;
  libelle: string;
  type_affichage: "pdf" | "page" | "media";
  texte: string | null;
  texte_absent_motif: string | null;
  offsets: { debut: number; fin: number } | null;
  transcription: string | null;
}

export interface QuestionAffichee {
  cle: string;
  libelle: string;
  etat: CleEmplacement | null;
}

export interface Brouillon {
  item_id: string;
  lot_id: string;
  reponses?: Record<string, boolean>;
  reponses_par_etat?: { anterieur?: Record<string, boolean>; posterieur?: Record<string, boolean> };
  questions_specifiques?: Record<string, boolean>;
  commentaire?: string;
  duree_affichage_ms: number;
  duree_active_ms: number;
}

export interface VueItem {
  item: ItemProjete;
  sources: SourceAffichee[];
  questions: QuestionAffichee[];
  questions_specifiques: QuestionAffichee[];
  gestes: Record<Decision, number | "variable">;
  position: { index: number; total: number };
  lot_id: string;
  brouillon: Brouillon | null;
  annulable: { id: string; item_id: string } | null;
}

export interface Progression {
  total: number;
  decides: number;
  retires: number;
  restants: number;
  termine: boolean;
}

export interface LotResume {
  lot_id: string;
  nature: "entrainement" | "reel" | "reannotation";
  taille: number;
  date_creation: string;
  reannote: string | null;
  progression: Progression;
  accessible: boolean;
  motif_inaccessible: string | null;
}

export interface Session {
  annotateur_id: string;
  staging: string;
  /** Les dix thèmes du §3 et le vocabulaire de positions, lus dans schema/commun.schema.json. */
  themes: string[];
  positions: string[];
  lots: LotResume[];
}

export interface VueLot {
  lot: { lot_id: string; nature: string; taille: number; date_creation: string; reannote: string | null };
  ordre: string[];
  progression: Progression;
  item_courant: string | null;
  accessible: boolean;
  motif_inaccessible: string | null;
}

export interface ResultatKappa {
  kappa: number | null;
  motif_indefini: string | null;
  accord_observe: number | null;
  accord_attendu: number | null;
  n: number;
}

export interface Diagnostic {
  lot_id: string;
  les_deux_ont_fini: boolean;
  kappa: ResultatKappa | null;
  kappa_par_question?: Record<string, ResultatKappa>;
  taux_double_correction_divergente?: number | null;
  alerte_reannotation?: boolean;
}

export interface Raccourci {
  touche: string;
  libelle: string;
  categorie: string;
}

export interface Raccourcis {
  raccourcis: Raccourci[];
  touches_decision: Record<Decision, string>;
  touche_confirmation: string;
  touches_reponse: { oui: string; non: string };
}

export interface Correction {
  cible: "item" | "mesure";
  chemin: string;
  ancienne_valeur: unknown;
  nouvelle_valeur: unknown;
}
