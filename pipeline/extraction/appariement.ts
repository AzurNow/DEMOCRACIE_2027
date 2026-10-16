/**
 * Appariement des items des deux extractions (décision D52 (2)).
 *
 * Deux items, un de chaque modèle, sont appariés quand les intervalles de leurs citations (offsets en
 * points de code, après un test verbatim réussi) **se recouvrent** — intervalles semi-ouverts : deux
 * citations qui se touchent (`fin == début`) ne se recouvrent pas — et qu'ils ont **le même thème**
 * (`mesure_proposee.theme`). Un item qui a plusieurs candidats prend celui de plus grand
 * recouvrement, puis, à égalité, celui du plus petit offset de début. L'appariement est un-à-un.
 *
 * Réalisation : toutes les paires admissibles sont triées par recouvrement décroissant, puis par
 * offset de début du second item, puis du premier (le plus petit offset de début du partenaire, vu
 * de chacun des deux côtés), et retenues dans cet ordre tant que leurs deux items sont libres.
 *
 * **Égalités restantes** (décision D52 muette) : deux candidats de même recouvrement et de mêmes
 * offsets, typiquement deux mesures tirées de la même phrase. Pour que le résultat ne dépende pas de
 * l'ordre des items dans les sorties, l'égalité est départagée par une clé de contenu fixe —
 * type, position, quantification, puis le reste de l'item — et jamais par le rang dans la sortie.
 * Deux contenus identiques s'apparient ainsi entre eux. Libellé et paraphrase n'y servent que
 * d'ordre total : ils ne sont pas **comparés** entre les modèles (`comparaison.ts`).
 */

import { canoniser } from "../../validation/domaine/empreinte.ts";
import type { ItemPropose, RangModele } from "./types.ts";

export interface Intervalle {
  readonly debut: number;
  readonly fin: number;
}

/** Un item d'une sortie, passé le test verbatim : son rang de modèle, son index dans la sortie, sa citation. */
export interface Candidat extends Intervalle {
  readonly rang: RangModele;
  readonly index: number;
  readonly item: ItemPropose;
}

/** Une paire appariée, ou un item seul : l'autre côté est `null`. Jamais les deux à la fois. */
export interface Paire {
  readonly premier: Candidat | null;
  readonly second: Candidat | null;
}

export function recouvrement(a: Intervalle, b: Intervalle): number {
  return Math.max(0, Math.min(a.fin, b.fin) - Math.max(a.debut, b.debut));
}

type Cle = readonly (number | string)[];

function comparerCles(a: Cle, b: Cle): number {
  for (let rang = 0; rang < Math.min(a.length, b.length); rang += 1) {
    const x = a[rang] as number | string;
    const y = b[rang] as number | string;
    if (x !== y) return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

/** Clé de contenu : les champs comparés d'abord, puis le reste, pour un ordre total. Jamais l'index. */
function cleDeContenu(item: ItemPropose): string {
  return canoniser([
    item.type,
    item.position,
    item.quantification === undefined ? null : item.quantification,
    item.mesure_proposee.theme,
    item.citation_verbatim,
    item.mesure_proposee.libelle,
    item.paraphrase,
    item.candidat_id,
  ]);
}

interface Admissible {
  readonly premier: Candidat;
  readonly second: Candidat;
  readonly cle: Cle;
}

function admissibles(premiers: readonly Candidat[], seconds: readonly Candidat[]): readonly Admissible[] {
  return premiers.flatMap((premier) =>
    seconds
      .filter((second) => second.item.mesure_proposee.theme === premier.item.mesure_proposee.theme)
      .map((second) => ({ premier, second, commun: recouvrement(premier, second) }))
      .filter(({ commun }) => commun > 0)
      .map(({ premier: a, second: b, commun }) => ({
        premier: a,
        second: b,
        cle: [-commun, b.debut, a.debut, a.fin, b.fin, cleDeContenu(a.item), cleDeContenu(b.item)],
      })),
  );
}

/** L'item dont les champs sont déposés : celui du premier modèle s'il existe (D52 (3)), sinon l'item seul. */
export function retenuDe(paire: Paire): Candidat {
  if (paire.premier !== null) return paire.premier;
  if (paire.second !== null) return paire.second;
  throw new Error("Paire vide : ni item du premier modèle, ni item du second.");
}

/** Ordre de sortie : position dans le texte de l'item qui serait déposé, puis son contenu. */
function cleDeSortie(paire: Paire): Cle {
  const retenu = retenuDe(paire);
  const partenaire = paire.premier !== null && paire.second !== null ? cleDeContenu(paire.second.item) : "";
  return [retenu.debut, retenu.fin, retenu.rang, cleDeContenu(retenu.item), partenaire];
}

export function apparier(premiers: readonly Candidat[], seconds: readonly Candidat[]): readonly Paire[] {
  const pris = new Set<Candidat>();
  const paires: Paire[] = [];
  for (const { premier, second } of [...admissibles(premiers, seconds)].sort((a, b) => comparerCles(a.cle, b.cle))) {
    if (pris.has(premier) || pris.has(second)) continue;
    pris.add(premier);
    pris.add(second);
    paires.push({ premier, second });
  }
  const seuls = [...premiers, ...seconds].filter((candidat) => !pris.has(candidat));
  for (const candidat of seuls) paires.push(candidat.rang === 0 ? { premier: candidat, second: null } : { premier: null, second: candidat });
  return paires.sort((a, b) => comparerCles(cleDeSortie(a), cleDeSortie(b)));
}
