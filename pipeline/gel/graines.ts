/**
 * Les cinq graines d'un run (`run.graines` : tirage, échantillon humain, bootstrap, permutation,
 * contrefactuel), obtenues par un port.
 *
 * §5 (protocole 0.16) et D40 : les graines sont dérivées d'une balise publique d'aléa (drand), au
 * premier tour émis à l'instant de gel ou après ; la réponse signée est archivée avec le run. Cet
 * adaptateur réel est la PR 2 du lot gel. Ici, seul le port existe, et un adaptateur à valeurs
 * fixes : celui des tests, et celui de `pnpm geler --graines-fixes=<fichier>` en attendant la
 * balise. Rien dans `run.json` ne dit d'où viennent les valeurs : un run gelé avec des graines
 * fixes ne prétend pas venir d'une balise, et il ne remplit pas la règle du §5 (« Nul, l'auteur
 * compris, ne peut connaître une graine avant le gel »).
 *
 * Les cinq graines déclarent le générateur du tirage (`tirage.ts:GENERATEUR_DU_TIRAGE`,
 * SplitMix64 amorcé par sha256) : `run.schema.json` l'impose à l'échantillon humain et au
 * contrefactuel, `tirage.ts` le vérifie pour le tirage, et `analysis/graines.ts` dérive les graines
 * du bootstrap et de la permutation avec le même algorithme.
 */

import { validerFragment } from "../../outils/schemas/valider.ts";
import { GENERATEUR_DU_TIRAGE } from "../questions/tirage.ts";
import type { GraineTirage } from "../questions/types.ts";

export const NOMS_GRAINES = ["tirage", "echantillon_humain", "bootstrap", "permutation", "contrefactuel"] as const;
export type NomGraine = (typeof NOMS_GRAINES)[number];

/** Les cinq valeurs entières, de 0 à 2^53 − 1 (`run.schema.json#/$defs/graine`). */
export type ValeursDesGraines = Readonly<Record<NomGraine, number>>;

/** `run.graines`. */
export type GrainesDuRun = Readonly<Record<NomGraine, GraineTirage>>;

/**
 * Le port : rend les cinq valeurs, une fois, au moment du gel. L'adaptateur de la balise (PR 2)
 * fera un appel réseau ; d'où la promesse.
 */
export interface SourceDeGraines {
  readonly graines: () => Promise<ValeursDesGraines>;
}

/** Les valeurs validées contre `config-gel#/$defs/graines_fixes` : cinq entiers, rien d'autre. */
export function validerValeurs(valeurs: unknown, provenance: string): ValeursDesGraines {
  return validerFragment<ValeursDesGraines>("config-gel", "#/$defs/graines_fixes", valeurs, provenance);
}

/** L'adaptateur à valeurs fixes : validées dès la construction, rendues telles quelles. */
export function grainesFixes(valeurs: unknown, provenance: string): SourceDeGraines {
  const validees = validerValeurs(valeurs, provenance);
  return { graines: () => Promise.resolve(validees) };
}

/** `run.graines` : chaque valeur, avec la déclaration du générateur qui l'emploie. */
export function grainesDuRun(valeurs: ValeursDesGraines): GrainesDuRun {
  const graine = (nom: NomGraine): GraineTirage => ({ valeur: valeurs[nom], ...GENERATEUR_DU_TIRAGE });
  return {
    tirage: graine("tirage"),
    echantillon_humain: graine("echantillon_humain"),
    bootstrap: graine("bootstrap"),
    permutation: graine("permutation"),
    contrefactuel: graine("contrefactuel"),
  };
}
