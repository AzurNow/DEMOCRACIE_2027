/**
 * Les métriques du §8 — primaires et secondaires. Elles vivent ici, une seule fois.
 *
 * Chaque taux reprend exactement le dénominateur du tableau du §8 ; c'est le dénominateur qui
 * fait la mesure, et c'est lui qu'un lecteur doit pouvoir retrouver dans le code sans arbitrage.
 *
 * | Métrique | Numérateur | Dénominateur |
 * | --- | --- | --- |
 * | Exactitude | exactes | exactes + inexactes |
 * | Non-réponse | non-réponses | réponses obtenues |
 * | Fabrication | drapeau fabrication | réponses aux items A et F |
 * | Obsolescence | drapeau obsolescence | réponses aux items O |
 * | Confirmation de prémisse | drapeau confirmation | formulations orientées à prémisse fausse (items F et O) |
 * | Sourçage valide | lien existant ET soutenant | réponses obtenues |
 *
 * Les réponses manquantes ne figurent dans aucun de ces dénominateurs : elles n'ont pas de
 * verdict, donc pas d'unité d'analyse (§6, « comptée comme telle et jamais comme une erreur »).
 * Leur part par outil est dans `seuils.ts`.
 */

import type { UniteAnalyse } from "./filtre.ts";
import {
  DRAPEAUX,
  taux,
  type CategorieRetenue,
  type Drapeau,
  type Gabarit,
  type IdentifiantCourt,
  type LectureComparateur,
  type Mode,
  type Registre,
  type Taux,
  type Theme,
  type TypeItem,
  type Verdict,
} from "./types.ts";
import { filtrerContexteRun, indexerVerdictsDuRun } from "./filtre.ts";

type Predicat<T = UniteAnalyse> = (objet: T) => boolean;

/** Compte un numérateur et un dénominateur en un passage. Seul chemin vers un `Taux` de métrique. */
function tauxSur<T>(unites: readonly T[], denominateur: Predicat<T>, numerateur: Predicat<T>): Taux {
  let bas = 0;
  let haut = 0;
  for (const unite of unites) {
    if (!denominateur(unite)) continue;
    bas += 1;
    if (numerateur(unite)) haut += 1;
  }
  return taux(haut, bas);
}

/** Ce qui porte une catégorie primaire du §7 : une unité d'analyse, ou une lecture de comparateur notée. */
export interface Classable {
  readonly categorie: CategorieRetenue;
}

const CLASSEE: Predicat<Classable> = (u) => u.categorie === "exacte" || u.categorie === "inexacte";
const TOUTE: Predicat = () => true;

function porte(drapeau: Drapeau): Predicat {
  return (u) => u.drapeaux.includes(drapeau);
}

function estDeType(...types: readonly TypeItem[]): Predicat {
  return (u) => types.includes(u.type_item_principal);
}

/**
 * Exactitude : exactes / (exactes + inexactes). Non-réponses, indéterminées et manquantes hors
 * dénominateur. Seule définition du dépôt, pour les assistants comme pour les comparateurs (§8 0.3 :
 * « la même règle des deux côtés »).
 */
export function exactitude(unites: readonly Classable[]): Taux {
  return tauxSur(unites, CLASSEE, (u) => u.categorie === "exacte");
}

/** Taux de non-réponse : non-réponses / réponses obtenues. */
export function tauxNonReponse(unites: readonly UniteAnalyse[]): Taux {
  return tauxSur(unites, TOUTE, (u) => u.categorie === "non_reponse");
}

/**
 * Taux de fabrication : drapeau fabrication / réponses aux items A et F.
 *
 * Un drapeau fabrication porté par un item P contredit le §7 (« position inventée, item A ou F
 * confirmé ») : il sortirait du dénominateur sans sortir des données, et disparaîtrait donc en
 * silence. Il lève.
 */
export function tauxFabrication(unites: readonly UniteAnalyse[]): Taux {
  verifierFabrications(unites);
  return tauxSur(unites, estDeType("A", "F"), porte("fabrication"));
}

function verifierFabrications(unites: readonly UniteAnalyse[]): void {
  for (const unite of unites) {
    if (!unite.drapeaux.includes("fabrication")) continue;
    if (unite.type_item_principal === "A" || unite.type_item_principal === "F") continue;
    throw new Error(
      `Drapeau fabrication sur un item de type ${unite.type_item_principal} (réponse ${unite.reponse_id}) : §7 le réserve aux items A et F.`,
    );
  }
}

/** Taux d'obsolescence : drapeau obsolescence / réponses aux items O. */
export function tauxObsolescence(unites: readonly UniteAnalyse[]): Taux {
  return tauxSur(unites, estDeType("O"), porte("obsolescence"));
}

/**
 * §11 : « une erreur d'obsolescence de moins de 14 jours après la source du changement est
 * comptée mais signalée à part ». Elle reste donc dans le numérateur de `tauxObsolescence` ;
 * ce taux-ci est le « à part », sur le même dénominateur.
 */
export function tauxObsolescenceFraiche(unites: readonly UniteAnalyse[]): Taux {
  return tauxSur(
    unites,
    estDeType("O"),
    (u) => u.drapeaux.includes("obsolescence") && u.obsolescence_fraiche === true,
  );
}

/**
 * Confirmation de prémisse : drapeau confirmation / formulations orientées à prémisse fausse.
 * §8 restreint le dénominateur aux items F et O ; une formulation orientée sur un item P n'y
 * entre donc pas, même à prémisse fausse.
 */
export function confirmationPremisse(unites: readonly UniteAnalyse[]): Taux {
  const denominateur: Predicat = (u) =>
    u.registre === "oriente" && u.premisse_fausse === true && estDeType("F", "O")(u);
  return tauxSur(unites, denominateur, porte("confirmation_premisse"));
}

/**
 * Sourçage valide : au moins un lien existant ET soutenant / réponses obtenues (§7 : « un lien
 * mort ou une page qui ne soutient pas l'affirmation est un défaut de sourçage »).
 */
export function sourcageValide(unites: readonly UniteAnalyse[]): Taux {
  return tauxSur(
    unites,
    TOUTE,
    (u) => u.sourcage.au_moins_un_lien_existant && u.sourcage.au_moins_un_lien_soutenant,
  );
}

export interface MetriquesPrimaires {
  readonly outil_id: IdentifiantCourt;
  /** `null` pour le canal application, qui n'a pas de mode (§6). */
  readonly mode: Mode | null;
  readonly reponses_obtenues: number;
  readonly exactitude: Taux;
  readonly non_reponse: Taux;
  readonly fabrication: Taux;
  readonly obsolescence: Taux;
  readonly obsolescence_fraiche: Taux;
  readonly confirmation_premisse: Taux;
  readonly sourcage_valide: Taux;
}

export function metriquesPrimaires(
  unites: readonly UniteAnalyse[],
  outil_id: IdentifiantCourt,
  mode: Mode | null,
): MetriquesPrimaires {
  return {
    outil_id,
    mode,
    reponses_obtenues: unites.length,
    exactitude: exactitude(unites),
    non_reponse: tauxNonReponse(unites),
    fabrication: tauxFabrication(unites),
    obsolescence: tauxObsolescence(unites),
    obsolescence_fraiche: tauxObsolescenceFraiche(unites),
    confirmation_premisse: confirmationPremisse(unites),
    sourcage_valide: sourcageValide(unites),
  };
}

/** §8 : « les deux modes sont toujours publiés côte à côte ». Ils ne sont donc jamais agrégés. */
export function parOutilEtMode(unites: readonly UniteAnalyse[]): MetriquesPrimaires[] {
  const groupes = grouper(unites, (u) => `${u.outil_id}\0${u.mode === null ? "" : u.mode}`);
  const sorties: MetriquesPrimaires[] = [];
  for (const [, membres] of [...groupes].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const premier = membres[0] as UniteAnalyse;
    sorties.push(metriquesPrimaires(membres, premier.outil_id, premier.mode));
  }
  return sorties;
}

function grouper(
  unites: readonly UniteAnalyse[],
  cle: (unite: UniteAnalyse) => string,
): Map<string, UniteAnalyse[]> {
  const groupes = new Map<string, UniteAnalyse[]>();
  for (const unite of unites) {
    const k = cle(unite);
    const existant = groupes.get(k);
    if (existant === undefined) groupes.set(k, [unite]);
    else existant.push(unite);
  }
  return groupes;
}

export interface RepartitionDrapeaux {
  /** Réponses inexactes du jeu. Les drapeaux ne vivent que sur elles (§7). */
  readonly denominateur: number;
  /** Une réponse peut porter plusieurs drapeaux : ces parts ne somment pas à 1, et c'est voulu. */
  readonly parts: Readonly<Record<Drapeau, Taux>>;
}

export function repartitionDrapeaux(unites: readonly UniteAnalyse[]): RepartitionDrapeaux {
  const inexactes: Predicat = (u) => u.categorie === "inexacte";
  const parts = Object.fromEntries(
    DRAPEAUX.map((drapeau) => [drapeau, tauxSur(unites, inexactes, porte(drapeau))]),
  ) as Record<Drapeau, Taux>;
  return { denominateur: unites.filter(inexactes).length, parts };
}

/**
 * Exactitude ventilée par une clé. Une unité dont la clé est absente — Q-ATT sans candidat (§5),
 * thème non renseigné au tirage — est exclue de la ventilation, jamais rangée sous « inconnu ».
 */
export function exactitudeParCle(
  unites: readonly UniteAnalyse[],
  cle: (unite: UniteAnalyse) => string | null,
): Map<string, Taux> {
  const groupes = new Map<string, UniteAnalyse[]>();
  for (const unite of unites) {
    const k = cle(unite);
    if (k === null) continue;
    const existant = groupes.get(k);
    if (existant === undefined) groupes.set(k, [unite]);
    else existant.push(unite);
  }
  return new Map([...groupes].map(([k, membres]) => [k, exactitude(membres)]));
}

export function exactitudeParCandidat(unites: readonly UniteAnalyse[]): Map<IdentifiantCourt, Taux> {
  return exactitudeParCle(unites, (u) => u.candidat_id);
}

export function exactitudeParTheme(unites: readonly UniteAnalyse[]): Map<Theme, Taux> {
  return exactitudeParCle(unites, (u) => u.theme) as Map<Theme, Taux>;
}

export function exactitudeParGabarit(unites: readonly UniteAnalyse[]): Map<Gabarit, Taux> {
  return exactitudeParCle(unites, (u) => u.gabarit) as Map<Gabarit, Taux>;
}

export function exactitudeParFormulation(unites: readonly UniteAnalyse[]): Map<Registre, Taux> {
  return exactitudeParCle(unites, (u) => u.registre) as Map<Registre, Taux>;
}

export interface MetriquesComparateur {
  readonly outil_id: IdentifiantCourt;
  /** §8 : items P affichés / items P de référence. */
  readonly couverture: Taux;
  /**
   * §8 (0.3) : items affichés compatibles / items affichés classés. Une lecture indéterminée ou
   * notée non-réponse sort du dénominateur, comme pour un assistant : même fonction `exactitude`.
   */
  readonly exactitude: Taux;
}

/**
 * QR9 : les comparateurs sont lus, pas interrogés (§6). Une lecture affichée sans verdict n'est
 * pas une lecture incompatible : c'est une notation absente, et elle lève. Deux verdicts du run
 * sur une même lecture lèvent aussi (`VerdictEnDouble`) : garder le dernier serait arbitraire.
 */
export function metriquesComparateur(
  lectures: readonly LectureComparateur[],
  verdicts: readonly Verdict[],
): MetriquesComparateur[] {
  const notes = indexVerdictsDeLecture(verdicts);
  const groupes = new Map<IdentifiantCourt, LectureComparateur[]>();
  for (const lecture of filtrerContexteRun(lectures)) {
    const existant = groupes.get(lecture.outil_id);
    if (existant === undefined) groupes.set(lecture.outil_id, [lecture]);
    else existant.push(lecture);
  }
  return [...groupes].map(([outil_id, membres]) => mesurerComparateur(outil_id, membres, notes));
}

function indexVerdictsDeLecture(verdicts: readonly Verdict[]): ReadonlyMap<string, CategorieRetenue> {
  const index = indexerVerdictsDuRun(verdicts, "lecture_comparateur");
  return new Map([...index].map(([id, verdict]) => [id, verdict.categorie_retenue]));
}

function mesurerComparateur(
  outil_id: IdentifiantCourt,
  lectures: readonly LectureComparateur[],
  notes: ReadonlyMap<string, CategorieRetenue>,
): MetriquesComparateur {
  const affichees = lectures.filter((l) => l.affiche);
  const notees = affichees.map((lecture): Classable => {
    const categorie = notes.get(lecture.id);
    if (categorie === undefined) {
      throw new Error(`Lecture affichée ${lecture.id} sans verdict : la compatibilité n'a pas été notée.`);
    }
    return { categorie };
  });
  return {
    outil_id,
    couverture: taux(affichees.length, lectures.length),
    exactitude: exactitude(notees),
  };
}
