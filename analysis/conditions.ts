/**
 * Effets de condition (§8, protocole 0.3, QR6/H2/H3).
 *
 * « Différences appariées par item entre modes et entre formulations, intervalle par bootstrap en
 * grappes. La famille des formulations compte trois paires : neutre contre familière, neutre
 * contre orientée, familière contre orientée. Aucune valeur p n'est définie pour cette famille :
 * la conclusion s'y lit sur l'intervalle de la différence et sur le qualificatif « établie » ou
 * « non établie » défini plus haut. La correction de Holm ne s'y applique donc pas — elle ne vaut
 * que pour le test d'asymétrie, seul endroit du protocole où une valeur p est calculée. »
 *
 * **Aucune valeur p, dans aucune des deux familles.** Puisque le test d'asymétrie est « le seul
 * endroit du protocole où une valeur p est calculée », la famille des modes n'en porte pas plus que
 * celle des formulations. Une comparaison publie sa différence, son intervalle et son qualificatif
 * — rien d'autre. Holm vit dans `holm.ts` et ne sert qu'à `permutation.ts`.
 *
 * **Appariement par item.** Un item absent de l'un des deux bras sort de la comparaison et est
 * nommé dans `grappes_exclues`. Il n'est jamais remplacé par une moyenne, un zéro ou un report :
 * comparer deux modes sur des items différents ne mesure plus le mode.
 */

import { differenceAppariee, type DifferenceTaux, type OptionsBootstrap, type Statistique } from "./bootstrap.ts";
import type { UniteAnalyse } from "./filtre.ts";
import type { Mode, Registre, Ulid } from "./types.ts";

export interface PaireCondition {
  readonly cle: string;
  readonly a: readonly UniteAnalyse[];
  readonly b: readonly UniteAnalyse[];
}

export interface ComparaisonCondition {
  readonly cle: string;
  readonly difference: DifferenceTaux;
  readonly grappes_appariees: number;
  /** Items présents dans un seul bras : nommés, jamais complétés. */
  readonly grappes_exclues: readonly Ulid[];
}

const MODES: readonly Mode[] = ["web_activee", "web_desactivee"];

/** Ordre figé des comparaisons de formulation : les trois paires des trois registres du §5. */
const PAIRES_REGISTRES: readonly (readonly [Registre, Registre])[] = [
  ["neutre", "familier"],
  ["neutre", "oriente"],
  ["familier", "oriente"],
];

/** Chaque paire est comparée seule : aucune correction de famille ne s'applique (§8 0.3). */
export function comparerConditions(
  paires: readonly PaireCondition[],
  statistique: Statistique,
  options: OptionsBootstrap,
): ComparaisonCondition[] {
  return paires.map((paire) => comparerUnePaire(paire, statistique, options));
}

function comparerUnePaire(
  paire: PaireCondition,
  statistique: Statistique,
  options: OptionsBootstrap,
): ComparaisonCondition {
  const appariement = apparier(paire.a, paire.b);
  // Graine propre à la paire (`graines.ts`) : la clé de l'appelant, suivie de celle de la paire.
  const optionsDeLaPaire = { ...options, cle: [...options.cle, paire.cle] };
  return {
    cle: paire.cle,
    difference: differenceAppariee(appariement.a, appariement.b, statistique, optionsDeLaPaire),
    grappes_appariees: appariement.communes.length,
    grappes_exclues: appariement.exclues,
  };
}

interface Appariement {
  readonly a: UniteAnalyse[];
  readonly b: UniteAnalyse[];
  readonly communes: readonly Ulid[];
  readonly exclues: readonly Ulid[];
}

function apparier(a: readonly UniteAnalyse[], b: readonly UniteAnalyse[]): Appariement {
  const grappesA = new Set(a.map((u) => u.grappe_id));
  const grappesB = new Set(b.map((u) => u.grappe_id));
  const communes: Ulid[] = [];
  const exclues: Ulid[] = [];
  for (const grappe of new Set([...grappesA, ...grappesB])) {
    if (grappesA.has(grappe) && grappesB.has(grappe)) communes.push(grappe);
    else exclues.push(grappe);
  }
  const retenues = new Set(communes);
  return {
    a: a.filter((u) => retenues.has(u.grappe_id)),
    b: b.filter((u) => retenues.has(u.grappe_id)),
    communes,
    exclues,
  };
}

/**
 * Famille des modes : une comparaison par outil, sur toutes ses formulations. Les réponses sans
 * mode (canal application, §6) n'y figurent pas — elles n'ont pas de mode à comparer.
 */
export function pairesParMode(unites: readonly UniteAnalyse[]): PaireCondition[] {
  const paires: PaireCondition[] = [];
  const [premier, second] = MODES as readonly [Mode, Mode];
  for (const [outil_id, membres] of grouperPar(avecMode(unites), (u) => u.outil_id)) {
    const a = membres.filter((u) => u.mode === premier);
    const b = membres.filter((u) => u.mode === second);
    if (a.length > 0 && b.length > 0) paires.push({ cle: `${outil_id}:${premier}-${second}`, a, b });
  }
  return paires;
}

/**
 * Famille des formulations : les trois paires de registres, à outil ET mode constants — comparer
 * deux registres à travers deux modes mélangerait les deux effets que le §8 sépare.
 */
export function pairesParFormulation(unites: readonly UniteAnalyse[]): PaireCondition[] {
  const paires: PaireCondition[] = [];
  for (const [cle, membres] of grouperPar(avecMode(unites), (u) => `${u.outil_id}:${u.mode as Mode}`)) {
    for (const [premier, second] of PAIRES_REGISTRES) {
      const a = membres.filter((u) => u.registre === premier);
      const b = membres.filter((u) => u.registre === second);
      if (a.length > 0 && b.length > 0) paires.push({ cle: `${cle}:${premier}-${second}`, a, b });
    }
  }
  return paires;
}

function avecMode(unites: readonly UniteAnalyse[]): UniteAnalyse[] {
  return unites.filter((u) => u.mode !== null);
}

function grouperPar(
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
