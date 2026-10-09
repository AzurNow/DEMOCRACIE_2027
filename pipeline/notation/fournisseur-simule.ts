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
 *
 * **Textes des copies (D27 (E)).** Une seconde table donne, par empreinte de copie
 * (`sha256_contenu`), le texte extrait ou le refus d'extraction. Une copie absente de cette table n'a
 * pas encore de texte, et la réponse qui la cite attend, comme pour un verdict d'existence manquant.
 * L'empreinte d'un texte simulé est calculée (SHA-256 de ses octets UTF-8), jamais saisie.
 */

import { createHash } from "node:crypto";
import { validerFragment } from "../../outils/schemas/valider.ts";
import type { FournisseurExistences } from "./fournisseur-existences.ts";
import { exigerHorsDeRuns } from "./garde-simule.ts";
import type { TexteDeCopie } from "./pages-citees.ts";
import type { ExistenceEtablie } from "./vue-annotateur.ts";

/** Une entrée de la table des textes simulés : le texte extrait d'une copie, ou le refus de l'extraire. */
export type TexteSimule =
  | { readonly sha256_contenu: string; readonly issue: "extrait"; readonly texte: string }
  | { readonly sha256_contenu: string; readonly issue: "refuse"; readonly motif: string };

export class TableExistencesInvalide extends Error {
  constructor(detail: string) {
    super(`Table d'existences simulée : ${detail}`);
    this.name = "TableExistencesInvalide";
  }
}

export function fournisseurSimule(table: readonly ExistenceEtablie[], textes: readonly TexteSimule[], repertoire_run: string): FournisseurExistences {
  exigerHorsDeRuns(repertoire_run);
  const index = new Map<string, ExistenceEtablie>();
  table.forEach((existence, rang) => {
    validerFragment("notation", "#/properties/sourcage/properties/liens/items", { ...existence, verdict_soutien: "non_applicable" }, `table d'existences simulée, rang ${rang}`);
    if (index.has(existence.url_citee)) throw new TableExistencesInvalide(`deux verdicts pour ${existence.url_citee}.`);
    index.set(existence.url_citee, existence);
  });
  const parCopie = indexerTextes(textes);
  return {
    existencesDe: (_reponse_id, liens) => liens.flatMap((lien) => {
      const existence = index.get(lien);
      return existence === undefined ? [] : [existence];
    }),
    texteDeCopie: (sha256_contenu) => parCopie.get(sha256_contenu),
  };
}

const SHA256 = /^[0-9a-f]{64}$/u;

function indexerTextes(textes: readonly TexteSimule[]): ReadonlyMap<string, TexteDeCopie> {
  const index = new Map<string, TexteDeCopie>();
  for (const entree of textes) {
    if (!SHA256.test(entree.sha256_contenu)) throw new TableExistencesInvalide(`texte simulé pour l'empreinte ${JSON.stringify(entree.sha256_contenu)}, qui n'en est pas une.`);
    if (index.has(entree.sha256_contenu)) throw new TableExistencesInvalide(`deux textes pour la copie ${entree.sha256_contenu}.`);
    index.set(entree.sha256_contenu, texteDe(entree));
  }
  return index;
}

function texteDe(entree: TexteSimule): TexteDeCopie {
  if (entree.issue === "refuse") return { issue: "refuse", motif: entree.motif };
  return { issue: "extrait", texte: entree.texte, texte_sha256: createHash("sha256").update(entree.texte, "utf8").digest("hex") };
}
