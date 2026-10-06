/**
 * Les tâches d'un annotateur, prêtes à être servies (§7 ; D18).
 *
 * Trois étapes, toutes déléguées au domaine : la file (`construireFile`) dit quelles réponses
 * l'annotateur peut noter ; la vue (`construireVue`) dit ce qu'il voit ; le fournisseur d'existences
 * dit ce que l'on sait des liens. Une réponse dont un lien n'a pas de verdict d'existence n'est pas
 * proposée : elle est **comptée** « en attente du test des liens », jamais masquée.
 *
 * Les réponses qui attendent un juge, et celles qu'aucun motif humain n'admet, ne sont pas des
 * tâches : elles sont comptées aussi. Ces comptes sont des totaux du run, jamais un détail par motif
 * ni par annotateur : un motif de tâche trahirait une note (désaccord des juges, arbitrage).
 */

import { construireFile, type TacheAnnotateur } from "../../pipeline/notation/file-humaine.ts";
import { construireVue, LienSansVerdictExistence, type VueAnnotateur } from "../../pipeline/notation/vue-annotateur.ts";
import type { ReponsePreparee } from "./chargement.ts";
import type { Contexte } from "./contexte.ts";
import type { FournisseurExistences } from "./fournisseur.ts";

/** Une tâche que l'annotateur peut effectivement prendre, avec la vue qu'il verra. */
export interface Notable {
  readonly tache: TacheAnnotateur;
  readonly vue: VueAnnotateur;
}

export interface EtatDesTaches {
  readonly notables: readonly Notable[];
  readonly en_attente_test_des_liens: number;
  readonly attend_juge: number;
  readonly sans_motif_admis: number;
}

/** La vue, ou `null` si un lien de la réponse n'a pas de verdict d'existence. Toute autre erreur monte. */
function vueOuAttente(prep: ReponsePreparee, existences: FournisseurExistences, date_run: string): VueAnnotateur | null {
  const liens = prep.reponse.normalise.liens;
  try {
    return construireVue({
      reponse: prep.reponse,
      question: prep.question,
      references: prep.references,
      date_run,
      existences: existences.existencesDe(prep.reponse.id, liens),
    });
  } catch (erreur) {
    if (erreur instanceof LienSansVerdictExistence) return null;
    throw erreur;
  }
}

export function etatDesTaches(contexte: Contexte): EtatDesTaches {
  const { donnees } = contexte;
  const parId = new Map(donnees.reponses.map((prep) => [prep.reponse.id, prep]));
  const file = construireFile({
    run: donnees.run_note,
    reponses: donnees.reponses.map((prep) => ({ reponse_id: prep.reponse.id, textes: prep.textes })),
    notations: contexte.notations(),
    jeu_or: donnees.jeu_or,
  });
  const notables: Notable[] = [];
  let en_attente = 0;
  for (const tache of file.tachesPour(contexte.annotateur_id)) {
    const prep = parId.get(tache.reponse_id);
    if (prep === undefined) throw new Error(`Tâche sur la réponse ${tache.reponse_id}, inconnue du run chargé.`);
    const vue = vueOuAttente(prep, contexte.existences, donnees.run.date_gel);
    if (vue === null) en_attente += 1;
    else notables.push({ tache, vue });
  }
  return {
    notables,
    en_attente_test_des_liens: en_attente,
    attend_juge: file.attend_juge.length,
    sans_motif_admis: file.sans_motif_admis.length,
  };
}
