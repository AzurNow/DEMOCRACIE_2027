/**
 * La fenêtre d'un run (§6) : semi-ouverte [debut, fin), fin = debut + 48 h en heures absolues,
 * debut un mardi à 06:00:00.000 heure de Paris (décision de l'auteur du 2026-10-02).
 *
 * « Heures absolues » : la fin se calcule en millisecondes, jamais en heure civile. Une fenêtre
 * de mardi 6 h ne peut pas contenir un changement d'heure français (toujours un dimanche), mais la
 * règle ne dépend pas de ce hasard du calendrier.
 */

import {
  DUREE_FENETRE_MS,
  HEURE_OUVERTURE_FENETRE,
  JOUR_OUVERTURE_FENETRE,
} from "./conditions.ts";
import { heureParis, instantParis, lireInstant } from "./heure-paris.ts";

export interface Fenetre {
  readonly debut: string;
  readonly fin: string;
  readonly debut_ms: number;
  readonly fin_ms: number;
}

/** Un début de fenêtre qui n'est pas un mardi à 6 h pile, heure de Paris. */
export class FenetreRefusee extends Error {
  constructor(debut: string, raison: string) {
    super(`Fenêtre refusée : « ${debut} » ${raison} (§6 : ouverte le mardi à 6 h, heure de Paris).`);
    this.name = "FenetreRefusee";
  }
}

function estOuverturePile(ms: number): boolean {
  const civile = heureParis(ms);
  return (
    civile.jour_semaine === JOUR_OUVERTURE_FENETRE &&
    civile.heure === HEURE_OUVERTURE_FENETRE &&
    civile.minute === 0 &&
    civile.seconde === 0 &&
    ms % 1000 === 0
  );
}

export function ouvrirFenetre(debut: string): Fenetre {
  const debut_ms = lireInstant(debut, "fenetre.debut");
  if (!estOuverturePile(debut_ms)) {
    throw new FenetreRefusee(debut, `tombe le ${instantParis(debut_ms)} à Paris, pas un mardi à 06:00:00`);
  }
  const fin_ms = debut_ms + DUREE_FENETRE_MS;
  return { debut, fin: instantParis(fin_ms), debut_ms, fin_ms };
}

/** Une tentative peut démarrer à `ms` si et seulement si debut ≤ ms < fin. */
export function tentativePeutDemarrer(fenetre: Fenetre, ms: number): boolean {
  return fenetre.debut_ms <= ms && ms < fenetre.fin_ms;
}
