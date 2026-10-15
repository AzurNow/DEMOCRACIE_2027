/**
 * Relecture des formulations sur disque (décisions D39 et D42) : `data/formulations/` par son seul
 * écrivain, le journal des refus en ajout seul, la lecture de `staging/formulations/` (par `pipeline/reformulation/staging.ts`). Tout se passe
 * dans un répertoire temporaire : aucun fichier réel de `data/` n'est touché.
 */

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErreurSchema, valider } from "../outils/schemas/valider.ts";
import type { Tache } from "../pipeline/reformulation/entrees.ts";
import {
  formulationsValideesDe,
  refusDe,
  type FormulationsValidees,
  type PropositionAcceptee,
} from "../pipeline/reformulation/relecture.ts";
import { lirePropositions, StagingFormulationsIllisible, type PropositionFormulation } from "../pipeline/reformulation/staging.ts";
import { FichierModifieDepuisLecture } from "../validation/io/data-items.ts";
import {
  cheminFormulations,
  FormulationsCreeesEntreTemps,
  FormulationsDejaPromues,
  FormulationValideeIllisible,
  lireFormulationsData,
  lireFormulationsQuestion,
  promouvoirFormulations,
} from "../validation/io/data-formulations.ts";
import { ajouterRefusFormulation, JournalRefusIllisible, lireRefusFormulations } from "../validation/io/refus-formulations.ts";
import {
  identifiants,
  jeu,
  proposition,
  questionDe,
  RELECTEUR,
  surAutreTexte,
  toutCoche,
} from "./reformulation/fabriques-relecture.ts";

let racine: string;
let data: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "banc-formulations-"));
  data = join(racine, "data/formulations");
});

afterEach(() => {
  rmSync(racine, { recursive: true, force: true });
});

const FER = questionDe(jeu().taches, "Q-FER");

function promue(tache: Tache, cle: string, options: object = {}): FormulationsValidees {
  const prop = proposition(tache, { cle, ...options }) as PropositionAcceptee;
  return formulationsValideesDe(tache, prop, toutCoche(), { ...RELECTEUR, commentaire: null }, identifiants(cle));
}

describe("cas limite 5 : promotion dans data/formulations/", () => {
  it("création : fichier nommé <question_id>.json, conforme au schéma, relu à l'identique", () => {
    const valeur = promue(FER, "creation");
    promouvoirFormulations(data, undefined, valeur);
    expect(readdirSync(data)).toEqual([`${FER.question.id}.json`]);
    const brut: unknown = JSON.parse(readFileSync(cheminFormulations(data, FER.question.id), "utf8"));
    expect(() => valider("formulations-validees", brut, "essai")).not.toThrow();
    expect(lireFormulationsData(data).get(FER.question.id)?.formulations).toEqual(valeur);
  });

  it("déjà promue sur la même empreinte ⇒ FormulationsDejaPromues, fichier inchangé", () => {
    promouvoirFormulations(data, undefined, promue(FER, "premiere"));
    const avant = readFileSync(cheminFormulations(data, FER.question.id));
    const lu = lireFormulationsData(data).get(FER.question.id);
    expect(() => promouvoirFormulations(data, lu, promue(FER, "seconde"))).toThrow(FormulationsDejaPromues);
    expect(readFileSync(cheminFormulations(data, FER.question.id)).equals(avant)).toBe(true);
  });

  it("promue sur une nouvelle empreinte ⇒ remplacement atomique, aucun temporaire laissé", () => {
    const ancienne = promue(surAutreTexte(FER, " (ancien)"), "ancienne");
    promouvoirFormulations(data, undefined, ancienne);
    const lu = lireFormulationsData(data).get(FER.question.id);
    const nouvelle = promue(FER, "nouvelle");
    promouvoirFormulations(data, lu, nouvelle);
    expect(readdirSync(data)).toEqual([`${FER.question.id}.json`]);
    expect(lireFormulationsData(data).get(FER.question.id)?.formulations).toEqual(nouvelle);
  });

  it("fichier modifié depuis sa lecture ⇒ FichierModifieDepuisLecture, rien n'est écrit", () => {
    promouvoirFormulations(data, undefined, promue(surAutreTexte(FER, " (ancien)"), "a"));
    const lu = lireFormulationsData(data).get(FER.question.id);
    const chemin = cheminFormulations(data, FER.question.id);
    writeFileSync(chemin, `${readFileSync(chemin, "utf8")} `, "utf8");
    const modifie = readFileSync(chemin);
    expect(() => promouvoirFormulations(data, lu, promue(FER, "b"))).toThrow(FichierModifieDepuisLecture);
    expect(readFileSync(chemin).equals(modifie)).toBe(true);
  });

  it("fichier apparu entre la lecture et la création ⇒ FormulationsCreeesEntreTemps", () => {
    promouvoirFormulations(data, undefined, promue(FER, "concurrent"));
    expect(() => promouvoirFormulations(data, undefined, promue(FER, "tardif"))).toThrow(FormulationsCreeesEntreTemps);
  });

  it("une valeur non conforme au schéma n'est jamais écrite (texte de moins de cinq caractères)", () => {
    const valeur = promue(FER, "court", { familier: "Oui?" });
    expect(() => promouvoirFormulations(data, undefined, valeur)).toThrow(ErreurSchema);
    expect(lireFormulationsData(data).size).toBe(0);
  });
});

describe("cas limite 12 : guillemets et apostrophes typographiques jusqu'à data/", () => {
  it("les textes relus sur disque sont ceux de la proposition, octet pour octet", () => {
    const familier = "T’as vu ? « Le jardin », c’est pour quand ?";
    const oriente = "On m’a dit qu’il était « pour » : c’est bien ça ?";
    promouvoirFormulations(data, undefined, promue(FER, "typo", { familier, oriente }));
    const textes = lireFormulationsData(data).get(FER.question.id)?.formulations.formulations.map((formulation) => formulation.texte);
    expect(textes).toEqual([FER.question.texte_neutre, familier, oriente]);
    const brut = readFileSync(cheminFormulations(data, FER.question.id), "utf8");
    expect(brut).toContain("« Le jardin »");
    expect(brut).toContain("T’as vu");
  });
});

describe("journal des refus, en ajout seul", () => {
  const chemin = (): string => join(racine, "validation/formulations/refus.jsonl");
  const prop = proposition(FER, { cle: "refusee" }) as PropositionAcceptee;
  const refus = (commentaire: string) =>
    refusDe(prop, { ...toutCoche(), sens_preserve: { neutre: true, familier: false, oriente: true } }, RELECTEUR, commentaire);

  it("cas limite 6 : un refus valide ajoute une ligne, les lignes précédentes restent intactes", () => {
    ajouterRefusFormulation(chemin(), refus("Premier refus."));
    const avant = readFileSync(chemin());
    ajouterRefusFormulation(chemin(), refus("Second refus, « guillemets » compris."));
    const apres = readFileSync(chemin());
    expect(apres.subarray(0, avant.length).equals(avant)).toBe(true);
    expect(lireRefusFormulations(chemin()).map((ligne) => ligne.commentaire)).toEqual([
      "Premier refus.",
      "Second refus, « guillemets » compris.",
    ]);
  });

  it("une ligne non conforme au schéma n'est jamais ajoutée", () => {
    ajouterRefusFormulation(chemin(), refus("Premier refus."));
    const avant = readFileSync(chemin());
    expect(() => ajouterRefusFormulation(chemin(), { ...refus("x"), commentaire: " " })).toThrow(ErreurSchema);
    expect(readFileSync(chemin()).equals(avant)).toBe(true);
  });

  it("cas limite 11 : une ligne illisible ⇒ JournalRefusIllisible, et aucun ajout derrière elle", () => {
    mkdirSync(join(racine, "validation/formulations"), { recursive: true });
    writeFileSync(chemin(), `${JSON.stringify(refus("Lisible."))}\n{"proposition_id": \n`, "utf8");
    expect(() => lireRefusFormulations(chemin())).toThrow(JournalRefusIllisible);
    expect(() => ajouterRefusFormulation(chemin(), refus("Après."))).toThrow(JournalRefusIllisible);
  });

  it("cas limite 11 : une dernière ligne non terminée (écriture interrompue) ⇒ JournalRefusIllisible", () => {
    mkdirSync(join(racine, "validation/formulations"), { recursive: true });
    writeFileSync(chemin(), JSON.stringify(refus("Sans saut de ligne.")), "utf8");
    expect(() => lireRefusFormulations(chemin())).toThrow(JournalRefusIllisible);
  });

  it("un journal absent est un journal sans refus", () => {
    expect(lireRefusFormulations(chemin())).toEqual([]);
  });
});

describe("data/formulations : un seul lecteur, validé contre le schéma", () => {
  it("lireFormulationsQuestion : absent ⇒ null ; présent ⇒ le fichier validé", () => {
    expect(lireFormulationsQuestion(data, FER.question.id)).toBeNull();
    const valeur = promue(FER, "lecture");
    promouvoirFormulations(data, undefined, valeur);
    expect(lireFormulationsQuestion(data, FER.question.id)?.formulations).toEqual(valeur);
  });

  it("JSON illisible, non conforme, ou nommé d'une autre question ⇒ FormulationValideeIllisible", () => {
    mkdirSync(data, { recursive: true });
    const chemin = cheminFormulations(data, FER.question.id);
    for (const contenu of ["{", "[]", JSON.stringify({ ...promue(FER, "x"), question_id: "q_ffffffffffffffffffffffffffffffff" })]) {
      writeFileSync(chemin, contenu, "utf8");
      expect(() => lireFormulationsQuestion(data, FER.question.id)).toThrow(FormulationValideeIllisible);
      expect(() => lireFormulationsData(data)).toThrow(FormulationValideeIllisible);
    }
  });

  it("Q1, option (a) : même texte neutre, autre position affirmée (item P corrigé) ⇒ remplacement, pas un refus", () => {
    promouvoirFormulations(data, undefined, promue(FER, "pour"));
    const lu = lireFormulationsData(data).get(FER.question.id);
    const corrige = questionDe(jeu("contre").taches, "Q-FER");
    const nouvelle = promue(corrige, "contre");
    expect(nouvelle.empreinte_texte_neutre).toBe(lu?.formulations.empreinte_texte_neutre);
    promouvoirFormulations(data, lu, nouvelle);
    expect(lireFormulationsData(data).get(FER.question.id)?.formulations.formulations[2]?.position_affirmee).toBe("contre");
  });
});

describe("lecture de staging/formulations/ (pipeline/reformulation/staging.ts, seul lecteur)", () => {
  const staging = (): string => join(racine, "staging/formulations");

  function poser(dossier: string, nom: string, valeur: PropositionFormulation): void {
    mkdirSync(join(staging(), dossier), { recursive: true });
    writeFileSync(join(staging(), dossier, nom), JSON.stringify(valeur), "utf8");
  }

  it("une empreinte qui n'est pas le sha256 du texte neutre ⇒ StagingFormulationsIllisible", () => {
    const prop = { ...proposition(FER, { cle: "empreinte" }), empreinte_texte_neutre: "a".repeat(64) };
    poser(FER.question.id, `${prop.id}.json`, prop);
    expect(() => lirePropositions(staging(), FER.question.id)).toThrow(StagingFormulationsIllisible);
  });

  it("les propositions de fabrique sont conformes au schéma", () => {
    for (const statut of ["acceptee", "rejetee", "echec_http"] as const) {
      expect(() => valider("proposition-formulation", proposition(FER, { cle: statut, statut }), statut)).not.toThrow();
    }
  });
});
