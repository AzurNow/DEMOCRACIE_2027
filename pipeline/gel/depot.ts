/**
 * Le dépôt au gel (décision D41) : un dépôt sale est refusé — `git status --porcelain` non vide,
 * fichiers non suivis compris, sauf ce que `.gitignore` exclut —, et le commit courant (HEAD) est
 * celui que le run inscrit, comme `versions.code_commit` et comme `versions.donnees_commit` : `data/`
 * vit dans le même dépôt que le code. Avec des modifications à côté, ce commit ne décrirait ni le
 * code ni les données que le gel a lus.
 *
 * Mince : les deux appels à Git sont ceux des garde-fous des commandes qui écrivent une donnée
 * publiée (`outils/garde-fous-git.ts`). Git est lu en local ; rien ne sort de la machine.
 */

import { arbrePropre, commitCourant } from "../../outils/garde-fous-git.ts";

export class DepotSale extends Error {
  constructor(racine: string) {
    super(
      `${racine} : dépôt non propre (git status --porcelain n'est pas vide, fichiers non suivis compris). ` +
        `Le gel inscrit le commit courant comme commit du code et des données ; avec des modifications à ` +
        `côté, il ne décrirait pas ce qui a été lu (décision D41). Commitez ou retirez, puis relancez. Rien n'est écrit.`,
    );
    this.name = "DepotSale";
  }
}

/** Lève `DepotSale` si l'arbre n'est pas propre ; rend HEAD sinon. */
export function exigerDepotPropre(racine: string): string {
  if (!arbrePropre(racine)) throw new DepotSale(racine);
  return commitCourant(racine);
}
