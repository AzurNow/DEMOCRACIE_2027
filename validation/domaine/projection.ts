/**
 * Projection d'un item de staging vers ce que l'écran de validation reçoit.
 *
 * **Liste blanche, jamais filtre.** Un filtre laisse passer ce qu'on a oublié d'interdire ;
 * une liste blanche ne laisse passer que ce qu'on a nommé. La différence compte ici parce que
 * l'aveuglement du §4 porte sur des champs qui n'existent pas encore : le jour où la collecte
 * ajoutera `extraction.score_de_confiance` à un item, ce champ n'arrivera pas à l'écran, sans
 * que personne ait eu à y penser.
 *
 * Ce que l'annotateur ne doit jamais voir : la décision de l'autre annotateur, le fait qu'un
 * item ait déjà été validé, l'identité du modèle qui a extrait l'item, et si les deux
 * extractions étaient d'accord.
 */

import type {
  BlocAbsence,
  BlocObsolescence,
  EtatPositionnel,
  Item,
  Mesure,
  Source,
  TypeItem,
} from "./types.ts";

export interface SourceProjetee {
  readonly tier: "T1" | "T2" | "T3";
  readonly url: string;
  readonly type_document: string;
  readonly page: number | null;
  readonly extrait: { readonly debut: string; readonly fin: string } | null;
  readonly date_source: string;
  readonly archive_url: string;
  /** Empreinte du document archivé : affichée, et vérifiée avant tout affichage. */
  readonly sha256: string;
  /** Empreinte du texte canonique, clé du fichier de `staging/textes/`. */
  readonly texte_sha256: string | null;
  readonly publication: "publique" | "interne";
}

export interface EtatProjete {
  readonly position: string;
  readonly paraphrase: string;
  readonly citation_verbatim: string;
  readonly quantification: unknown;
  readonly source: SourceProjetee;
  readonly offsets: { readonly debut: number; readonly fin: number } | null;
}

export interface ItemProjete {
  readonly id: string;
  readonly version: number;
  readonly empreinte: string;
  readonly type: TypeItem;
  readonly candidat_id: string;
  readonly valide_du: string;
  readonly valide_au: string | null;
  readonly mesure: {
    readonly libelle: string;
    readonly theme: string;
    readonly formulation_canonique: string;
    readonly fictive: boolean;
    readonly origine_fictive: string | null;
    readonly verification_fictivite: {
      readonly date: string;
      readonly corpus_verifies: readonly string[];
      readonly resultat: string;
    } | null;
  };
  readonly assertion: EtatProjete | null;
  readonly absence: {
    readonly source_couverture_theme: SourceProjetee;
    readonly corpus_examine: readonly { readonly url: string; readonly tier: string }[];
    readonly date_examen: string;
  } | null;
  readonly obsolescence: {
    readonly date_changement: string;
    readonly etat_anterieur: EtatProjete;
    readonly etat_posterieur: EtatProjete;
  } | null;
}

export function projeterItem(item: Item, mesure: Mesure): ItemProjete {
  return {
    id: item.id,
    version: item.version,
    empreinte: item.empreinte,
    type: item.type,
    candidat_id: item.candidat_id,
    valide_du: item.valide_du,
    valide_au: item.valide_au,
    mesure: projeterMesure(mesure),
    assertion: item.assertion === undefined ? null : projeterEtat(item.assertion),
    absence: item.absence === undefined ? null : projeterAbsence(item.absence),
    obsolescence: item.obsolescence === undefined ? null : projeterObsolescence(item.obsolescence),
  };
}

function projeterMesure(mesure: Mesure): ItemProjete["mesure"] {
  return {
    libelle: mesure.libelle,
    theme: mesure.theme,
    formulation_canonique: mesure.formulation_canonique,
    fictive: mesure.fictive,
    origine_fictive: mesure.origine_fictive === undefined ? null : mesure.origine_fictive,
    verification_fictivite:
      mesure.verification_fictivite === undefined
        ? null
        : {
            date: mesure.verification_fictivite.date,
            corpus_verifies: mesure.verification_fictivite.corpus_verifies,
            resultat: mesure.verification_fictivite.resultat,
          },
  };
}

function projeterEtat(etat: EtatPositionnel): EtatProjete {
  const debut = etat.test_verbatim?.offset_debut;
  const fin = etat.test_verbatim?.offset_fin;
  return {
    position: etat.position,
    paraphrase: etat.paraphrase,
    citation_verbatim: etat.citation_verbatim,
    quantification: etat.quantification === undefined ? null : etat.quantification,
    source: projeterSource(etat.source),
    // Ni `passe`, ni la version de normalisation : l'annotateur juge la citation contre la
    // source affichée, pas contre le verdict d'un test qu'il pourrait être tenté de suivre.
    offsets: debut === undefined || fin === undefined ? null : { debut, fin },
  };
}

function projeterSource(source: Source): SourceProjetee {
  return {
    tier: source.tier,
    url: source.url,
    type_document: source.type_document,
    page: source.page === undefined ? null : source.page,
    extrait: source.extrait === undefined ? null : source.extrait,
    date_source: source.date_source,
    archive_url: source.archive_url,
    sha256: source.sha256,
    texte_sha256: source.texte_sha256 === undefined ? null : source.texte_sha256,
    publication: source.publication,
  };
}

function projeterAbsence(absence: BlocAbsence): NonNullable<ItemProjete["absence"]> {
  return {
    source_couverture_theme: projeterSource(absence.source_couverture_theme),
    corpus_examine: absence.corpus_examine.map((entree) => ({ url: entree.url, tier: entree.tier })),
    date_examen: absence.date_examen,
  };
}

function projeterObsolescence(bloc: BlocObsolescence): NonNullable<ItemProjete["obsolescence"]> {
  return {
    date_changement: bloc.date_changement,
    etat_anterieur: projeterEtat(bloc.etat_anterieur),
    etat_posterieur: projeterEtat(bloc.etat_posterieur),
  };
}

/**
 * Champs de staging qui ne doivent jamais atteindre le client. Cette liste ne sert pas à
 * filtrer — la projection est déjà une liste blanche — mais à faire échouer un test le jour où
 * l'un d'eux apparaîtrait dans une réponse, par un chemin qu'on n'a pas prévu.
 */
export const CHAMPS_INTERDITS: readonly string[] = [
  "extraction",
  "modeles",
  "accord",
  "detail_desaccord",
  "validations",
  "statut_validation",
  "statut_contestation",
  "chemin_local",
  "test_verbatim",
  "reverifications",
  "confirmation_initiale",
  "libelle_lisible",
];
