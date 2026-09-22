/**
 * Correction de Holm (§8, protocole 0.3 : « Correction de Holm sur l'ensemble des outils » pour le
 * test d'asymétrie). Elle ne s'applique qu'à lui : le §8 le dit « seul endroit du protocole où une
 * valeur p est calculée », et les effets de condition n'en portent aucune.
 *
 * Procédure descendante, sans hypothèse d'indépendance : les m valeurs p sont triées
 * croissantes, la i-ème est multipliée par (m − i + 1), puis le maximum courant est propagé pour
 * que les valeurs corrigées restent ordonnées comme les brutes, enfin tout est borné à 1.
 *
 * La fonction est pure et ne connaît rien des outils : c'est l'appelant qui décide ce qui forme
 * une famille, et la famille est publiée telle qu'elle a été formée — l'ordre d'entrée est rendu
 * tel quel.
 */

export interface ValeurP {
  readonly cle: string;
  readonly valeur: number;
}

export interface ValeurPCorrigee extends ValeurP {
  readonly corrigee: number;
}

export function corrigerHolm(famille: readonly ValeurP[]): ValeurPCorrigee[] {
  for (const entree of famille) verifierValeurP(entree);
  const m = famille.length;
  const ordre = [...famille.keys()].sort(
    (i, j) => (famille[i] as ValeurP).valeur - (famille[j] as ValeurP).valeur,
  );
  const corrigees = new Array<number>(m);
  let plafond = 0;
  for (const [rang, indice] of ordre.entries()) {
    const brute = (famille[indice] as ValeurP).valeur;
    plafond = Math.max(plafond, Math.min(1, (m - rang) * brute));
    corrigees[indice] = plafond;
  }
  return famille.map((entree, i) => ({ ...entree, corrigee: corrigees[i] as number }));
}

function verifierValeurP(entree: ValeurP): void {
  if (!Number.isFinite(entree.valeur) || entree.valeur < 0 || entree.valeur > 1) {
    throw new Error(`valeur p hors de [0, 1] pour ${entree.cle} : ${entree.valeur}`);
  }
}
