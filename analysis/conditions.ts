/**
 * Effets de condition (§8, QR6/H2/H3).
 *
 * « Différences appariées par item entre modes et entre formulations, intervalle par bootstrap
 * en grappes, correction de Holm au sein de chaque famille de comparaisons. »
 *
 * **Appariement par item.** Un item absent de l'un des deux bras sort de la comparaison et est
 * nommé dans `grappes_exclues`. Il n'est jamais remplacé par une moyenne, un zéro ou un report :
 * comparer deux modes sur des items différents ne mesure plus le mode.
 *
 * **Valeur p.** Le §8 impose la correction de Holm ici mais ne dit pas d'où viennent les valeurs
 * p corrigées ; il ne préenregistre pour cette famille qu'un intervalle de percentile bootstrap.
 * La méthode retenue est donc celle qui se lit dans la même distribution que l'intervalle — le
 * percentile bilatéral — et elle est NOMMÉE dans chaque comparaison, par un paramètre obligatoire
 * `methode_valeur_p` : aucun chiffre publié ne peut taire la méthode qui l'a produit. Le point
 * est remonté comme un trou du protocole, pas comblé en silence.
 */

import {
  differenceEtEchantillon,
  valeurPBilaterale,
  type DifferenceTaux,
  type OptionsBootstrap,
  type Statistique,
} from "./bootstrap.ts";
import type { UniteAnalyse } from "./filtre.ts";
import { corrigerHolm, type ValeurP } from "./holm.ts";
import type { Mode, Registre, Ulid } from "./types.ts";

export type MethodeValeurP = "bootstrap_percentile_bilateral";

export interface OptionsConditions extends OptionsBootstrap {
  readonly methode_valeur_p: MethodeValeurP;
}

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
  readonly valeur_p: number | null;
  readonly valeur_p_corrigee: number | null;
  readonly methode_valeur_p: MethodeValeurP;
}

const MODES: readonly Mode[] = ["web_activee", "web_desactivee"];

/** Ordre figé des comparaisons de formulation : les trois paires des trois registres du §5. */
const PAIRES_REGISTRES: readonly (readonly [Registre, Registre])[] = [
  ["neutre", "familier"],
  ["neutre", "oriente"],
  ["familier", "oriente"],
];

export function comparerConditions(
  paires: readonly PaireCondition[],
  statistique: Statistique,
  options: OptionsConditions,
): ComparaisonCondition[] {
  const brutes = paires.map((paire) => comparerUnePaire(paire, statistique, options));
  return appliquerHolm(brutes);
}

function comparerUnePaire(
  paire: PaireCondition,
  statistique: Statistique,
  options: OptionsConditions,
): ComparaisonCondition {
  const appariement = apparier(paire.a, paire.b);
  const { difference, echantillon } = differenceEtEchantillon(
    appariement.a,
    appariement.b,
    statistique,
    options,
  );
  return {
    cle: paire.cle,
    difference,
    grappes_appariees: appariement.communes.length,
    grappes_exclues: appariement.exclues,
    valeur_p: echantillon === null ? null : valeurPBilaterale(echantillon),
    valeur_p_corrigee: null,
    methode_valeur_p: options.methode_valeur_p,
  };
}

/** Holm porte sur la famille entière ; les comparaisons sans valeur p n'en font pas partie. */
function appliquerHolm(comparaisons: readonly ComparaisonCondition[]): ComparaisonCondition[] {
  const famille: ValeurP[] = [];
  for (const comparaison of comparaisons) {
    if (comparaison.valeur_p !== null) famille.push({ cle: comparaison.cle, valeur: comparaison.valeur_p });
  }
  const corrigees = new Map(corrigerHolm(famille).map((c) => [c.cle, c.corrigee]));
  return comparaisons.map((comparaison) => {
    const corrigee = corrigees.get(comparaison.cle);
    return { ...comparaison, valeur_p_corrigee: corrigee === undefined ? null : corrigee };
  });
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
