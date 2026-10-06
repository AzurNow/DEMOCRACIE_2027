/**
 * Le remplacement des noms de candidats dans un texte, pour le test contrefactuel (§7, D14 (2) :
 * « appliqué par remplacement exact du libellé et du nom seul déclarés au périmètre »).
 *
 * **Remplacement.** Le libellé d'un candidat devient le libellé de son image, son nom seul le nom
 * seul de son image. Les occurrences sont celles de `candidats.ts:occurrencesDeNom` (casse exacte,
 * mot entier, aucune normalisation), la fonction même de l'éligibilité au sous-ensemble : une
 * réponse est éligible exactement quand ce module y trouve quelque chose à remplacer. Toutes les
 * occurrences de toutes les formes sont cherchées dans le texte d'ORIGINE, puis remplacées en une
 * passe : un nom substitué n'est jamais relu, donc jamais remplacé une seconde fois (un échange
 * A↔B donne B…A, jamais B…B). Quand deux occurrences se chevauchent (« Maxime Le Brun » contient
 * « Le Brun »), la plus longue gagne ; à longueur égale, la première dans le texte. Les positions
 * sont en unités UTF-16 du texte reçu, comme celles d'`occurrencesDeNom`.
 *
 * **Mentions résiduelles** (`docs/DETTE.md`, 2026-10-05, point 3). Une mention que le remplacement
 * exact ne voit pas (« LE BRUN », « MAXIME Le Brun ») reste en clair dans le texte permuté. Elle est
 * comptée, pas remplacée : les formes sont recherchées sans tenir compte de la casse
 * (`toLocaleLowerCase("fr")` du texte et de chaque forme, mêmes bornes de mot), avec la même règle
 * de chevauchement ; une mention ainsi trouvée est résiduelle sauf si une occurrence remplacée
 * couvre exactement le même intervalle du texte d'origine. Ce compte est un diagnostic publié avec
 * le résultat du test : il ne change ni le texte permuté ni le taux de changement.
 */

import { occurrencesDeNom, type Occurrence } from "./candidats.ts";
import type { Derangement } from "./derangement.ts";

export interface TextePermute {
  readonly texte: string;
  /** Occurrences remplacées. */
  readonly remplacements: number;
  /** Mentions sans égard à la casse que le remplacement exact n'a pas couvertes. */
  readonly mentions_residuelles: number;
}

interface Forme {
  readonly forme: string;
  readonly remplacant: string;
}

interface Trouvee extends Occurrence {
  readonly remplacant: string;
}

export function permuterTexte(texte: string, derangement: Derangement): TextePermute {
  const formes = formesDe(derangement);
  const remplacees = sansChevauchement(trouver(texte, formes));
  return {
    texte: remplacer(texte, remplacees),
    remplacements: remplacees.length,
    mentions_residuelles: mentionsResiduelles(texte, formes, remplacees),
  };
}

/** Pour chaque paire, le libellé vers le libellé de l'image, le nom seul vers son nom seul. */
function formesDe(derangement: Derangement): readonly Forme[] {
  return derangement.paires.flatMap(({ source, image }) => [
    { forme: source.libelle, remplacant: image.libelle },
    { forme: source.nom, remplacant: image.nom },
  ]);
}

function trouver(texte: string, formes: readonly Forme[]): Trouvee[] {
  return formes.flatMap(({ forme, remplacant }) => occurrencesDeNom(texte, forme).map((o) => ({ ...o, remplacant })));
}

/** La plus longue d'abord, puis la première ; une occurrence qui chevauche une retenue est écartée. */
function sansChevauchement<T extends Occurrence>(occurrences: readonly T[]): T[] {
  const ordre = [...occurrences].sort(plusLonguePuisPremiere);
  const retenues: T[] = [];
  for (const occurrence of ordre) {
    if (!retenues.some((r) => seChevauchent(r, occurrence))) retenues.push(occurrence);
  }
  return retenues.sort((a, b) => a.debut - b.debut);
}

function plusLonguePuisPremiere(a: Occurrence, b: Occurrence): number {
  const ecart = b.fin - b.debut - (a.fin - a.debut);
  return ecart === 0 ? a.debut - b.debut : ecart;
}

function seChevauchent(a: Occurrence, b: Occurrence): boolean {
  return a.debut < b.fin && b.debut < a.fin;
}

/** Les occurrences sont rangées et disjointes : le texte se recompose d'un seul passage. */
function remplacer(texte: string, occurrences: readonly Trouvee[]): string {
  let sortie = "";
  let curseur = 0;
  for (const occurrence of occurrences) {
    sortie += texte.slice(curseur, occurrence.debut) + occurrence.remplacant;
    curseur = occurrence.fin;
  }
  return sortie + texte.slice(curseur);
}

/* ------------------------------------------------------------------ mentions résiduelles */

/**
 * Le texte en minuscules, et pour chaque unité UTF-16 de ce texte l'indice, dans le texte d'origine,
 * du point de code dont elle provient. Un point de code peut changer de longueur en minuscule
 * (« İ ») : l'index ramène chaque mention à son intervalle d'origine.
 */
interface Minuscules {
  readonly texte: string;
  /** Une entrée par unité, plus une sentinelle finale : la longueur du texte d'origine. */
  readonly origine: readonly number[];
}

function enMinuscules(texte: string): Minuscules {
  let bas = "";
  const origine: number[] = [];
  let position = 0;
  for (const point of texte) {
    const minuscule = point.toLocaleLowerCase("fr");
    bas += minuscule;
    for (let i = 0; i < minuscule.length; i += 1) origine.push(position);
    position += point.length;
  }
  origine.push(texte.length);
  return { texte: bas, origine };
}

function mentionsResiduelles(texte: string, formes: readonly Forme[], remplacees: readonly Occurrence[]): number {
  const bas = enMinuscules(texte);
  const mentions = formes.flatMap(({ forme }) =>
    occurrencesDeNom(bas.texte, forme.toLocaleLowerCase("fr")).map((o) => versOrigine(o, bas)),
  );
  const couvertes = new Set(remplacees.map(cle));
  return sansChevauchement(mentions).filter((mention) => !couvertes.has(cle(mention))).length;
}

function versOrigine(occurrence: Occurrence, bas: Minuscules): Occurrence {
  return { debut: indiceOrigine(bas, occurrence.debut), fin: indiceOrigine(bas, occurrence.fin) };
}

function indiceOrigine(bas: Minuscules, indice: number): number {
  const origine = bas.origine[indice];
  if (origine === undefined) throw new Error(`Indice ${indice} hors du texte en minuscules (${bas.texte.length} unités).`);
  return origine;
}

function cle(occurrence: Occurrence): string {
  return `${occurrence.debut}:${occurrence.fin}`;
}
