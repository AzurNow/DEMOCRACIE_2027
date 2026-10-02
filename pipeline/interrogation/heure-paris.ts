/**
 * L'heure de Paris d'un instant absolu, et l'écriture d'un instant avec son décalage de Paris.
 *
 * Tout calcul de durée se fait en millisecondes absolues ; l'heure civile de Paris ne sert qu'à
 * deux choses : vérifier que la fenêtre s'ouvre un mardi à 6 h (§6), et écrire les horodatages
 * avec un décalage explicite (`commun.schema.json#/$defs/instant`) qui se lit à l'heure de Paris,
 * heure d'été comme d'hiver. Aucune bibliothèque : `Intl` porte la base des fuseaux du moteur.
 */

import { FUSEAU_DU_RUN } from "./conditions.ts";

export interface HeureCivile {
  readonly annee: number;
  readonly mois: number;
  readonly jour: number;
  readonly jour_semaine: string;
  readonly heure: number;
  readonly minute: number;
  readonly seconde: number;
}

const FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSEAU_DU_RUN,
  hourCycle: "h23",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function partie(parties: readonly Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const trouvee = parties.find((p) => p.type === type);
  if (trouvee === undefined) throw new Error(`Intl n'a pas rendu la partie « ${type} » de l'heure de Paris.`);
  return trouvee.value;
}

/** L'heure civile à Paris de l'instant `ms` (millisecondes depuis l'époque Unix). */
export function heureParis(ms: number): HeureCivile {
  const parties = FORMAT.formatToParts(new Date(ms));
  return {
    annee: Number(partie(parties, "year")),
    mois: Number(partie(parties, "month")),
    jour: Number(partie(parties, "day")),
    jour_semaine: partie(parties, "weekday"),
    heure: Number(partie(parties, "hour")),
    minute: Number(partie(parties, "minute")),
    seconde: Number(partie(parties, "second")),
  };
}

function deux(n: number): string {
  return String(n).padStart(2, "0");
}

/** Décalage de Paris à l'instant `ms`, en minutes (60 l'hiver, 120 l'été). */
function decalageMinutes(ms: number, civile: HeureCivile): number {
  const commeUtc = Date.UTC(civile.annee, civile.mois - 1, civile.jour, civile.heure, civile.minute, civile.seconde);
  const secondeEntiere = ms - (((ms % 1000) + 1000) % 1000);
  return (commeUtc - secondeEntiere) / 60_000;
}

/** `AAAA-MM-JJ` à Paris : le nom du répertoire d'un run (`runs/README.md`). */
export function dateParis(ms: number): string {
  const civile = heureParis(ms);
  return `${civile.annee}-${deux(civile.mois)}-${deux(civile.jour)}`;
}

/** L'instant `ms` écrit à l'heure de Paris, millisecondes et décalage explicites. */
export function instantParis(ms: number): string {
  const civile = heureParis(ms);
  const decalage = decalageMinutes(ms, civile);
  const signe = decalage < 0 ? "-" : "+";
  const absolu = Math.abs(decalage);
  const millisecondes = String(((ms % 1000) + 1000) % 1000).padStart(3, "0");
  return (
    `${dateParis(ms)}T${deux(civile.heure)}:${deux(civile.minute)}:${deux(civile.seconde)}.${millisecondes}` +
    `${signe}${deux(Math.floor(absolu / 60))}:${deux(absolu % 60)}`
  );
}

/** Motif de `commun.schema.json#/$defs/instant` : le décalage est obligatoire. */
const MOTIF_INSTANT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?([+-][0-9]{2}:[0-9]{2}|Z)$/;

/** Lit un instant à décalage explicite ; refuse un instant sans fuseau ou illisible. */
export function lireInstant(instant: string, contexte: string): number {
  const ms = Date.parse(instant);
  if (!MOTIF_INSTANT.test(instant) || Number.isNaN(ms)) {
    throw new Error(`${contexte} : « ${instant} » n'est pas un instant à décalage explicite (commun#/$defs/instant).`);
  }
  return ms;
}
