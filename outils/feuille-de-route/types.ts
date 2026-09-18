/**
 * Types du domaine de la feuille de route, tels que lus depuis `docs/feuille-de-route.json`.
 *
 * Ce fichier ne décrit que ce que le générateur consomme. `lecture.ts` est la seule frontière où
 * un JSON brut (`unknown`) devient une valeur de ces types : après elle, tout champ est présent
 * et de la bonne forme.
 */

export type Niveau = "T0" | "T1" | "T2" | "T3" | "T4";

export type TypeDependance = "bloque" | "informe";

export type StatutDecision = "en_attente" | "tranchee";

export interface Dependance {
  readonly lot: string;
  readonly type: TypeDependance;
}

export interface Decision {
  readonly id: string;
  readonly statut: StatutDecision;
  readonly question: string;
  readonly contexte: string;
  readonly options: readonly string[];
  readonly recommandation: string;
}

export interface Jalon {
  readonly id: string;
  readonly date: string;
  readonly titre: string;
  readonly critere: string;
}

interface LotSansNote {
  readonly id: string;
  readonly titre: string;
  readonly jalon: string;
  readonly niveau: Niveau;
  readonly agent: string;
  readonly taille: string;
  readonly temps_auteur_h: number;
  readonly depend_de: readonly Dependance[];
  readonly decisions: readonly string[];
}

export type Lot = LotSansNote | (LotSansNote & { readonly note: string });

export type Echelle = Readonly<Record<Niveau, string>>;

export interface FeuilleDeRoute {
  readonly date_maj: string;
  readonly echelle: Echelle;
  readonly jalons: readonly Jalon[];
  readonly decisions: readonly Decision[];
  readonly lots: readonly Lot[];
  readonly anomalies: readonly string[];
}
