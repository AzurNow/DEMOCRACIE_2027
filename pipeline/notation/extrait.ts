/**
 * Contrôle de l'extrait justificatif d'un juge (§7).
 *
 * « Un extrait justificatif qui ne figure pas dans la réponse ou dans la référence, vérifié par la
 * même comparaison de chaînes que le test verbatim, invalide la notation du juge ; la réponse est
 * alors notée par un humain. » La comparaison est `validation/domaine/verbatim.ts:testerVerbatim`,
 * et elle seule (règle 5) : aucun second test, aucun rapprochement.
 *
 * - **La réponse** est sa projection publiée (`reponse.normalise.texte`), jamais le brut (règle 7).
 * - **La référence** est la citation verbatim de chaque état positionnel des items soumis au juge
 *   (l'assertion d'un item P, les deux états d'un item O). La paraphrase n'est pas une citation :
 *   un extrait qui ne figure que dans la paraphrase rédigée par l'annotateur n'est pas trouvé.
 * - La provenance que déclare le juge n'est pas crue : l'extrait est cherché dans la réponse, puis
 *   dans chaque citation, et le résultat dit où il a été trouvé. Le champ `verifie_deterministe` de
 *   la notation n'est pas lu non plus : ce contrôle le recalcule.
 * - Une note exacte peut ne porter aucun extrait (annexe C) : il n'y a rien à invalider. Une note
 *   autre qu'exacte sans extrait est invalide (`extrait_manquant`), jamais acceptée par défaut.
 */

import { testerVerbatim } from "../../validation/domaine/verbatim.ts";
import type { Item } from "../../validation/domaine/types.ts";
import { etatsPositionnels } from "./etats.ts";
import type { NotationIndividuelle } from "./types.ts";

export interface TextesDeVerification {
  /** `reponse.normalise.texte`. */
  readonly reponse: string;
  /** `citationsDeReference(items soumis au juge)`. */
  readonly citations_reference: readonly string[];
}

export type MotifExtraitInvalide = "extrait_manquant" | "citation_vide" | "introuvable";

export type ResultatExtrait =
  | { readonly valide: true; readonly trouve_dans: "reponse" | "reference" | null }
  | { readonly valide: false; readonly motif: MotifExtraitInvalide };

export function controlerExtrait(notation: NotationIndividuelle, textes: TextesDeVerification): ResultatExtrait {
  const extrait = notation.extrait_justificatif;
  if (extrait === undefined) {
    return notation.categorie === "exacte" ? { valide: true, trouve_dans: null } : { valide: false, motif: "extrait_manquant" };
  }
  const dansReponse = testerVerbatim(extrait.texte, textes.reponse);
  if (dansReponse.passe) return { valide: true, trouve_dans: "reponse" };
  if (dansReponse.motif_echec === "citation_vide") return { valide: false, motif: "citation_vide" };
  const dansReference = textes.citations_reference.some((citation) => testerVerbatim(extrait.texte, citation).passe);
  return dansReference ? { valide: true, trouve_dans: "reference" } : { valide: false, motif: "introuvable" };
}

/** Les citations verbatim des items soumis au juge, dans l'ordre reçu. */
export function citationsDeReference(items: readonly Item[]): readonly string[] {
  return items.flatMap((item) => etatsPositionnels(item).map((etat) => etat.citation_verbatim));
}
