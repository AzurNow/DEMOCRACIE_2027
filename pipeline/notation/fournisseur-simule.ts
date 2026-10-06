/**
 * Le fournisseur d'existences simulé de `pnpm notation:dry` : les verdicts du test HTTP des liens
 * (§7) lus dans une table de données, sans aucun appel réseau.
 *
 * Déterministe : un lien a le verdict que la table lui donne, quelle que soit la réponse qui le
 * cite ; un lien absent de la table n'a pas de verdict, et la réponse qui le cite reste en attente
 * du test des liens (contrat de `fournisseur-existences.ts`). Chaque verdict est validé à la
 * construction comme un lien de `schema/notation.schema.json` (avec l'avis de soutien
 * `non_applicable`, que seul le juge pose).
 *
 * **Simulé, et dit.** Le schéma d'un lien n'a aucun champ libre où le dire : le caractère simulé de
 * ces verdicts est porté par le run lui-même (ses juges `simule://`) et par le refus de tout
 * répertoire sous `runs/` (`garde-simule.ts`). Les URL de la table de référence sont sous `.invalid`.
 */

import { validerFragment } from "../../outils/schemas/valider.ts";
import type { FournisseurExistences } from "./fournisseur-existences.ts";
import { exigerHorsDeRuns } from "./garde-simule.ts";
import type { ExistenceEtablie } from "./vue-annotateur.ts";

export class TableExistencesInvalide extends Error {
  constructor(detail: string) {
    super(`Table d'existences simulée : ${detail}`);
    this.name = "TableExistencesInvalide";
  }
}

export function fournisseurSimule(table: readonly ExistenceEtablie[], repertoire_run: string): FournisseurExistences {
  exigerHorsDeRuns(repertoire_run);
  const index = new Map<string, ExistenceEtablie>();
  table.forEach((existence, rang) => {
    validerFragment("notation", "#/properties/sourcage/properties/liens/items", { ...existence, verdict_soutien: "non_applicable" }, `table d'existences simulée, rang ${rang}`);
    if (index.has(existence.url_citee)) throw new TableExistencesInvalide(`deux verdicts pour ${existence.url_citee}.`);
    index.set(existence.url_citee, existence);
  });
  return {
    existencesDe: (_reponse_id, liens) => liens.flatMap((lien) => {
      const existence = index.get(lien);
      return existence === undefined ? [] : [existence];
    }),
  };
}
