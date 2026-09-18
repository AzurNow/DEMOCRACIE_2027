/**
 * Contexte d'exécution du serveur local.
 *
 * L'identité de l'annotateur est lue **une fois**, dans la variable d'environnement, au
 * démarrage. Elle n'est jamais un paramètre de requête, jamais un cookie, jamais un champ de
 * formulaire : c'est le premier et le plus solide des mécanismes d'aveuglement, parce qu'il
 * rend l'accès au journal d'un autre annotateur non pas interdit mais **inexprimable**.
 */

import { resolve } from "node:path";
import { Brouillons } from "../io/brouillons.ts";
import { JournalAnnotateur } from "../io/journal-fichier.ts";
import { chargerStaging, type Staging } from "../io/staging.ts";
import { lireLot, lireLots } from "../io/lots-fichier.ts";
import { etatsDuLot } from "../io/lecture-croisee.ts";
import type { EtatAnnotateur } from "../domaine/journal.ts";
import type { Lot } from "../domaine/types.ts";

export interface Configuration {
  readonly racine_depot: string;
  readonly racine_staging: string;
  readonly repertoire_lots: string;
  readonly repertoire_decisions: string;
  readonly repertoire_brouillons: string;
  readonly annotateur_id: string;
}

export interface Contexte {
  readonly configuration: Configuration;
  readonly annotateur_id: string;
  readonly journal: JournalAnnotateur;
  readonly brouillons: Brouillons;
  /** Rechargé à chaque appel : une contestation reçue pendant un lot doit retirer l'item tout de suite. */
  staging(): Staging;
  lots(): readonly Lot[];
  lot(lot_id: string): Lot | null;
  /**
   * Unique point d'entrée vers le journal de l'autre annotateur, réservé au calcul du kappa.
   * Voir `io/lecture-croisee.ts` pour ce qui l'encadre.
   */
  etatsDuLot(lot: Lot): ReadonlyMap<string, EtatAnnotateur>;
  maintenant(): string;
}

// Découpage en phases nommées (compétence `complexite-maitrisee`) : lire l'annotateur, résoudre
// le mode démo, puis chaque chemin par défaut — plutôt qu'une seule fonction cumulant `if`, `??`
// et ternaires. Comportement inchangé, complexité de `configurationDepuisEnvironnement` ramenée à 1.

function annotateurIdRequis(env: NodeJS.ProcessEnv): string {
  const annotateur_id = env["ANNOTATEUR_ID"];
  if (annotateur_id !== undefined && annotateur_id.length > 0) return annotateur_id;
  throw new Error(
    "ANNOTATEUR_ID n'est pas défini. L'identité de l'annotateur est une variable " +
      "d'environnement, jamais un choix fait dans l'interface :\n" +
      "  ANNOTATEUR_ID=a1 pnpm validate",
  );
}

interface ModeDemo {
  readonly demo: boolean;
  readonly base: string;
  readonly suffixe: string;
}

/** En démonstration, tout vit dans validation/fixtures/ : les décisions d'essai ne doivent pas se
 * mélanger au journal de production, qui est publié. */
function resoudreMode(env: NodeJS.ProcessEnv): ModeDemo {
  const demo = env["BANC_DEMO"] === "1";
  return { demo, base: demo ? "validation/fixtures" : "validation", suffixe: demo ? "-demo" : "" };
}

function cheminOuDefaut(env: NodeJS.ProcessEnv, cle: string, defaut: string): string {
  const valeur = env[cle];
  return valeur === undefined ? defaut : valeur;
}

function racineStagingParDefaut(env: NodeJS.ProcessEnv, racine: string, demo: boolean): string {
  const defaut = demo ? resolve(racine, "validation/fixtures/staging-demo") : resolve(racine, "staging");
  return cheminOuDefaut(env, "BANC_STAGING", defaut);
}

export function configurationDepuisEnvironnement(env: NodeJS.ProcessEnv, racine: string): Configuration {
  const annotateur_id = annotateurIdRequis(env);
  const { demo, base, suffixe } = resoudreMode(env);
  const racine_staging = racineStagingParDefaut(env, racine, demo);

  return {
    racine_depot: racine,
    racine_staging: resolve(racine_staging),
    repertoire_lots: cheminOuDefaut(env, "BANC_LOTS", resolve(racine, `${base}/lots${suffixe}`)),
    repertoire_decisions: cheminOuDefaut(env, "BANC_DECISIONS", resolve(racine, `${base}/decisions${suffixe}`)),
    repertoire_brouillons: cheminOuDefaut(env, "BANC_BROUILLONS", resolve(racine, `${base}/brouillons${suffixe}`)),
    annotateur_id,
  };
}

export function creerContexte(configuration: Configuration): Contexte {
  return {
    configuration,
    annotateur_id: configuration.annotateur_id,
    journal: new JournalAnnotateur(configuration.repertoire_decisions, configuration.annotateur_id),
    brouillons: new Brouillons(configuration.repertoire_brouillons, configuration.annotateur_id),
    staging: () => chargerStaging(configuration.racine_staging),
    lots: () => lireLots(configuration.repertoire_lots),
    lot: (lot_id: string) => lireLot(configuration.repertoire_lots, lot_id),
    etatsDuLot: (lot: Lot) => etatsDuLot(configuration.repertoire_decisions, lot),
    maintenant: () => instantLocal(new Date()),
  };
}

/** Horodatage ISO 8601 avec décalage explicite, comme l'exige `schema/commun`. */
export function instantLocal(date: Date): string {
  const decalage = -date.getTimezoneOffset();
  const signe = decalage >= 0 ? "+" : "-";
  const heures = Math.floor(Math.abs(decalage) / 60);
  const minutes = Math.abs(decalage) % 60;
  const local = new Date(date.getTime() + decalage * 60_000).toISOString().slice(0, 19);
  return `${local}${signe}${deuxChiffres(heures)}:${deuxChiffres(minutes)}`;
}

function deuxChiffres(valeur: number): string {
  return String(valeur).padStart(2, "0");
}
