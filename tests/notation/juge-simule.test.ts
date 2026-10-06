/**
 * Le juge simulé, le fournisseur d'existences simulé et leur garde-fou (lot notation, PR D), hors
 * de la chaîne : chaque note qu'il sait rendre est conforme au schéma, il est déterministe, il ne
 * reçoit que la charge, sa référence de prompt se dit simulée, et ni lui ni le fournisseur ne se
 * branchent sous `runs/`.
 */

import { mkdtempSync, readFileSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { construireCharge, type ChargeJuge } from "../../pipeline/notation/charge-juge.ts";
import { citationsDeReference } from "../../pipeline/notation/extrait.ts";
import { fournisseurSimule, TableExistencesInvalide } from "../../pipeline/notation/fournisseur-simule.ts";
import { estSousRuns, RUNS_DU_DEPOT, SimuleSousRuns } from "../../pipeline/notation/garde-simule.ts";
import { notationDeJuge, type Juge, type SortieJuge } from "../../pipeline/notation/juge.ts";
import { jugesSimules, JugeSimuleMalRegle, REGLES_JUGE_SIMULE, type ParametresJugeSimule } from "../../pipeline/notation/juge-simule.ts";
import { preparerNotationSimulee } from "../../pipeline/notation/notation-simulee.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { ITEM_P } from "./run-fictif.ts";
import { FIXTURES_INTERROGATION, FIXTURES_NOTATION, parametresDeReference } from "./simulation.ts";

const temporaires: string[] = [];

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function temporaire(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-juge-simule-test-"));
  temporaires.push(chemin);
  return chemin;
}

const EXEMPLE = JSON.parse(readFileSync(join(RACINE_PROJET, "schema/exemples/reponse/valide-01-api-obtenue.json"), "utf8")) as ReponseObtenue;
const LIEN = "https://source-simulee.invalid/page";

function reponse(surcharges: Partial<ReponseObtenue["normalise"]>): ReponseObtenue {
  return { ...EXEMPLE, normalise: { ...EXEMPLE.normalise, texte: "Réponse simulée, sans contenu réel.", liens: [LIEN], citations: [{ url: LIEN }], ...surcharges } };
}

function charge(r: ReponseObtenue, gabarit: ChargeJuge["question"]["gabarit"] = "Q-DIR"): ChargeJuge {
  return construireCharge({
    reponse: r,
    question: { gabarit, texte: "Question simulée, sans contenu réel." },
    references: [{ item: ITEM_P, role: "principal" }],
    date_run: "2026-12-01T06:00:00+01:00",
    prompt: REGLES_JUGE_SIMULE.prompt,
  });
}

/** Les paramètres de référence, avec une répartition qui ne laisse qu'un scénario. */
function seul(nature: "ordinaire" | "refus_api", scenario: string): ParametresJugeSimule {
  const reference = parametresDeReference().juge_simule;
  return { ...reference, repartition: { ...reference.repartition, [nature]: { [scenario]: 1 } } };
}

function notationValide(juge: Juge, sortie: SortieJuge, c: ChargeJuge, r: ReponseObtenue): void {
  const notation = notationDeJuge(juge.identite, sortie, {
    id: "01KBCS0G00SM0R0N0S1M01E001",
    run_id: "01KBCS0G00SM0R0N0S1M01E000",
    contexte: "run",
    motif_notation: "notation_juge",
    objet_id: r.id,
    gabarit: c.question.gabarit,
    references_item: [{ item_id: ITEM_P.id, item_version: ITEM_P.version, item_empreinte: ITEM_P.empreinte }],
    date: "2026-12-04T10:00:00+01:00",
    liens: c.reponse.liens,
    existences: new Map([[LIEN, { url_citee: LIEN, verdict_existence: "existe" as const, date_test: "2026-12-04T09:00:00+01:00" }]]),
    textes: { reponse: r.normalise.texte, citations_reference: citationsDeReference([ITEM_P]) },
  });
  valider("notation", notation, `notation simulée ${juge.identite.juge_id}`);
}

describe("le juge simulé", () => {
  it("ne reçoit que la ChargeJuge : le type de son port l'impose", () => {
    expectTypeOf<Parameters<Juge["noter"]>>().toEqualTypeOf<[ChargeJuge]>();
  });

  it("rend, pour chaque scénario et chaque rôle, une notation conforme au schéma", async () => {
    const cas = [
      ...Object.keys(REGLES_JUGE_SIMULE.scenarios.ordinaire).map((s) => ({ nature: "ordinaire" as const, scenario: s, r: reponse({}) })),
      ...Object.keys(REGLES_JUGE_SIMULE.scenarios.refus_api).map((s) => ({ nature: "refus_api" as const, scenario: s, r: reponse({ texte: "", liens: [], refus_api: true }) })),
    ];
    for (const { nature, scenario, r } of cas) {
      for (const juge of jugesSimules(seul(nature, scenario), temporaire())) {
        const c = charge(r);
        notationValide(juge, await juge.noter(c), c, r);
      }
    }
  });

  it("est déterministe : même charge, même graine, même sortie", async () => {
    const c = charge(reponse({}));
    const [a1] = jugesSimules(parametresDeReference().juge_simule, temporaire());
    const [a2] = jugesSimules(parametresDeReference().juge_simule, temporaire());
    expect(a1 && (await a1.noter(c))).toEqual(a2 && (await a2.noter(c)));
  });

  it("le scénario extrait invalide cite un extrait absent de la charge, l'autre rôle un extrait présent", async () => {
    const r = reponse({ texte: "", liens: [], refus_api: true });
    const c = charge(r);
    const [a, b] = jugesSimules(seul("refus_api", "extrait_invalide"), temporaire());
    const sortieA = a && (await a.noter(c));
    const sortieB = b && (await b.noter(c));
    expect(sortieA?.extrait_justificatif?.texte).toBe(REGLES_JUGE_SIMULE.extrait_introuvable);
    expect(sortieB?.extrait_justificatif).toEqual({ provenance: "reference", texte: ITEM_P.assertion?.citation_verbatim });
  });

  it("dit sa référence de prompt simulée, sans fichier de prompts/", () => {
    for (const juge of jugesSimules(parametresDeReference().juge_simule, temporaire())) {
      expect(juge.identite.prompt.chemin.startsWith("simule://")).toBe(true);
      expect(existsSync(join(RACINE_PROJET, juge.identite.prompt.chemin))).toBe(false);
    }
  });

  it("refuse une question d'attribution, qu'il ne sait pas noter", async () => {
    const [juge] = jugesSimules(parametresDeReference().juge_simule, temporaire());
    await expect(Promise.resolve().then(() => juge?.noter(charge(reponse({}), "Q-ATT")))).rejects.toBeInstanceOf(JugeSimuleMalRegle);
  });

  it("refuse une répartition qui nomme un scénario inconnu, sans poids, ou un biais hors de [0, 1]", () => {
    const reference = parametresDeReference().juge_simule;
    expect(() => jugesSimules({ ...reference, repartition: { ...reference.repartition, ordinaire: { inconnu: 1 } } }, temporaire())).toThrow(JugeSimuleMalRegle);
    expect(() => jugesSimules({ ...reference, repartition: { ...reference.repartition, refus_api: { accord: 0 } } }, temporaire())).toThrow(JugeSimuleMalRegle);
    const biaise = { ...reference, juges: reference.juges.map((j) => ({ ...j, biais: { candidats: ["demo-beta"], taux: 1.5 } })) };
    expect(() => jugesSimules(biaise, temporaire())).toThrow(JugeSimuleMalRegle);
  });
});

describe("le fournisseur d'existences simulé", () => {
  it("rend les verdicts de sa table, rien pour un lien inconnu", () => {
    const fournisseur = fournisseurSimule(parametresDeReference().existences, temporaire());
    expect(fournisseur.existencesDe("r", [LIEN, "https://inconnu.invalid/"])).toEqual([expect.objectContaining({ url_citee: LIEN, verdict_existence: "existe" })]);
    expect(fournisseur.existencesDe("r", ["https://inconnu.invalid/"])).toEqual([]);
  });

  it("refuse une table où un lien a deux verdicts, ou un verdict hors du schéma", () => {
    const [existence] = parametresDeReference().existences;
    if (existence === undefined) throw new Error("table de référence vide");
    expect(() => fournisseurSimule([existence, existence], temporaire())).toThrow(TableExistencesInvalide);
    expect(() => fournisseurSimule([{ ...existence, verdict_existence: "peut-etre" as never }], temporaire())).toThrow(/non conforme/);
  });
});

describe("7. garde-fou : jamais sous runs/", () => {
  const sousRuns = join(RUNS_DU_DEPOT, "2026-12-01");

  it("le juge simulé et le fournisseur simulé refusent un répertoire de run sous runs/", () => {
    expect(() => jugesSimules(parametresDeReference().juge_simule, sousRuns)).toThrow(SimuleSousRuns);
    expect(() => fournisseurSimule(parametresDeReference().existences, sousRuns)).toThrow(SimuleSousRuns);
    expect(() => jugesSimules(parametresDeReference().juge_simule, RUNS_DU_DEPOT)).toThrow(SimuleSousRuns);
  });

  it("un lien symbolique qui mène sous runs/ est refusé comme le chemin direct", () => {
    const lien = join(temporaire(), "raccourci");
    symlinkSync(RUNS_DU_DEPOT, lien);
    expect(estSousRuns(join(lien, "2026-12-01"))).toBe(true);
    expect(estSousRuns(temporaire())).toBe(false);
  });

  it("la préparation refuse une sortie sous runs/ avant toute écriture", async () => {
    const sortie = join(RUNS_DU_DEPOT, "notation-dry-refusee");
    await expect(preparerNotationSimulee({ sortie, fixtures_interrogation: FIXTURES_INTERROGATION, fixtures_notation: FIXTURES_NOTATION })).rejects.toBeInstanceOf(SimuleSousRuns);
    expect(existsSync(sortie)).toBe(false);
  });
});
