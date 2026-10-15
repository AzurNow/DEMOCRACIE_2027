/**
 * Reprise : lecture isolée des deux fichiers de la PR C (`data/formulations/<id>.json` et
 * `validation/formulations/refus.jsonl`) et décision par question. Fichier absent ⇒ vide ; fichier
 * présent mais illisible ou non conforme ⇒ erreur nommée.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deciderReprise,
  empreinteValidee,
  FormulationValideeIllisible,
  JournalRefusIllisible,
  lireRefus,
} from "../../pipeline/reformulation/reprise.ts";
import type { EtatQuestion } from "../../pipeline/reformulation/reprise.ts";
import type { PropositionFormulation } from "../../pipeline/reformulation/staging.ts";

const QUESTION = "q_0123456789abcdef0123456789abcdef";
const EMPREINTE = "a".repeat(64);
const AUTRE = "b".repeat(64);
const ID_1 = "01JA0000000000000000000001";
const ID_2 = "01JA0000000000000000000002";

const repertoires: string[] = [];
function repertoire(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-reprise-"));
  repertoires.push(chemin);
  return chemin;
}
afterEach(() => {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function proposition(id: string, statut: "acceptee" | "rejetee" | "echec_http", empreinte = EMPREINTE): PropositionFormulation {
  const issues = {
    acceptee: { statut: "acceptee", familier: { texte: "f" }, oriente: { texte: "o" } },
    rejetee: { statut: "rejetee", motif: "json_invalide", detail: "d" },
    echec_http: { statut: "echec_http" },
  } as const;
  return { id, empreinte_texte_neutre: empreinte, issue: issues[statut] } as unknown as PropositionFormulation;
}

function etat(partiel: Partial<EtatQuestion>): EtatQuestion {
  return { empreinte_courante: EMPREINTE, empreinte_validee: null, propositions: [], refus: new Set(), ...partiel };
}

describe("data/formulations/<question_id>.json", () => {
  it("absent ⇒ null", () => {
    expect(empreinteValidee(repertoire(), QUESTION)).toBeNull();
  });

  it("présent ⇒ son empreinte du texte neutre", () => {
    const dossier = repertoire();
    writeFileSync(join(dossier, `${QUESTION}.json`), JSON.stringify({ question_id: QUESTION, empreinte_texte_neutre: EMPREINTE, autre: 1 }));
    expect(empreinteValidee(dossier, QUESTION)).toBe(EMPREINTE);
  });

  it.each([
    ["JSON illisible", "{"],
    ["un tableau", "[]"],
    ["question_id d'une autre question", JSON.stringify({ question_id: "q_autre", empreinte_texte_neutre: EMPREINTE })],
    ["empreinte absente", JSON.stringify({ question_id: QUESTION })],
    ["empreinte qui n'est pas un sha256", JSON.stringify({ question_id: QUESTION, empreinte_texte_neutre: "ABC" })],
  ])("%s ⇒ FormulationValideeIllisible", (_cas, contenu) => {
    const dossier = repertoire();
    writeFileSync(join(dossier, `${QUESTION}.json`), contenu);
    expect(() => empreinteValidee(dossier, QUESTION)).toThrow(FormulationValideeIllisible);
  });
});

describe("validation/formulations/refus.jsonl", () => {
  it("absent ⇒ aucun refus", () => {
    expect(lireRefus(join(repertoire(), "refus.jsonl"))).toEqual(new Set());
  });

  it("une ligne par refus, fin de fichier permise", () => {
    const chemin = join(repertoire(), "refus.jsonl");
    writeFileSync(chemin, `${JSON.stringify({ proposition_id: ID_1, motif: "sens" })}\n${JSON.stringify({ proposition_id: ID_2 })}\n`);
    expect(lireRefus(chemin)).toEqual(new Set([ID_1, ID_2]));
  });

  it("fichier vide ⇒ aucun refus", () => {
    const chemin = join(repertoire(), "refus.jsonl");
    writeFileSync(chemin, "");
    expect(lireRefus(chemin)).toEqual(new Set());
  });

  it("cas limite 17 : une ligne illisible ⇒ JournalRefusIllisible qui nomme la ligne", () => {
    const chemin = join(repertoire(), "refus.jsonl");
    writeFileSync(chemin, `${JSON.stringify({ proposition_id: ID_1 })}\n{pas du json\n`);
    expect(() => lireRefus(chemin)).toThrow(JournalRefusIllisible);
    expect(() => lireRefus(chemin)).toThrow(/ligne 2/u);
  });

  it("ligne vide au milieu ⇒ JournalRefusIllisible", () => {
    const chemin = join(repertoire(), "refus.jsonl");
    writeFileSync(chemin, `${JSON.stringify({ proposition_id: ID_1 })}\n\n${JSON.stringify({ proposition_id: ID_2 })}\n`);
    expect(() => lireRefus(chemin)).toThrow(/ligne 2/u);
  });

  it("proposition_id absent ou qui n'est pas un ULID ⇒ JournalRefusIllisible", () => {
    const chemin = join(repertoire(), "refus.jsonl");
    writeFileSync(chemin, `${JSON.stringify({ id: ID_1 })}\n`);
    expect(() => lireRefus(chemin)).toThrow(/proposition_id/u);
    writeFileSync(chemin, `${JSON.stringify({ proposition_id: "abc" })}\n`);
    expect(() => lireRefus(chemin)).toThrow(/proposition_id/u);
  });
});

describe("décision de reprise", () => {
  it("cas limite 7 : acceptée sur le même texte neutre ⇒ déjà acceptée, pas d'appel", () => {
    expect(deciderReprise(etat({ propositions: [proposition(ID_1, "acceptee")] }))).toBe("deja_acceptee");
  });

  it("cas limite 7 : acceptée sur un autre texte neutre ⇒ à appeler", () => {
    expect(deciderReprise(etat({ propositions: [proposition(ID_1, "acceptee", AUTRE)] }))).toBe("a_appeler");
  });

  it("cas limite 7 : seulement des rejets et des échecs ⇒ à appeler", () => {
    expect(deciderReprise(etat({ propositions: [proposition(ID_1, "rejetee"), proposition(ID_2, "echec_http")] }))).toBe("a_appeler");
  });

  it("aucune proposition ⇒ à appeler", () => {
    expect(deciderReprise(etat({}))).toBe("a_appeler");
  });

  it("cas limite 15 : validée sur la même empreinte ⇒ déjà validée ; sur une autre ⇒ à appeler", () => {
    expect(deciderReprise(etat({ empreinte_validee: EMPREINTE }))).toBe("deja_validee");
    expect(deciderReprise(etat({ empreinte_validee: AUTRE }))).toBe("a_appeler");
  });

  it("cas limite 16 : acceptée puis refusée à la relecture ⇒ à appeler", () => {
    expect(deciderReprise(etat({ propositions: [proposition(ID_1, "acceptee")], refus: new Set([ID_1]) }))).toBe("a_appeler");
  });

  it("une acceptée refusée et une autre acceptée non refusée ⇒ déjà acceptée", () => {
    const propositions = [proposition(ID_1, "acceptee"), proposition(ID_2, "acceptee")];
    expect(deciderReprise(etat({ propositions, refus: new Set([ID_1]) }))).toBe("deja_acceptee");
  });
});
