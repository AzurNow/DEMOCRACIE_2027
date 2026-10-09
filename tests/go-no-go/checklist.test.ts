/**
 * La checklist de l'annexe F (D24 (4)) : texte du protocole, cases calculées, cases déclarées, et
 * le contreseing de l'auteur.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { valider } from "../../outils/schemas/valider.ts";
import {
  CASES_ANNEXE_F,
  constatGraineDuTirage,
  constatNotationComplete,
  construireChecklist,
  partDuPipeline,
  type Checklist,
  type Constat,
} from "../../pipeline/go-no-go/checklist.ts";
import { ContreseingRefuse, contresigner, contresignerFichier, type Declaration } from "../../pipeline/go-no-go/contreseing.ts";
import { CODES_CRITERES, type Critere } from "../../pipeline/go-no-go/types.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { ulid } from "../analysis/fabriques.ts";

const RUN_ID = ulid("run-checklist");
const DATE = "2026-12-04T18:00:00+01:00";

function criteres(rouges: readonly string[] = []): Critere[] {
  return CODES_CRITERES.map((code) => ({ code, statut: rouges.includes(code) ? "rouge" : "vert", valeur: 0, seuil: 0 }));
}

const CONSTATS_FAITS: readonly Constat[] = [
  { nom: "graine_du_tirage_enregistree", fait: true, detail: "" },
  { nom: "notation_complete", fait: true, detail: "" },
];

const TOUT_DECLARE: readonly Declaration[] = [
  { rang: 1, etat: "faite" },
  { rang: 8, etat: "faite" },
  { rang: 9, etat: "faite" },
  { rang: 10, etat: "non_faite", motif: "Notification prévue après publication." },
];

describe("les dix cases de l'annexe F", () => {
  it("texte mot pour mot et ordre du protocole (docs/PROTOCOLE.md, annexe F)", () => {
    const protocole = readFileSync(join(RACINE_PROJET, "docs/PROTOCOLE.md"), "utf8");
    const annexe = protocole.slice(protocole.indexOf("**F. Checklist de run**"));
    const lignes = annexe
      .split("\n")
      .filter((ligne) => ligne.startsWith("- [ ] "))
      .slice(0, 10)
      .map((ligne) => ligne.slice("- [ ] ".length));
    expect(CASES_ANNEXE_F.map((c) => c.texte)).toEqual(lignes);
  });

  it("le pipeline écrit les cases calculées avec leur état, les déclarées sans état, sans contreseing ; conforme au schéma", () => {
    const checklist = construireChecklist(RUN_ID, criteres(), CONSTATS_FAITS);
    expect(checklist.contreseing).toBeUndefined();
    expect(checklist.cases.map((c) => [c.rang, c.nature, c.etat])).toEqual([
      [1, "declaree", undefined],
      [2, "calculee", "faite"],
      [3, "calculee", "faite"],
      [4, "calculee", "faite"],
      [5, "calculee", "faite"],
      [6, "calculee", "faite"],
      [7, "calculee", "faite"],
      [8, "declaree", undefined],
      [9, "declaree", undefined],
      [10, "declaree", undefined],
    ]);
    expect(() => valider("checklist", checklist, "test")).not.toThrow();
  });

  it("une case calculée dont un appui manque est non faite, avec un motif qui le nomme", () => {
    const constats = [constatGraineDuTirage({ valeur: 1 }, undefined), constatNotationComplete([ulid("a"), ulid("b")], new Set([ulid("a")]))];
    const checklist = construireChecklist(RUN_ID, criteres(["kappa_juges_humains", "analyses_preenregistrees_executees"]), constats);
    const parRang = new Map(checklist.cases.map((c) => [c.rang, c]));
    expect(parRang.get(3)).toMatchObject({ etat: "non_faite", motif: "tirage.json absent du répertoire du run." });
    expect(parRang.get(5)).toMatchObject({ etat: "non_faite", motif: "1 réponse(s) obtenue(s) sans verdict." });
    expect(parRang.get(6)).toMatchObject({ etat: "non_faite", motif: "critère kappa_juges_humains au rouge." });
    expect(parRang.get(7)).toMatchObject({ etat: "non_faite" });
    expect(parRang.get(2)).toMatchObject({ etat: "faite" });
    expect(() => valider("checklist", checklist, "test")).not.toThrow();
  });

  it("graine du tirage : identique, faite ; différente, non faite", () => {
    expect(constatGraineDuTirage({ valeur: 1, algorithme: "a" }, { algorithme: "a", valeur: 1 }).fait).toBe(true);
    expect(constatGraineDuTirage({ valeur: 1 }, { valeur: 2 })).toMatchObject({ fait: false });
  });
});

describe("contreseing de l'auteur", () => {
  const pipeline = (): Checklist => construireChecklist(RUN_ID, criteres(["analyses_preenregistrees_executees"]), CONSTATS_FAITS);

  it("ajoute nom et date, l'état des cases déclarées, et ne touche pas aux cases calculées", () => {
    const signee = contresigner(pipeline(), { nom: "Auteur Fictif", declarations: TOUT_DECLARE, date: DATE });
    expect(signee.contreseing).toEqual({ nom: "Auteur Fictif", date: DATE });
    expect(signee.cases.find((c) => c.rang === 10)).toMatchObject({ etat: "non_faite", motif: "Notification prévue après publication." });
    expect(signee.cases.find((c) => c.rang === 7)).toEqual(pipeline().cases.find((c) => c.rang === 7));
    expect(partDuPipeline(signee)).toEqual(pipeline());
    expect(() => valider("checklist", signee, "test")).not.toThrow();
  });

  it("une case déclarée sans état : refus", () => {
    expect(() => contresigner(pipeline(), { nom: "Auteur", declarations: TOUT_DECLARE.filter((d) => d.rang !== 9), date: DATE })).toThrow(/case déclarée 9/);
  });

  it("une case non faite sans motif : refus", () => {
    const declarations = TOUT_DECLARE.map((d) => (d.rang === 10 ? { rang: 10, etat: "non_faite" as const } : d));
    expect(() => contresigner(pipeline(), { nom: "Auteur", declarations, date: DATE })).toThrow(/non faite sans motif/);
  });

  it("une case non faite au motif blanc : refus", () => {
    const declarations = TOUT_DECLARE.map((d) => (d.rang === 10 ? { rang: 10, etat: "non_faite" as const, motif: "   " } : d));
    expect(() => contresigner(pipeline(), { nom: "Auteur", declarations, date: DATE })).toThrow(ContreseingRefuse);
  });

  it("une case calculée ne se déclare pas : refus (une case non faite reste non faite)", () => {
    expect(() => contresigner(pipeline(), { nom: "Auteur", declarations: [...TOUT_DECLARE, { rang: 7, etat: "faite" }], date: DATE })).toThrow(/calculée par le pipeline/);
  });

  it("une case déclarée deux fois, un rang inconnu, un nom vide : refus", () => {
    expect(() => contresigner(pipeline(), { nom: "Auteur", declarations: [...TOUT_DECLARE, { rang: 1, etat: "faite" }], date: DATE })).toThrow(/2 fois/);
    expect(() => contresigner(pipeline(), { nom: "Auteur", declarations: [...TOUT_DECLARE, { rang: 11, etat: "faite" }], date: DATE })).toThrow(/n'existe pas/);
    expect(() => contresigner(pipeline(), { nom: " ", declarations: TOUT_DECLARE, date: DATE })).toThrow(/nom/);
  });

  it("double contreseing : refus", () => {
    const signee = contresigner(pipeline(), { nom: "Auteur", declarations: TOUT_DECLARE, date: DATE });
    expect(() => contresigner(signee, { nom: "Autre", declarations: TOUT_DECLARE, date: DATE })).toThrow(/déjà contresignée/);
  });
});

describe("contreseing sur fichier", () => {
  const dossiers: string[] = [];
  afterEach(() => {
    for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function runAvecChecklist(): string {
    const dossier = mkdtempSync(join(tmpdir(), "banc-contreseing-"));
    dossiers.push(dossier);
    writeFileSync(join(dossier, "checklist.json"), `${JSON.stringify(construireChecklist(RUN_ID, criteres(), CONSTATS_FAITS), null, 2)}\n`);
    writeFileSync(join(dossier, "run.json"), '{"octets": "qui ne doivent pas bouger"}\n');
    return dossier;
  }

  it("écrit checklist.json contresigné, run.json inchangé octet pour octet", () => {
    const dossier = runAvecChecklist();
    const avant = readFileSync(join(dossier, "run.json"));
    contresignerFichier(dossier, { nom: "Auteur Fictif", declarations: TOUT_DECLARE, date: DATE });
    expect(readFileSync(join(dossier, "run.json")).equals(avant)).toBe(true);
    const relue = valider<Checklist>("checklist", JSON.parse(readFileSync(join(dossier, "checklist.json"), "utf8")), "relue");
    expect(relue.contreseing).toEqual({ nom: "Auteur Fictif", date: DATE });
  });

  it("refusé : rien n'est écrit", () => {
    const dossier = runAvecChecklist();
    const avant = readFileSync(join(dossier, "checklist.json"));
    expect(() => contresignerFichier(dossier, { nom: "Auteur", declarations: [], date: DATE })).toThrow(ContreseingRefuse);
    expect(readFileSync(join(dossier, "checklist.json")).equals(avant)).toBe(true);
  });

  it("re-signer une checklist déjà contresignée : refus, fichier inchangé", () => {
    const dossier = runAvecChecklist();
    contresignerFichier(dossier, { nom: "Auteur", declarations: TOUT_DECLARE, date: DATE });
    const avant = readFileSync(join(dossier, "checklist.json"));
    expect(() => contresignerFichier(dossier, { nom: "Auteur", declarations: TOUT_DECLARE, date: DATE })).toThrow(/déjà contresignée/);
    expect(readFileSync(join(dossier, "checklist.json")).equals(avant)).toBe(true);
  });
});
