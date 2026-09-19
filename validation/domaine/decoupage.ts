/**
 * Découpage d'un texte canonique aux offsets d'une citation, pour le surlignage.
 *
 * Pur, sans DOM : c'est ce qui rend la fonction testable sans dépendance supplémentaire
 * (décision du 2026-09-18, docs/DETTE.md). Extrait de `validation/client/source.ts`, où la
 * même logique était mêlée à la construction de nœuds DOM et n'était exercée par aucun test.
 *
 * L'unité est le point de code Unicode (docs/CONTRATS.md §1), jamais l'unité UTF-16 que
 * `String.prototype.slice` compte nativement. Les deux coïncident jusqu'à la première source
 * contenant un emoji ou un idéogramme hors du plan de base, après quoi un découpage en unités
 * UTF-16 décale tout le surlignage sans jamais lever d'erreur : c'est exactement le bug que ce
 * module empêche, en itérant le texte caractère Unicode par caractère Unicode (`[...texte]`).
 *
 * `docs/CONTRATS.md` §1 : l'intervalle `[début, fin)` est semi-ouvert, dans le texte **brut**
 * (pas normalisé) — la normalisation ne sert qu'à comparer (test verbatim), jamais à montrer.
 */

export class ErreurDecoupage extends Error {}

export interface Offsets {
  readonly debut: number;
  readonly fin: number;
}

/**
 * Résultat du découpage. `surlignage: "absent"` est un état à part entière, pas un cas
 * particulier du présent avec des tranches vides : aucune position à mettre en avant n'a été
 * fournie, ce qui est différent d'un intervalle vide `[n, n)` qui, lui, en fournit une.
 */
export type Decoupage =
  | {
      readonly surlignage: "present";
      readonly avant: string;
      readonly citation: string;
      readonly apres: string;
    }
  | {
      readonly surlignage: "absent";
      readonly texte: string;
    };

/**
 * Découpe `texte` en trois tranches aux offsets donnés, en points de code Unicode.
 *
 * `offsets === null` renvoie l'état explicite `"absent"` : jamais un surlignage placé en
 * silence à la position 0. Un intervalle hors bornes ou inversé (`debut > fin`) lève une
 * `ErreurDecoupage` nommée plutôt que de rendre une tranche tronquée ou une valeur plausible.
 */
export function decouperAuxOffsets(texte: string, offsets: Offsets | null): Decoupage {
  if (offsets === null) {
    return { surlignage: "absent", texte };
  }

  const { debut, fin } = offsets;
  if (debut > fin) {
    throw new ErreurDecoupage(`Intervalle inversé : début (${debut}) supérieur à fin (${fin}).`);
  }

  const caracteres = [...texte];
  if (debut < 0 || fin > caracteres.length) {
    throw new ErreurDecoupage(
      `Offsets hors bornes : [${debut}, ${fin}) pour un texte de ${caracteres.length} points de code.`,
    );
  }

  return {
    surlignage: "present",
    avant: caracteres.slice(0, debut).join(""),
    citation: caracteres.slice(debut, fin).join(""),
    apres: caracteres.slice(fin).join(""),
  };
}
