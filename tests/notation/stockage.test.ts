/**
 * Stockage de la notation (lot notation, PR C), cas limites 1 à 3 du brief : écriture unique
 * (règle 7), rien d'écrit pour un objet invalide, et chaque objet dans le dossier de son run et de
 * son contexte. Sur un répertoire temporaire, jamais sous `runs/`.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dispositionRunNote } from "../../analysis/lecture-run.ts";
import { ErreurSchema } from "../../outils/schemas/valider.ts";
import { DepotNotation, FichierDejaEcrit, ObjetHorsDeSonDossier } from "../../pipeline/notation/stockage.ts";
import { ulid } from "../analysis/fabriques.ts";
import { poserRunNote, RUN_ID, type RunFictif } from "./run-fictif.ts";
import { renvoiJuge } from "./fabriques.ts";
import { lireNotationsDuRun } from "../../analysis/lecture-run.ts";

let courant: RunFictif | null = null;

afterEach(() => {
  courant?.nettoyer();
  courant = null;
});

function runNote(): RunFictif {
  courant = poserRunNote();
  return courant;
}

function premier<T>(liste: readonly T[]): T {
  const [element] = liste;
  if (element === undefined) throw new Error("liste vide");
  return element;
}

function contenu(dossier: string): readonly string[] {
  return readdirSync(dossier).sort();
}

describe("D30 (2) : renvois de juge, volume/renvois/", () => {
  it("un renvoi s'écrit une fois, se relit avec les notations, et n'est jamais réécrit", () => {
    const run = runNote();
    const renvoi = renvoiJuge("juge-1", { run_id: RUN_ID });
    const depot = DepotNotation.ouvrir(run.repertoire_run);
    depot.ecrireRenvoi(renvoi);
    expect(lireNotationsDuRun(run.repertoire_run, RUN_ID).renvois).toEqual([renvoi]);
    expect(() => depot.ecrireRenvoi(renvoi)).toThrow(FichierDejaEcrit);
  });

  it("un renvoi hors schéma ou d'un autre run est refusé, rien n'est écrit", () => {
    const run = runNote();
    const depot = DepotNotation.ouvrir(run.repertoire_run);
    expect(() => depot.ecrireRenvoi({ ...renvoiJuge("juge-1", { run_id: RUN_ID }), gabarit: "Q-DIR" as never })).toThrow(ErreurSchema);
    expect(() => depot.ecrireRenvoi(renvoiJuge("juge-1"))).toThrow(ObjetHorsDeSonDossier);
    expect(contenu(dispositionRunNote(run.repertoire_run).renvois)).toEqual([]);
  });
});

describe("1. écriture d'un fichier existant", () => {
  it("une notation déjà écrite : refus, fichier intact octet pour octet", () => {
    const run = runNote();
    const notation = premier(run.notations);
    const chemin = join(dispositionRunNote(run.repertoire_run).notations, `${notation.id}.json`);
    const avant = readFileSync(chemin);
    const depot = DepotNotation.ouvrir(run.repertoire_run);
    expect(() => depot.ecrireNotation({ ...notation, categorie: "inexacte", motif_inexactitude: "autre", extrait_justificatif: { provenance: "reponse", texte: "Ce candidat", verifie_deterministe: true } })).toThrow(FichierDejaEcrit);
    expect(readFileSync(chemin).equals(avant)).toBe(true);
  });

  it("un verdict déjà écrit : refus, fichier intact", () => {
    const run = runNote();
    const verdict = premier(run.verdicts);
    const chemin = join(dispositionRunNote(run.repertoire_run).verdicts, `${verdict.id}.json`);
    const avant = readFileSync(chemin);
    expect(() => DepotNotation.ouvrir(run.repertoire_run).ecrireVerdict(verdict)).toThrow(ObjetHorsDeSonDossier);
    expect(readFileSync(chemin).equals(avant)).toBe(true);
  });

  it("un fichier occupé sous le nom d'un nouveau verdict, inconnu de l'index : l'ouverture exclusive refuse", () => {
    const run = runNote();
    const verdict = { ...premier(run.verdicts), id: ulid("es-verdict-occupe"), objet_note: { type: "reponse" as const, id: ulid("es-autre-objet") } };
    const chemin = join(dispositionRunNote(run.repertoire_run).verdicts, `${verdict.id}.json`);
    const depot = DepotNotation.ouvrir(run.repertoire_run);
    writeFileSync(chemin, "occupé");
    expect(() => depot.ecrireVerdict(verdict)).toThrow(FichierDejaEcrit);
    expect(readFileSync(chemin, "utf8")).toBe("occupé");
  });

  it("une réponse contrefactuelle déjà écrite : refus, fichier intact", () => {
    const run = runNote();
    const chemin = join(dispositionRunNote(run.repertoire_run).reponses_contrefactuelles, `${run.contrefactuelle.id}.json`);
    const avant = readFileSync(chemin);
    expect(() => DepotNotation.ouvrir(run.repertoire_run).ecrireReponseContrefactuelle(run.contrefactuelle)).toThrow(ObjetHorsDeSonDossier);
    expect(readFileSync(chemin).equals(avant)).toBe(true);
  });

  it("un second verdict pour le même objet, sous un autre identifiant : refusé", () => {
    const run = runNote();
    const verdict = premier(run.verdicts);
    const depot = DepotNotation.ouvrir(run.repertoire_run);
    expect(() => depot.ecrireVerdict({ ...verdict, id: ulid("es-verdict-double") })).toThrow(ObjetHorsDeSonDossier);
    expect(existsSync(join(dispositionRunNote(run.repertoire_run).verdicts, `${ulid("es-verdict-double")}.json`))).toBe(false);
  });

  it("une seconde réponse contrefactuelle pour la même réponse d'origine : refusée", () => {
    const run = runNote();
    const depot = DepotNotation.ouvrir(run.repertoire_run);
    expect(() => depot.ecrireReponseContrefactuelle({ ...run.contrefactuelle, id: ulid("es-contrefactuelle-2") })).toThrow(ObjetHorsDeSonDossier);
  });
});

describe("2. objet invalide : rien n'est écrit", () => {
  it("notation, verdict et réponse contrefactuelle non conformes à leur schéma", () => {
    const run = runNote();
    const disposition = dispositionRunNote(run.repertoire_run);
    const avant = [contenu(disposition.notations), contenu(disposition.verdicts), contenu(disposition.reponses_contrefactuelles)];
    const depot = DepotNotation.ouvrir(run.repertoire_run);
    const notation = { ...premier(run.notations), id: ulid("es-notation-invalide"), categorie: "indeterminee" as const };
    const { notations_sources: _s, ...verdictSansSources } = { ...premier(run.verdicts), id: ulid("es-verdict-invalide"), objet_note: { type: "reponse" as const, id: ulid("es-objet-x") } };
    const { permutation: _p, ...sansPermutation } = { ...run.contrefactuelle, id: ulid("es-contrefactuelle-invalide"), derive_de_reponse_id: ulid("es-origine-y") };
    expect(() => depot.ecrireNotation(notation)).toThrow(ErreurSchema);
    expect(() => depot.ecrireVerdict(verdictSansSources as unknown as Parameters<DepotNotation["ecrireVerdict"]>[0])).toThrow(ErreurSchema);
    expect(() => depot.ecrireReponseContrefactuelle(sansPermutation as unknown as Parameters<DepotNotation["ecrireReponseContrefactuelle"]>[0])).toThrow(ErreurSchema);
    expect([contenu(disposition.notations), contenu(disposition.verdicts), contenu(disposition.reponses_contrefactuelles)]).toEqual(avant);
  });
});

describe("3. chaque objet dans le dossier de son run et de son contexte", () => {
  it("une notation d'un autre run : refusée, rien n'est écrit", () => {
    const run = runNote();
    const notation = { ...premier(run.notations), id: ulid("es-notation-autre-run"), run_id: ulid("es-autre-run") };
    expect(() => DepotNotation.ouvrir(run.repertoire_run).ecrireNotation(notation)).toThrow(ObjetHorsDeSonDossier);
    expect(existsSync(join(dispositionRunNote(run.repertoire_run).notations, `${notation.id}.json`))).toBe(false);
  });

  it("une réponse de contexte run dans le dossier contrefactuel : refusée", () => {
    const run = runNote();
    const deContexteRun = { ...premier(run.reponses), id: ulid("es-contexte-run") };
    expect(() => DepotNotation.ouvrir(run.repertoire_run).ecrireReponseContrefactuelle(deContexteRun)).toThrow(ObjetHorsDeSonDossier);
    expect(existsSync(join(dispositionRunNote(run.repertoire_run).reponses_contrefactuelles, `${deContexteRun.id}.json`))).toBe(false);
  });

  it("un verdict d'un objet contrefactuel : refusé", () => {
    const run = runNote();
    const verdict = {
      ...premier(run.verdicts),
      id: ulid("es-verdict-contrefactuel"),
      contexte: "contrefactuel_candidat" as const,
      objet_note: { type: "reponse" as const, id: run.contrefactuelle.id },
    };
    expect(() => DepotNotation.ouvrir(run.repertoire_run).ecrireVerdict(verdict)).toThrow(ObjetHorsDeSonDossier);
    expect(existsSync(join(dispositionRunNote(run.repertoire_run).verdicts, `${verdict.id}.json`))).toBe(false);
  });

  it("un verdict d'un autre run : refusé", () => {
    const run = runNote();
    const verdict = { ...premier(run.verdicts), id: ulid("es-verdict-autre-run"), run_id: ulid("es-autre-run"), objet_note: { type: "reponse" as const, id: ulid("es-objet-w") } };
    expect(() => DepotNotation.ouvrir(run.repertoire_run).ecrireVerdict(verdict)).toThrow(ObjetHorsDeSonDossier);
  });
});
