/**
 * Fixtures du lot gel : un dépôt Git jetable qui a la disposition du vrai (`data/items/`,
 * `data/mesures/`, `data/formulations/`, `config/perimetre.yaml`, `config/gel.json`), commité, donc
 * propre. Jamais le dépôt du projet : `pipeline/gel/geler.ts:geler` reçoit sa racine.
 *
 * Aucun candidat, outil, sondage, mesure ni URL réels : tout est ouvertement fictif (`demo-*`,
 * `*.invalid`). Les items sont fabriqués par les fabriques du lot questions et complétés de ce que
 * `item.schema.json` exige d'un item vérifié ; les formulations sont relues par la vraie règle
 * (`relecture.ts:formulationsValideesDe`) sur les tâches de la vraie règle (`entrees.ts:tachesDe`).
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { valider } from "../../outils/schemas/valider.ts";
import type { OptionsGel } from "../../pipeline/gel/geler.ts";
import { grainesFixes } from "../../pipeline/gel/graines.ts";
import type { ValeursDesGraines } from "../../pipeline/gel/graines.ts";
import { ecrireExclusif } from "../../pipeline/gel/ecriture.ts";
import { THEMES } from "../../pipeline/questions/types.ts";
import type { CandidatNomme, Item, Mesure, Theme } from "../../pipeline/questions/types.ts";
import { tachesDe } from "../../pipeline/reformulation/entrees.ts";
import type { Tache } from "../../pipeline/reformulation/entrees.ts";
import { formulationsValideesDe } from "../../pipeline/reformulation/relecture.ts";
import type { FormulationsValidees, PropositionAcceptee } from "../../pipeline/reformulation/relecture.ts";
import { mesure as mesureValidee } from "../aides/fabriques.ts";
import { commiterTout, initialiserDepot } from "../aides/depot.ts";
import { identifiant, itemA, itemF, itemP, mesure } from "../questions/fabriques.ts";
import type { OptionsItem } from "../questions/fabriques.ts";
import { promu } from "../reformulation/aides.ts";
import { identifiants, proposition, RELECTEUR, toutCoche } from "../reformulation/fabriques-relecture.ts";

/** 2026-12-01T00:00:00Z : le gel tombe à minuit UTC, un `valide_au` du 1er décembre l'atteint pile. */
export const GEL = "2026-12-01T01:00:00+01:00";
/** Cas 4 : 00:30 à Paris, la veille (23:30) en UTC. */
export const GEL_MINUIT_TRENTE = "2026-12-01T00:30:00+01:00";

export const CONFIGURATION_GEL = {
  $commentaire: "Paramètres de gel des tests ; juges et alias fictifs.",
  version_protocole: "0.16",
  fenetre_debut: "2026-12-01T06:00:00+01:00",
  juges: [
    { juge_id: "juge-1", famille_modele: "famille-x", modele: "famille-x/modele-juge-1", version_prompt: "prompts/judge-1.0.0" },
    { juge_id: "juge-2", famille_modele: "famille-y", modele: "famille-y/modele-juge-2", version_prompt: "prompts/judge-1.0.0" },
  ],
  alias_aveugles: { "outil-alpha": "O07" },
};

export const VALEURS_GRAINES: ValeursDesGraines = {
  tirage: 20261201,
  echantillon_humain: 20261202,
  bootstrap: 20261203,
  permutation: 20261204,
  contrefactuel: 20261205,
};

/* ------------------------------------------------------------------ données */

const FICTIVITE = {
  origine_fictive: "Mesure inventée pour les tests, sans auteur réel.",
  verification_fictivite: {
    date: "2026-11-15T11:00:00+01:00",
    corpus_verifies: ["demo-alpha"],
    operateur: "a2",
    resultat: "aucune_occurrence",
  },
};

/** Une mesure telle que `data/mesures/` la porte (historique compris). */
export function mesureDeData(cle: string, theme: Theme, formulation_canonique?: string): Mesure {
  const options = formulation_canonique === undefined ? { cle, theme } : { cle, theme, formulation_canonique };
  return mesureValidee({ ...mesure(options) });
}

export function mesureFictive(cle: string, theme: Theme): Mesure {
  return { ...mesureValidee({ ...mesure({ cle, theme, fictive: true }) }), ...FICTIVITE };
}

export function itemPDeData(options: OptionsItem): Item {
  return promu(itemP(options));
}

export function itemADeData(options: OptionsItem): Item {
  return promu(itemA(options));
}

export function itemFDeData(options: OptionsItem): Item {
  return promu(itemF(options));
}

/* -------------------------------------------------------------- périmètre */

function sha(cle: string): string {
  return cle.repeat(64).slice(0, 64);
}

function sondage(cle: string, date_publication: string): Record<string, unknown> {
  return {
    institut: `Institut ${cle}`,
    date_publication,
    url: `https://institut-${cle}.invalid/vague`,
    sha256: sha("a"),
    archive_url: `https://web.archive.invalid/${cle}`,
  };
}

/** Un candidat inclus par la règle du §3 au gel : déclaration et deux sondages dans les 60 jours. */
export function candidatSaisi(candidat: CandidatNomme): Record<string, unknown> {
  return {
    ...candidat,
    statut_au_gel: "actif",
    interroge: true,
    declaration_candidature: {
      url: `https://${candidat.candidat_id}.invalid/declaration`,
      date: "2026-06-02",
      par: "interesse",
      sha256: sha("b"),
      archive_url: `https://web.archive.invalid/${candidat.candidat_id}`,
    },
    preuves_inclusion: [sondage("x", "2026-10-05"), sondage("y", "2026-11-01")],
    contact_notification: null,
  };
}

function assistant(): Record<string, unknown> {
  return {
    outil_id: "outil-alpha",
    libelle: "Outil Alpha",
    editeur: "Éditeur Alpha",
    famille: "assistant",
    inclus: true,
    modele_demande: "modele-grand-public",
    modes: ["web_activee", "web_desactivee"],
    mode_de_tete: "web_activee",
    cgu_relues_le: "2026-11-10",
    clause_restrictive_signalee: false,
    preuve_inclusion: {
      url: "https://classement-stores.invalid/fr",
      date_publication: "2026-11-19",
      sha256: sha("c"),
      archive_url: "https://web.archive.invalid/stores",
    },
    sdk: { paquet: "sdk-alpha", version: "1.2.3" },
  };
}

export function perimetreSaisi(date_gel: string, candidats: readonly CandidatNomme[]): Record<string, unknown> {
  return {
    version: "0.2.0-essai",
    date_gel,
    regime_inclusion: "avant_liste_officielle",
    liste_officielle: null,
    themes: [...THEMES],
    tirage: { questions_par_strate: 1, questions_attribution_par_theme: 1 },
    candidats: candidats.map(candidatSaisi),
    outils: [assistant()],
  };
}

/* ------------------------------------------------------------ formulations */

/** Les formulations relues d'une tâche, par la vraie règle de relecture. */
export function relue(tache: Tache): FormulationsValidees {
  const prop = proposition(tache, { cle: `gel:${tache.question.id}:${tache.demande.position_affirmee}` }) as PropositionAcceptee;
  return formulationsValideesDe(tache, prop, toutCoche(), { ...RELECTEUR, commentaire: null }, identifiants(tache.question.id));
}

/* ------------------------------------------------------------------ dépôt */

export interface Jeu {
  readonly date_gel: string;
  readonly candidats: readonly CandidatNomme[];
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  /** Les formulations à poser dans `data/formulations/` ; par défaut, toutes relues. */
  readonly formulations?: (taches: readonly Tache[]) => readonly FormulationsValidees[];
  readonly configuration?: unknown;
}

export function tachesDuJeu(jeu: Jeu): readonly Tache[] {
  return tachesDe({ items: jeu.items, mesures: jeu.mesures, candidats: jeu.candidats });
}

function ecrireJson(chemin: string, valeur: unknown): void {
  writeFileSync(chemin, `${JSON.stringify(valeur, null, 2)}\n`, "utf8");
}

/** Pose le jeu sous `racine` (data/, config/), validé contre les schémas, sans commiter. */
export function poserJeu(racine: string, jeu: Jeu): void {
  for (const repertoire of ["data/items", "data/mesures", "data/formulations", "config"]) {
    mkdirSync(join(racine, repertoire), { recursive: true });
  }
  for (const item of jeu.items) ecrireJson(join(racine, "data/items", `${item.id}.json`), valider("item", item, item.id));
  for (const une of jeu.mesures) ecrireJson(join(racine, "data/mesures", `${une.id}.json`), valider("mesure", une, une.id));
  const taches = tachesDuJeu(jeu);
  const formulations = jeu.formulations === undefined ? taches.map(relue) : jeu.formulations(taches);
  for (const lue of formulations) ecrireJson(join(racine, "data/formulations", `${lue.question_id}.json`), lue);
  writeFileSync(join(racine, "config/perimetre.yaml"), stringify(perimetreSaisi(jeu.date_gel, jeu.candidats)), "utf8");
  ecrireJson(join(racine, "config/gel.json"), jeu.configuration === undefined ? CONFIGURATION_GEL : jeu.configuration);
}

/** Un dépôt Git temporaire, propre, qui porte le jeu. */
export function depotDuJeu(jeu: Jeu): string {
  const racine = mkdtempSync(join(tmpdir(), "banc-gel-depot-"));
  poserJeu(racine, jeu);
  initialiserDepot(racine);
  return racine;
}

export function recommiter(racine: string, message: string): void {
  commiterTout(racine, message);
}

/** Les options d'un gel d'essai : toujours une sortie hors de `runs/`, graines et identifiant fixes. */
export function optionsGel(racine: string, sortie: string | undefined, surcharges: Partial<OptionsGel> = {}): OptionsGel {
  return {
    racine,
    sortie,
    type_run: "pilote",
    source_graines: grainesFixes(VALEURS_GRAINES, "graines des tests"),
    identifiant: () => identifiant("run:gel"),
    ecrire: ecrireExclusif,
    ...surcharges,
  };
}

/* ------------------------------------------------------------- jeux types */

export const ALPHA: CandidatNomme = { candidat_id: "demo-alpha", libelle: "Hélène Durand-Aubry", nom: "Durand-Aubry" };
export const BETA: CandidatNomme = { candidat_id: "demo-beta", libelle: "Basile Fictif", nom: "Fictif" };
