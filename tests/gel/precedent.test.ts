/**
 * Lot gel, PR 2b : le run précédent (décision D45 (3), §5, reprises à 80 %). Chaque cas limite du
 * brief a son test, nommé « précédent, cas n ».
 *
 * Le choix (`choisirPrecedent`) est éprouvé sur des `run.json` déjà lus ; la lecture et la
 * vérification, sur un dépôt de fixture où un premier gel écrit sous `runs/` (dépôt jetable, jamais
 * celui du projet), puis un second gel, à une `date_gel` plus tardive, écrit vers une sortie
 * temporaire. Le réseau est rejoué par `reseau-fixture.ts`.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { valider } from "../../outils/schemas/valider.ts";
import { geler } from "../../pipeline/gel/geler.ts";
import type { OptionsGel } from "../../pipeline/gel/geler.ts";
import { choisirPrecedent, PrecedentRefuse } from "../../pipeline/gel/precedent.ts";
import type { RunDeRuns } from "../../pipeline/gel/precedent.ts";
import { executerOutil, RACINE_PROJET } from "../aides/depot.ts";
import { ALPHA, CONFIGURATION_GEL, depotDuJeu, optionsGel, perimetreSaisi, recommiter } from "./fixtures.ts";
import { jeuNominal } from "./jeux.ts";
import { relaisDeFixture, waybackDeFixture } from "./reseau-fixture.ts";

const DATE_1 = "2026-12-01";
/** Le second gel : le lendemain, sa fenêtre le mardi suivant ; les deux sondages restent dans les 60 jours. */
const GEL_2 = "2026-12-02T01:00:00+01:00";
const DATE_2 = "2026-12-02";
const FENETRE_2 = "2026-12-08T06:00:00+01:00";
const MAINTENANT_2 = Date.parse("2026-12-03T00:00:00Z");
const RUNS_DU_PROJET = join(RACINE_PROJET, "runs");

interface EntreeLue {
  question_id: string;
  reprise: boolean;
  run_origine_id?: string;
  empreinte_texte_precedente?: string;
}

interface QuestionLue {
  id: string;
  formulations: { registre: string; texte: string; empreinte_texte: string }[];
}

/* ------------------------------------------------------------------ outillage */

const temporaires: string[] = [];

function temporaire(prefixe: string): string {
  const chemin = mkdtempSync(join(tmpdir(), prefixe));
  temporaires.push(chemin);
  return chemin;
}

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function arborescence(racine: string): readonly string[] {
  if (!existsSync(racine)) return [];
  return readdirSync(racine, { recursive: true, encoding: "utf8" }).sort();
}

let runsAvant: readonly string[];

beforeAll(() => {
  runsAvant = arborescence(RUNS_DU_PROJET);
});

afterAll(() => {
  // Aucun test n'écrit dans runs/ du projet.
  expect(arborescence(RUNS_DU_PROJET)).toEqual(runsAvant);
});

function sha256(octets: string | Uint8Array): string {
  return createHash("sha256").update(octets).digest("hex");
}

function lireJson<T>(chemin: string): T {
  return JSON.parse(readFileSync(chemin, "utf8")) as T;
}

function ecrireJson(chemin: string, valeur: unknown): void {
  writeFileSync(chemin, `${JSON.stringify(valeur, null, 2)}\n`, "utf8");
}

async function refusDe(options: OptionsGel): Promise<Error> {
  try {
    await geler(options);
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw new Error(`valeur levée qui n'est pas une Error : ${String(erreur)}`);
  }
  throw new Error("Le gel a été accepté alors qu'un refus était attendu.");
}

/** Un dépôt de fixture où un premier gel, de ce type, a écrit `runs/2026-12-01/`, commité. */
async function depotAvecUnRun(type_run = "mensuel"): Promise<string> {
  const racine = depotDuJeu(jeuNominal());
  temporaires.push(racine);
  await geler(optionsGel(racine, undefined, { type_run }));
  recommiter(racine, "premier run");
  return racine;
}

function premierRun(racine: string): string {
  return join(racine, "runs", DATE_1);
}

/** Avance le périmètre et la fenêtre au second gel, et commite. */
function avancer(racine: string): void {
  writeFileSync(join(racine, "config/perimetre.yaml"), stringify(perimetreSaisi(GEL_2, [ALPHA])), "utf8");
  ecrireJson(join(racine, "config/gel.json"), { ...CONFIGURATION_GEL, fenetre_debut: FENETRE_2 });
  recommiter(racine, "second gel");
}

function optionsDuSecond(racine: string, sortie: string, surcharges: Partial<OptionsGel> = {}): OptionsGel {
  return optionsGel(racine, sortie, { type_run: "mensuel", maintenant: () => MAINTENANT_2, ...surcharges });
}

async function secondGel(racine: string) {
  avancer(racine);
  const sortie = temporaire("banc-gel-precedent-");
  await geler(optionsDuSecond(racine, sortie));
  return join(sortie, DATE_2);
}

/** Le second gel est refusé, sans rien écrire et sans aucun appel réseau. */
async function secondRefuse(racine: string): Promise<PrecedentRefuse> {
  recommiter(racine, "altération du premier run");
  avancer(racine);
  const sortie = temporaire("banc-gel-precedent-");
  const relais = relaisDeFixture();
  const wayback = waybackDeFixture();
  const erreur = await refusDe(optionsDuSecond(racine, sortie, { relais: relais.lire, wayback: wayback.lire }));
  expect(erreur).toBeInstanceOf(PrecedentRefuse);
  expect(arborescence(sortie)).toEqual([]);
  expect(relais.appels).toEqual([]);
  expect(wayback.appels).toEqual([]);
  return erreur as PrecedentRefuse;
}

/* -------------------------------------------------------- choix, partie pure */

function runLu(repertoire: string, date_gel: string, surcharges: Partial<RunDeRuns> = {}): RunDeRuns {
  return {
    repertoire,
    id: `01K${repertoire.replaceAll("-", "").padEnd(23, "0")}`,
    date_gel_ms: Date.parse(date_gel),
    type_run: "mensuel",
    statut: "publie",
    tirage: { chemin: `runs/${repertoire}/tirage.json`, sha256: "a".repeat(64) },
    ...surcharges,
  };
}

const NOTRE_GEL = Date.parse("2027-01-05T06:00:00+01:00");
const NOVEMBRE = runLu("2026-11-03", "2026-11-03T06:00:00+01:00");
const DECEMBRE = runLu("2026-12-01", "2026-12-01T06:00:00+01:00");

describe("précédent, cas 1 : aucun run", () => {
  it("précédent, cas 1 : runs/ vide ⇒ aucun précédent", () => {
    expect(choisirPrecedent([], NOTRE_GEL)).toBeNull();
  });

  it("précédent, cas 1 : aucun run dans runs/ ⇒ run_precedent: null inscrit, tirage sans reprise", async () => {
    const racine = depotDuJeu(jeuNominal());
    temporaires.push(racine);
    const sortie = temporaire("banc-gel-precedent-");
    await geler(optionsGel(racine, sortie));
    const run = lireJson<Record<string, unknown>>(join(sortie, DATE_1, "run.json"));
    expect(Object.keys(run)).toContain("run_precedent");
    expect(run["run_precedent"]).toBeNull();
    const entrees = lireJson<{ entrees: EntreeLue[] }>(join(sortie, DATE_1, "tirage.json")).entrees;
    expect(entrees.length).toBeGreaterThan(0);
    expect(entrees.every((entree) => !entree.reprise)).toBe(true);
  });
});

describe("précédent, cas 2 : le plus récent strictement avant", () => {
  it("précédent, cas 2 : deux runs antérieurs ⇒ le plus récent, quel que soit l'ordre de lecture", () => {
    expect(choisirPrecedent([NOVEMBRE, DECEMBRE], NOTRE_GEL)).toBe(DECEMBRE);
    expect(choisirPrecedent([DECEMBRE, NOVEMBRE], NOTRE_GEL)).toBe(DECEMBRE);
  });

  it("précédent, cas 2 : un run à la même date_gel n'est pas précédent ; un run postérieur non plus", () => {
    expect(choisirPrecedent([NOVEMBRE, DECEMBRE], DECEMBRE.date_gel_ms)).toBe(NOVEMBRE);
    expect(choisirPrecedent([DECEMBRE], DECEMBRE.date_gel_ms)).toBeNull();
    expect(choisirPrecedent([DECEMBRE], DECEMBRE.date_gel_ms - 1)).toBeNull();
    expect(choisirPrecedent([DECEMBRE], DECEMBRE.date_gel_ms + 1)).toBe(DECEMBRE);
  });

  it("précédent, cas 2 : deux runs retenables à la même date_gel ⇒ refus nommé, aucun choisi", () => {
    const jumeau = { ...DECEMBRE, repertoire: "2026-12-01-bis" };
    const erreur = (() => {
      try {
        choisirPrecedent([DECEMBRE, jumeau], NOTRE_GEL);
      } catch (refus) {
        return refus;
      }
      throw new Error("aucun refus");
    })();
    expect(erreur).toBeInstanceOf(PrecedentRefuse);
    expect((erreur as PrecedentRefuse).motif).toBe("precedent_ambigu");
  });

  it("précédent, cas 2 : un gel à la même date_gel qu'un run de runs/ ne le prend pas pour précédent", async () => {
    const racine = await depotAvecUnRun();
    const sortie = temporaire("banc-gel-precedent-");
    await geler(optionsGel(racine, sortie, { type_run: "mensuel" }));
    expect(lireJson<Record<string, unknown>>(join(sortie, DATE_1, "run.json"))["run_precedent"]).toBeNull();
  });
});

describe("précédent, cas 3 : invalides et pilotes écartés", () => {
  it("précédent, cas 3 : le plus récent est invalide ⇒ celui d'avant", () => {
    expect(choisirPrecedent([NOVEMBRE, { ...DECEMBRE, statut: "invalide" }], NOTRE_GEL)).toBe(NOVEMBRE);
  });

  it("précédent, cas 3 : le plus récent est un pilote ⇒ celui d'avant", () => {
    expect(choisirPrecedent([NOVEMBRE, { ...DECEMBRE, type_run: "pilote" }], NOTRE_GEL)).toBe(NOVEMBRE);
  });

  it("précédent, cas 3 : un run planifié, en cours ou provisoire reste un précédent (seul invalide est exclu)", () => {
    for (const statut of ["planifie", "en_cours", "publie_provisoire"]) {
      expect(choisirPrecedent([{ ...DECEMBRE, statut }], NOTRE_GEL)).toEqual({ ...DECEMBRE, statut });
    }
  });

  it("précédent, cas 3 : seul run de runs/, un pilote ⇒ run_precedent: null", async () => {
    const racine = await depotAvecUnRun("pilote");
    const run = await secondGel(racine);
    expect(lireJson<Record<string, unknown>>(join(run, "run.json"))["run_precedent"]).toBeNull();
  });

  it("précédent, cas 3 : seul run de runs/, invalidé ⇒ run_precedent: null", async () => {
    const racine = await depotAvecUnRun();
    const chemin = join(premierRun(racine), "run.json");
    ecrireJson(chemin, { ...lireJson<Record<string, unknown>>(chemin), statut: "invalide" });
    recommiter(racine, "premier run invalidé");
    const run = await secondGel(racine);
    expect(lireJson<Record<string, unknown>>(join(run, "run.json"))["run_precedent"]).toBeNull();
  });
});

describe("précédent, cas 4 : précédent illisible ou incohérent ⇒ refus nommé, rien écrit", () => {
  it("précédent, cas 4 : tirage dont le SHA-256 ne correspond pas à son run.json ⇒ refus, rien écrit", async () => {
    const racine = await depotAvecUnRun();
    const chemin = join(premierRun(racine), "tirage.json");
    writeFileSync(chemin, `${readFileSync(chemin, "utf8")}\n`, "utf8");
    const erreur = await secondRefuse(racine);
    expect(erreur.motif).toBe("empreinte_differente");
    expect(erreur.message).toContain(`runs/${DATE_1}/tirage.json`);
  });

  it("précédent, cas 4 : un répertoire de runs/ sans run.json ⇒ refus run_illisible, jamais « pas de précédent »", async () => {
    const racine = await depotAvecUnRun();
    mkdirSync(join(racine, "runs", "2026-11-03"));
    writeFileSync(join(racine, "runs", "2026-11-03", "notes.txt"), "sans run.json", "utf8");
    const erreur = await secondRefuse(racine);
    expect(erreur.motif).toBe("run_illisible");
    expect(erreur.run).toBe("2026-11-03");
  });

  it("précédent, cas 4 : un run.json dont un champ lu n'est pas conforme ⇒ refus run_illisible", async () => {
    const racine = await depotAvecUnRun();
    const chemin = join(premierRun(racine), "run.json");
    ecrireJson(chemin, { ...lireJson<Record<string, unknown>>(chemin), statut: "termine" });
    expect((await secondRefuse(racine)).motif).toBe("run_illisible");
  });

  it("précédent, cas 4 : un tirage d'un autre run, empreinte recalculée ⇒ refus tirage_d_un_autre_run", async () => {
    const racine = await depotAvecUnRun();
    const repertoire = premierRun(racine);
    const tirage = lireJson<Record<string, unknown>>(join(repertoire, "tirage.json"));
    const texte = `${JSON.stringify({ ...tirage, run_id: "01KAAAAAAAAAAAAAAAAAAAAAAA" }, null, 2)}\n`;
    writeFileSync(join(repertoire, "tirage.json"), texte, "utf8");
    const run = lireJson<{ tirage: Record<string, unknown> }>(join(repertoire, "run.json"));
    ecrireJson(join(repertoire, "run.json"), { ...run, tirage: { ...run.tirage, sha256: sha256(texte) } });
    expect((await secondRefuse(racine)).motif).toBe("tirage_d_un_autre_run");
  });

  it("précédent, cas 4 : une question tirée absente de questions.json ⇒ refus question_introuvable", async () => {
    const racine = await depotAvecUnRun();
    const repertoire = premierRun(racine);
    const tiree = lireJson<{ entrees: EntreeLue[] }>(join(repertoire, "tirage.json")).entrees[0]?.question_id;
    const questions = lireJson<QuestionLue[]>(join(repertoire, "questions.json"));
    ecrireJson(join(repertoire, "questions.json"), questions.filter((question) => question.id !== tiree));
    const erreur = await secondRefuse(racine);
    expect(erreur.motif).toBe("question_introuvable");
    expect(erreur.message).toContain(String(tiree));
  });

  it("précédent, cas 4 : questions.json absent ⇒ refus questions_illisibles", async () => {
    const racine = await depotAvecUnRun();
    rmSync(join(premierRun(racine), "questions.json"));
    expect((await secondRefuse(racine)).motif).toBe("questions_illisibles");
  });

  it("précédent, cas 4 : tirage.chemin hors du répertoire de son run ⇒ refus chemin_incoherent", async () => {
    const racine = await depotAvecUnRun();
    const chemin = join(premierRun(racine), "run.json");
    const run = lireJson<{ tirage: Record<string, unknown> }>(chemin);
    ecrireJson(chemin, { ...run, tirage: { ...run.tirage, chemin: "runs/2026-11-03/tirage.json" } });
    expect((await secondRefuse(racine)).motif).toBe("chemin_incoherent");
  });
});

describe("précédent, cas 5 et 10 : reprises au second gel", () => {
  it("précédent, cas 5 : une question reprise porte reprise, run_origine_id et empreinte_texte_precedente", async () => {
    const racine = await depotAvecUnRun();
    const premier = lireJson<{ id: string; tirage: { sha256: string } }>(join(premierRun(racine), "run.json"));
    const run = await secondGel(racine);
    const objet = lireJson<Record<string, unknown>>(join(run, "run.json"));
    expect(objet["run_precedent"]).toEqual({ id: premier.id, tirage: { chemin: `runs/${DATE_1}/tirage.json`, sha256: premier.tirage.sha256 } });
    expect(() => valider("run", objet, "run.json du second gel")).not.toThrow();
    const questions = new Map(lireJson<QuestionLue[]>(join(premierRun(racine), "questions.json")).map((question) => [question.id, question]));
    const reprises = lireJson<{ entrees: EntreeLue[] }>(join(run, "tirage.json")).entrees.filter((entree) => entree.reprise);
    expect(reprises.length).toBeGreaterThan(0);
    for (const entree of reprises) {
      const neutre = questions.get(entree.question_id)?.formulations.find((formulation) => formulation.registre === "neutre");
      expect(entree.run_origine_id).toBe(premier.id);
      expect(entree.empreinte_texte_precedente).toBe(neutre?.empreinte_texte);
    }
  });

  it("précédent, cas 5 : une question dont un texte a changé depuis le run précédent compte comme neuve", async () => {
    const racine = await depotAvecUnRun();
    const repertoire = premierRun(racine);
    const tirees = lireJson<{ entrees: EntreeLue[] }>(join(repertoire, "tirage.json")).entrees.map((entree) => entree.question_id);
    const changee = tirees[0];
    const questions = lireJson<QuestionLue[]>(join(repertoire, "questions.json")).map((question) =>
      question.id !== changee
        ? question
        : {
            ...question,
            formulations: question.formulations.map((formulation) =>
              formulation.registre !== "familier"
                ? formulation
                : { ...formulation, texte: `${formulation.texte} (autre)`, empreinte_texte: sha256(`${formulation.texte} (autre)`) },
            ),
          },
    );
    ecrireJson(join(repertoire, "questions.json"), questions);
    recommiter(racine, "un texte du premier run diffère");
    const run = await secondGel(racine);
    const entrees = lireJson<{ entrees: EntreeLue[] }>(join(run, "tirage.json")).entrees;
    const entree = entrees.find((candidate) => candidate.question_id === changee);
    expect(entree).toBeDefined();
    expect(entree?.reprise).toBe(false);
    expect(entree).not.toHaveProperty("run_origine_id");
    expect(entrees.filter((autre) => autre.question_id !== changee && tirees.includes(autre.question_id)).every((autre) => autre.reprise)).toBe(true);
  });

  it("précédent, cas 10 : deux gels successifs, le second reprend le premier et passe pnpm symmetry", async () => {
    const racine = await depotAvecUnRun();
    const run = await secondGel(racine);
    const entrees = lireJson<{ entrees: EntreeLue[] }>(join(run, "tirage.json")).entrees;
    expect(entrees.some((entree) => entree.reprise)).toBe(true);
    const resultat = executerOutil("symmetry.ts", [
      `--tirage=${join(run, "tirage.json")}`,
      `--questions=${join(run, "questions.json")}`,
      `--items=${join(racine, "data/items")}`,
      `--mesures=${join(racine, "data/mesures")}`,
      `--run=${join(run, "run.json")}`,
    ]);
    expect(resultat.erreur).not.toContain("Le run ne peut pas être lancé");
    expect(resultat.status).toBe(0);
    expect(resultat.sortie).toContain("Contrôles verts : le run peut être lancé.");
  });
});
