/**
 * Lot gel, PR 3 (décision D51 (3)) : `pnpm geler --type-run=reexecution --remplace=<id>`. Cas limites
 * 7 et 10 du brief, nommés « remplacement, cas n ».
 *
 * Un premier gel écrit `runs/2026-12-01/` d'un dépôt de fixture (jamais celui du projet) ; il est
 * invalidé par la vraie commande (`invaliderRun`), commité ; un second gel, le lendemain, vers une
 * sortie temporaire, le remplace. Le réseau est rejoué par `reseau-fixture.ts`.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { geler } from "../../pipeline/gel/geler.ts";
import type { OptionsGel } from "../../pipeline/gel/geler.ts";
import { choisirPrecedent } from "../../pipeline/gel/precedent.ts";
import type { RunDeRuns } from "../../pipeline/gel/precedent.ts";
import { RemplacementRefuse } from "../../pipeline/gel/remplacement.ts";
import type { MotifRemplacement } from "../../pipeline/gel/remplacement.ts";
import { invaliderRun } from "../../pipeline/run/invalidation.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { ALPHA, CONFIGURATION_GEL, depotDuJeu, optionsGel, perimetreSaisi, recommiter } from "./fixtures.ts";
import { jeuNominal } from "./jeux.ts";
import { relaisDeFixture, waybackDeFixture } from "./reseau-fixture.ts";

const DATE_1 = "2026-12-01";
const GEL_1_MS = Date.parse("2026-12-01T01:00:00+01:00");
const GEL_2 = "2026-12-02T01:00:00+01:00";
const DATE_2 = "2026-12-02";
const FENETRE_2 = "2026-12-08T06:00:00+01:00";
const MAINTENANT_2 = Date.parse("2026-12-03T00:00:00Z");
const MOTIF = "Incident technique : l'interrogation d'un outil a été interrompue six heures (§6).";
const RUNS_DU_PROJET = join(RACINE_PROJET, "runs");

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

function lireJson<T>(chemin: string): T {
  return JSON.parse(readFileSync(chemin, "utf8")) as T;
}

/** Les octets de chaque fichier d'un répertoire de run, par chemin relatif. */
function octetsDuRun(repertoire: string): ReadonlyMap<string, string> {
  const fichiers = arborescence(repertoire).filter((chemin) => statSync(join(repertoire, chemin)).isFile());
  expect(fichiers).toContain("run.json");
  return new Map(fichiers.map((chemin) => [chemin, readFileSync(join(repertoire, chemin)).toString("base64")]));
}

function premierRun(racine: string): string {
  return join(racine, "runs", DATE_1);
}

/** Un dépôt où un premier gel a écrit `runs/2026-12-01/`, invalidé ou non, commité. */
async function depotAvecUnRun(invalide: boolean, statut = "planifie"): Promise<{ racine: string; id: string }> {
  const racine = depotDuJeu(jeuNominal());
  temporaires.push(racine);
  await geler(optionsGel(racine, undefined, { type_run: "mensuel" }));
  const chemin = join(premierRun(racine), "run.json");
  if (statut !== "planifie") writeFileSync(chemin, `${JSON.stringify({ ...lireJson<Record<string, unknown>>(chemin), statut }, null, 2)}\n`, "utf8");
  if (invalide) invaliderRun(premierRun(racine), MOTIF, GEL_1_MS + 3_600_000);
  recommiter(racine, "premier run");
  return { racine, id: lireJson<{ id: string }>(chemin).id };
}

/** Avance le périmètre et la fenêtre au second gel, et commite. */
function avancer(racine: string): void {
  writeFileSync(join(racine, "config/perimetre.yaml"), stringify(perimetreSaisi(GEL_2, [ALPHA])), "utf8");
  writeFileSync(join(racine, "config/gel.json"), `${JSON.stringify({ ...CONFIGURATION_GEL, fenetre_debut: FENETRE_2 }, null, 2)}\n`, "utf8");
  recommiter(racine, "second gel");
}

function optionsDuSecond(racine: string, sortie: string, surcharges: Partial<OptionsGel>): OptionsGel {
  return optionsGel(racine, sortie, { maintenant: () => MAINTENANT_2, ...surcharges });
}

/** Le second gel est refusé nommément, sans rien écrire et sans aucun appel réseau. */
async function secondRefuse(racine: string, surcharges: Partial<OptionsGel>): Promise<MotifRemplacement> {
  avancer(racine);
  const sortie = temporaire("banc-gel-remplacement-");
  const relais = relaisDeFixture();
  const wayback = waybackDeFixture();
  const erreur = await geler(optionsDuSecond(racine, sortie, { ...surcharges, relais: relais.lire, wayback: wayback.lire })).then(
    () => new Error("Le gel a été accepté alors qu'un refus était attendu."),
    (refus: unknown) => refus,
  );
  expect(erreur).toBeInstanceOf(RemplacementRefuse);
  expect(arborescence(sortie)).toEqual([]);
  expect(relais.appels).toEqual([]);
  expect(wayback.appels).toEqual([]);
  return (erreur as RemplacementRefuse).motif;
}

/* ------------------------------------------------------------------ cas 7 */

describe("remplacement, cas 7 : pnpm geler --type-run=reexecution --remplace=<id>", () => {
  it("remplacement, cas 7 : run trouvé, invalidé ⇒ run_remplace_id écrit ; le run remplacé garde ses octets", async () => {
    const { racine, id } = await depotAvecUnRun(true);
    const avant = octetsDuRun(premierRun(racine));
    avancer(racine);
    const sortie = temporaire("banc-gel-remplacement-");
    await geler(optionsDuSecond(racine, sortie, { type_run: "reexecution", remplace: id }));
    const run = lireJson<Record<string, unknown>>(join(sortie, DATE_2, "run.json"));
    expect(run["type_run"]).toBe("reexecution");
    expect(run["run_remplace_id"]).toBe(id);
    expect(run["statut"]).toBe("planifie");
    const apres = octetsDuRun(premierRun(racine));
    expect(apres).toEqual(avant);
    expect(lireJson<Record<string, unknown>>(join(premierRun(racine), "run.json"))["invalidation"]).toEqual({ motif: MOTIF, date: "2026-12-01T02:00:00.000+01:00" });
  });

  it("remplacement, cas 7 : un gel d'un autre type n'écrit pas run_remplace_id", async () => {
    const { racine } = await depotAvecUnRun(false);
    avancer(racine);
    const sortie = temporaire("banc-gel-remplacement-");
    await geler(optionsDuSecond(racine, sortie, { type_run: "mensuel" }));
    expect(Object.keys(lireJson<Record<string, unknown>>(join(sortie, DATE_2, "run.json")))).not.toContain("run_remplace_id");
  });

  it("remplacement, cas 7 : run introuvable ⇒ refus run_remplace_introuvable, rien écrit, aucun appel réseau", async () => {
    const { racine } = await depotAvecUnRun(true);
    expect(await secondRefuse(racine, { type_run: "reexecution", remplace: "01KAAAAAAAAAAAAAAAAAAAAAAA" })).toBe("run_remplace_introuvable");
  });

  it("remplacement, cas 7 : run trouvé sans invalidation ⇒ refus run_remplace_sans_invalidation, rien écrit", async () => {
    const { racine, id } = await depotAvecUnRun(false);
    expect(await secondRefuse(racine, { type_run: "reexecution", remplace: id })).toBe("run_remplace_sans_invalidation");
  });

  it("remplacement, cas 7 : --remplace sans reexecution ⇒ refus remplace_sans_reexecution, rien écrit", async () => {
    const { racine, id } = await depotAvecUnRun(true);
    expect(await secondRefuse(racine, { type_run: "mensuel", remplace: id })).toBe("remplace_sans_reexecution");
  });

  it("remplacement, cas 7 : reexecution sans --remplace ⇒ refus reexecution_sans_remplace, rien écrit", async () => {
    const { racine } = await depotAvecUnRun(true);
    expect(await secondRefuse(racine, { type_run: "reexecution", remplace: undefined })).toBe("reexecution_sans_remplace");
  });
});

/* ------------------------------------------------------------------ cas 10 */

function runLu(repertoire: string, date_gel: string, surcharges: Partial<RunDeRuns> = {}): RunDeRuns {
  return {
    repertoire,
    id: `01K${repertoire.replaceAll("-", "").padEnd(23, "0")}`,
    date_gel_ms: Date.parse(date_gel),
    type_run: "mensuel",
    statut: "publie",
    tirage: { chemin: `runs/${repertoire}/tirage.json`, sha256: "a".repeat(64) },
    questions: { chemin: `runs/${repertoire}/questions.json`, sha256: "b".repeat(64) },
    ...surcharges,
  };
}

describe("remplacement, cas 10 : le précédent saute toujours un run en_cours invalidé (non-régression)", () => {
  it("remplacement, cas 10 : choix pur : le plus récent en_cours et invalidé ⇒ sauté, le publié d'avant est pris", () => {
    const novembre = runLu("2026-11-03", "2026-11-03T06:00:00+01:00");
    const decembre = runLu("2026-12-01", "2026-12-01T06:00:00+01:00", { statut: "en_cours", invalidation: { motif: MOTIF, date: "2026-12-01T12:00:00+01:00" } });
    expect(choisirPrecedent([novembre, decembre], Date.parse("2027-01-05T06:00:00+01:00"))).toBe(novembre);
  });

  it("remplacement, cas 10 : seul run de runs/, en_cours et invalidé ⇒ run_precedent: null, au gel de sa réexécution", async () => {
    const { racine, id } = await depotAvecUnRun(true, "en_cours");
    avancer(racine);
    const sortie = temporaire("banc-gel-remplacement-");
    await geler(optionsDuSecond(racine, sortie, { type_run: "reexecution", remplace: id }));
    const run = lireJson<Record<string, unknown>>(join(sortie, DATE_2, "run.json"));
    expect(run["run_precedent"]).toBeNull();
    expect(run["run_remplace_id"]).toBe(id);
  });
});
