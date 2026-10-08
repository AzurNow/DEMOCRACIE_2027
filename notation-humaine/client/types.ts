/** Formes des réponses de l'API (`notation-humaine/serveur/routes.ts`). Aucune ne porte l'outil, un juge ni un autre annotateur. */

export interface Grille {
  readonly categories: readonly string[];
  readonly drapeaux: readonly string[];
  readonly motifs_inexactitude: readonly string[];
  readonly verdicts_soutien: readonly string[];
  readonly provenances: readonly string[];
}

export interface Session {
  readonly annotateur_id: string;
  readonly run_id: string;
  readonly date_gel: string;
  readonly version_grille: string;
  readonly grille: Grille;
}

export interface FileDeTravail {
  readonly a_noter: readonly { readonly reponse_id: string }[];
  readonly en_attente_test_des_liens: number;
  readonly attend_juge: number;
  readonly sans_motif_admis: number;
}

export interface Existence {
  readonly url_citee: string;
  readonly verdict_existence: string;
  readonly date_test: string;
  readonly url_finale?: string;
  readonly code_http?: number | null;
  readonly sha256_contenu?: string;
  readonly archive_url?: string;
}

export interface Citation {
  readonly url?: string;
  readonly texte?: string;
}

export interface EtatItem {
  readonly position: string;
  readonly paraphrase: string;
  readonly citation_verbatim: string;
  readonly quantification?: unknown;
}

export interface ItemSoumis {
  readonly item_id: string;
  readonly item_version: number;
  readonly item_empreinte: string;
  readonly role: string;
  readonly type: string;
  readonly candidat_id: string;
  readonly valide_du: string;
  readonly valide_au: string | null;
  readonly assertion?: EtatItem;
  readonly obsolescence?: { readonly date_changement: string; readonly etat_anterieur: EtatItem; readonly etat_posterieur: EtatItem };
}

export interface Vue {
  readonly version_vue: string;
  readonly version_grille: string;
  readonly date_run: string;
  readonly reponse_id: string;
  readonly question: { readonly gabarit: string; readonly texte: string };
  readonly reponse: {
    readonly texte: string;
    readonly liens: readonly Existence[];
    readonly citations?: readonly Citation[];
    readonly troncature: boolean;
    readonly refus_api: boolean;
    readonly normalisation: { readonly fonction: string; readonly version: string };
  };
  readonly references: readonly ItemSoumis[];
  readonly version_normalisation_verbatim: string;
}

export interface MotifRefus {
  readonly code: string;
  readonly detail: string;
  readonly chemin?: string;
}

export interface Soutien {
  readonly url_citee: string;
  readonly verdict_soutien: string;
}

export interface Saisie {
  readonly categorie: string;
  readonly drapeaux: readonly string[];
  readonly cite: boolean;
  readonly soutiens: readonly Soutien[];
  readonly motif_inexactitude?: string;
  readonly attribution?: { readonly attendus: readonly string[]; readonly cites: readonly string[]; readonly hors_perimetre_cites?: readonly string[] };
  readonly extrait?: { readonly texte: string; readonly provenance: string };
}
