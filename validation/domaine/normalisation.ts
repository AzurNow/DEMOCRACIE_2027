/**
 * Normalisation du texte pour le test verbatim (règle 5 de CLAUDE.md : une comparaison de
 * chaînes, jamais un jugement de modèle).
 *
 * Deux principes, et leur conséquence :
 *
 * - La normalisation sert à **comparer**, les offsets servent à **montrer**. On normalise donc
 *   sans jamais perdre la trace de la position d'origine : chaque caractère normalisé sait de
 *   quel point de code du texte brut il vient.
 * - Le texte canonique d'une source est déjà en NFC (docs/CONTRATS.md §1). La normalisation
 *   ci-dessous opère caractère par caractère et ne change donc aucun index ; c'est ce qui rend
 *   la projection inversible.
 *
 * Une coquille de la source reste une coquille : rien ici ne corrige l'orthographe, ne
 * supprime la ponctuation ni ne met en minuscules. Seuls les espaces et les guillemets, que
 * les outils de conversion PDF et les éditeurs de texte modifient sans prévenir, sont ramenés
 * à une forme unique.
 */

export const VERSION_NORMALISATION = "normalisation-v1";

/** Guillemets, apostrophes et tirets typographiques ramenés à leur forme ASCII. */
const EQUIVALENCES = new Map<string, string>([
  ["«", '"'], // «
  ["»", '"'], // »
  ["“", '"'], // “
  ["”", '"'], // ”
  ["„", '"'], // „
  ["″", '"'], // ″
  ["‘", "'"], // ‘
  ["’", "'"], // ’
  ["‚", "'"], // ‚
  ["′", "'"], // ′
  ["´", "'"], // ´
  ["‐", "-"], // ‐
  ["‑", "-"], // ‑
  ["‒", "-"], // ‒
  ["–", "-"], // –
  ["—", "-"], // —
  ["−", "-"], // −
]);

const ESPACES = /^\s$/u;

export interface Projection {
  /** Le texte normalisé. */
  readonly texte: string;
  /**
   * Pour chaque **unité UTF-16** du texte normalisé, l'index en **points de code** du
   * caractère du texte brut dont elle provient. Les deux unités d'un caractère hors du plan
   * de base portent donc le même index.
   *
   * Cette double unité n'est pas une négligence : `indexOf` travaille en unités UTF-16, et le
   * contrat de `docs/CONTRATS.md` exprime les offsets en points de code, pour que TypeScript
   * et Python comptent pareil. Le tableau est la conversion entre les deux, et sans lui un
   * surlignage se décale d'un caractère dès qu'une source contient un emoji ou un idéogramme.
   */
  readonly indices: readonly number[];
}

/**
 * Projette un texte brut vers sa forme normalisée en conservant la correspondance des
 * positions. Les suites d'espaces, de tabulations et de sauts de ligne deviennent une espace
 * unique, rattachée à la position du premier caractère de la suite.
 */
export function projeter(brut: string): Projection {
  const sortie: string[] = [];
  const indices: number[] = [];
  let index = 0;
  let precedentEstEspace = false;

  for (const caractere of brut) {
    if (ESPACES.test(caractere)) {
      if (!precedentEstEspace) {
        emettre(sortie, indices, " ", index);
        precedentEstEspace = true;
      }
    } else {
      emettre(sortie, indices, EQUIVALENCES.get(caractere) ?? caractere, index);
      precedentEstEspace = false;
    }
    index += 1;
  }

  return rogner({ texte: sortie.join(""), indices });
}

/** Émet un caractère normalisé et un index par unité UTF-16 qu'il occupe. */
function emettre(sortie: string[], indices: number[], emis: string, index: number): void {
  sortie.push(emis);
  for (let unite = 0; unite < emis.length; unite += 1) indices.push(index);
}

/** Retire les espaces de tête et de queue, en gardant la correspondance des positions. */
function rogner(projection: Projection): Projection {
  let debut = 0;
  let fin = projection.texte.length;
  while (debut < fin && projection.texte[debut] === " ") debut += 1;
  while (fin > debut && projection.texte[fin - 1] === " ") fin -= 1;
  return {
    texte: projection.texte.slice(debut, fin),
    indices: projection.indices.slice(debut, fin),
  };
}

/** Forme normalisée seule, pour comparer deux chaînes sans se soucier des positions. */
export function normaliser(brut: string): string {
  return projeter(brut).texte;
}

/** Nombre de points de code d'une chaîne (et non d'unités UTF-16). Voir docs/CONTRATS.md §1. */
export function longueurPointsDeCode(texte: string): number {
  let total = 0;
  for (const _ of texte) total += 1;
  return total;
}

/** Sous-chaîne délimitée en points de code, cohérente avec les offsets du contrat. */
export function trancherPointsDeCode(texte: string, debut: number, fin: number): string {
  const morceaux: string[] = [];
  let index = 0;
  for (const caractere of texte) {
    if (index >= debut && index < fin) morceaux.push(caractere);
    index += 1;
  }
  return morceaux.join("");
}
