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

interface DecisionCommune {
  readonly id: string;
  readonly question: string;
  readonly contexte: string;
  readonly options: readonly string[];
  readonly recommandation: string;
}

/**
 * Une décision tranchée porte ce que l'auteur a retenu et le jour où il l'a fait. Les deux champs
 * sont exigés par le type, et non optionnels : une décision dite tranchée dont on ne lirait que la
 * recommandation laisserait croire que la recommandation *est* la décision, alors qu'elle peut en
 * différer. La date compte autant : une convention de tirage tranchée après un run ne vaut pas la
 * même chose qu'une convention tranchée avant.
 */
export type DecisionTranchee = DecisionCommune & {
  readonly statut: "tranchee";
  readonly retenu: string;
  readonly date_decision: string;
};

export type Decision = (DecisionCommune & { readonly statut: "en_attente" }) | DecisionTranchee;

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
