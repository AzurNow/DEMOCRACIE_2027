/**
 * Test verbatim : une citation figure-t-elle, caractère pour caractère après normalisation,
 * dans le texte canonique de sa source ?
 *
 * C'est une comparaison de chaînes, et rien d'autre (règle 5 de CLAUDE.md). Le test sert ici
 * deux fois : pour situer la citation dans la source afin de la surligner, et pour **refuser**
 * une correction de citation qui ne serait pas un intervalle contigu du texte de la source.
 * Un annotateur ne peut donc pas rapprocher une citation de sa source jusqu'à l'acceptation :
 * c'est la fonction qui tranche, pas l'humain.
 */

import { projeter, VERSION_NORMALISATION } from "./normalisation.ts";

export interface ResultatVerbatim {
  readonly passe: boolean;
  readonly version_normalisation: string;
  /** Offsets en points de code dans le texte **brut**, intervalle semi-ouvert [début, fin). */
  readonly offset_debut: number | null;
  readonly offset_fin: number | null;
  /**
   * Nombre d'occurrences trouvées. Au-delà d'une, le surlignage porte sur la première et
   * l'ambiguïté est signalée : deux positions possibles pour une même citation est une
   * information sur la source, pas un détail d'affichage.
   */
  readonly occurrences: number;
  readonly motif_echec: "citation_vide" | "introuvable" | null;
}

export function testerVerbatim(citation: string, texteSource: string): ResultatVerbatim {
  const aiguille = projeter(citation);
  const meule = projeter(texteSource);

  if (aiguille.texte.length === 0) {
    return echec("citation_vide");
  }

  const premier = meule.texte.indexOf(aiguille.texte);
  if (premier < 0) {
    return echec("introuvable");
  }

  const dernier = meule.indices[premier + aiguille.texte.length - 1] as number;
  return {
    passe: true,
    version_normalisation: VERSION_NORMALISATION,
    offset_debut: meule.indices[premier] as number,
    offset_fin: dernier + 1,
    occurrences: compterOccurrences(meule.texte, aiguille.texte),
    motif_echec: null,
  };
}

function echec(motif: "citation_vide" | "introuvable"): ResultatVerbatim {
  return {
    passe: false,
    version_normalisation: VERSION_NORMALISATION,
    offset_debut: null,
    offset_fin: null,
    occurrences: 0,
    motif_echec: motif,
  };
}

function compterOccurrences(meule: string, aiguille: string): number {
  let total = 0;
  let position = meule.indexOf(aiguille);
  while (position >= 0) {
    total += 1;
    position = meule.indexOf(aiguille, position + 1);
  }
  return total;
}
