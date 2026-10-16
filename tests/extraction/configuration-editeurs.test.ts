/**
 * `config/extraction.json` : les deux extracteurs, dans l'ordre, et leurs réglages (décision D52
 * (1) et (3)). Cas limites 7 et 10 du brief de la PR 2 : aucune valeur par défaut, chaque refus
 * nomme son chemin, l'adaptateur se choisit par une table `editeur → fabrique`.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ModelesIdentiques } from "../../pipeline/extraction/configuration.ts";
import {
  ConfigurationEditeursRefusee,
  construireAdaptateurs,
  FABRIQUES,
  lireConfigurationEditeurs,
  validerConfigurationEditeurs,
} from "../../pipeline/extraction/configuration-editeurs.ts";
import { ENDPOINT_ANTHROPIC } from "../../pipeline/extraction/editeur-anthropic.ts";
import { VERSION_PROMPT_EXTRACTION } from "../../pipeline/extraction/prompt.ts";
import { ENDPOINT_MISTRAL } from "../../pipeline/reformulation/editeur-mistral.ts";

const FICHIER_LIVRE = new URL("../../config/extraction.json", import.meta.url);

const ANTHROPIC = { editeur: "anthropic", modele: "modele-anthropic-test", max_tokens: 8000, effort: "high", delai_abandon_ms: 120_000 };
const MISTRAL = {
  editeur: "mistral",
  modele: "modele-mistral-test",
  temperature: 0,
  max_tokens: 8000,
  random_seed: 7,
  delai_abandon_ms: 120_000,
};

function texte(extracteurs: readonly unknown[], enPlus: Record<string, unknown> = {}): string {
  return JSON.stringify({ $commentaire: "test", extracteurs, ...enPlus });
}

function motifs(texteConfiguration: string): readonly string[] {
  try {
    validerConfigurationEditeurs(texteConfiguration, "test.json");
  } catch (erreur) {
    if (erreur instanceof ConfigurationEditeursRefusee) return erreur.motifs;
    throw erreur;
  }
  throw new Error("Configuration acceptée alors qu'un refus était attendu.");
}

describe("cas limite 7 : fichier livré", () => {
  it("tout à null ⇒ refusé, chaque réglage nommé par son chemin", () => {
    const lus = motifs(readFileSync(FICHIER_LIVRE, "utf8"));
    const chemins = lus.map((motif) => motif.split(" : ")[0]);
    expect(chemins).toEqual([
      "extracteurs[0].modele",
      "extracteurs[0].max_tokens",
      "extracteurs[0].effort",
      "extracteurs[0].delai_abandon_ms",
      "extracteurs[1].modele",
      "extracteurs[1].temperature",
      "extracteurs[1].max_tokens",
      "extracteurs[1].random_seed",
      "extracteurs[1].delai_abandon_ms",
    ]);
    for (const motif of lus) expect(motif).toMatch(/null, à remplir par l'auteur/u);
  });

  it("l'ordre livré est Anthropic puis Mistral (D52 (3) : le premier fournit les champs d'une paire)", () => {
    const livre = JSON.parse(readFileSync(FICHIER_LIVRE, "utf8")) as { extracteurs: { editeur: string }[] };
    expect(livre.extracteurs.map((extracteur) => extracteur.editeur)).toEqual(["anthropic", "mistral"]);
  });

  it("lireConfigurationEditeurs refuse le fichier livré, en nommant le fichier", () => {
    expect(() => lireConfigurationEditeurs(FICHIER_LIVRE.pathname)).toThrow(/extraction\.json/u);
  });
});

describe("cas limite 7 : refus nommés", () => {
  it("clé inconnue dans un extracteur ⇒ refus nommé", () => {
    expect(motifs(texte([{ ...ANTHROPIC, temperature: 0 }, MISTRAL]))).toEqual([
      expect.stringMatching(/^extracteurs\[0\]\.temperature : clé inconnue/u),
    ]);
  });

  it("clé inconnue à la racine ⇒ refus nommé", () => {
    expect(motifs(texte([ANTHROPIC, MISTRAL], { version_prompt: "x" }))).toEqual([expect.stringMatching(/^version_prompt : clé inconnue/u)]);
  });

  it("clé répétée ⇒ refus nommé", () => {
    const repetee = texte([ANTHROPIC, MISTRAL]).replace('"temperature":0', '"temperature":0,"temperature":1');
    expect(motifs(repetee)).toEqual([expect.stringMatching(/^temperature : clé répétée/u)]);
  });

  it("editeur inconnu ⇒ refus nommé, ses réglages ne sont pas devinés", () => {
    expect(motifs(texte([ANTHROPIC, { ...MISTRAL, editeur: "openai" }]))).toEqual([
      expect.stringMatching(/^extracteurs\[1\]\.editeur : "openai" refusée \(attendu : anthropic ou mistral\)/u),
    ]);
  });

  it("editeur absent ⇒ refus nommé", () => {
    const { editeur: _editeur, ...sansEditeur } = MISTRAL;
    expect(motifs(texte([ANTHROPIC, sansEditeur]))).toEqual([expect.stringMatching(/^extracteurs\[1\]\.editeur : absente/u)]);
  });

  it("effort hors énumération ⇒ refus nommé", () => {
    expect(motifs(texte([{ ...ANTHROPIC, effort: "extreme" }, MISTRAL]))).toEqual([
      expect.stringMatching(/^extracteurs\[0\]\.effort : "extreme" refusée \(attendu : low, medium, high, xhigh ou max\)/u),
    ]);
  });

  it("réglage de forme fausse ⇒ refus nommé par son chemin", () => {
    expect(motifs(texte([ANTHROPIC, { ...MISTRAL, temperature: -1, random_seed: 1.5 }]))).toEqual([
      expect.stringMatching(/^extracteurs\[1\]\.temperature : -1 refusée/u),
      expect.stringMatching(/^extracteurs\[1\]\.random_seed : 1\.5 refusée/u),
    ]);
  });

  it("réglage absent ⇒ refus nommé", () => {
    const { max_tokens: _max, ...sansMax } = ANTHROPIC;
    expect(motifs(texte([sansMax, MISTRAL]))).toEqual([expect.stringMatching(/^extracteurs\[0\]\.max_tokens : absente/u)]);
  });

  it("deux modele identiques ⇒ refus du cœur (exigerConfiguration)", () => {
    const valider = () => validerConfigurationEditeurs(texte([ANTHROPIC, { ...MISTRAL, modele: ANTHROPIC.modele }]), "test.json");
    expect(valider).toThrow(ModelesIdentiques);
  });

  it("un seul extracteur ⇒ refus nommé", () => {
    expect(motifs(texte([ANTHROPIC]))).toEqual([expect.stringMatching(/^extracteurs : 1 entrée\(s\), exactement 2 attendues/u)]);
  });

  it("trois extracteurs ⇒ refus nommé", () => {
    const troisieme = { ...MISTRAL, modele: "modele-mistral-test-bis" };
    expect(motifs(texte([ANTHROPIC, MISTRAL, troisieme]))).toEqual([
      expect.stringMatching(/^extracteurs : 3 entrée\(s\), exactement 2 attendues/u),
    ]);
  });

  it("extracteurs absent ou non liste ⇒ refus nommé", () => {
    expect(motifs(JSON.stringify({ $commentaire: "x" }))).toEqual([expect.stringMatching(/^extracteurs : absente/u)]);
    expect(motifs(JSON.stringify({ extracteurs: {} }))).toEqual([expect.stringMatching(/^extracteurs : une liste est attendue/u)]);
  });

  it("un extracteur qui n'est pas un objet ⇒ refus nommé", () => {
    expect(motifs(texte([ANTHROPIC, "mistral"]))).toEqual([expect.stringMatching(/^extracteurs\[1\] : un objet est attendu/u)]);
  });

  it("$commentaire non textuel ⇒ refus nommé", () => {
    expect(motifs(texte([ANTHROPIC, MISTRAL], { $commentaire: 3 }))).toEqual([expect.stringMatching(/^\$commentaire : un texte est attendu/u)]);
  });

  it("JSON illisible ou racine non objet ⇒ refus", () => {
    expect(motifs("{")).toEqual([expect.stringMatching(/^JSON illisible/u)]);
    expect(motifs("[]")).toEqual(["un objet JSON est attendu"]);
  });
});

describe("configuration complète", () => {
  it("ordre conservé, version du prompt jointe, réglages rendus tels quels", () => {
    const configuration = validerConfigurationEditeurs(texte([ANTHROPIC, MISTRAL]), "test.json");
    expect(configuration.extraction).toEqual({
      modeles: [ANTHROPIC.modele, MISTRAL.modele],
      version_prompt: VERSION_PROMPT_EXTRACTION,
    });
    const { editeur: _a, ...reglagesAnthropic } = ANTHROPIC;
    const { editeur: _m, ...reglagesMistral } = MISTRAL;
    expect(configuration.extracteurs).toEqual([
      { editeur: "anthropic", reglages: reglagesAnthropic },
      { editeur: "mistral", reglages: reglagesMistral },
    ]);
  });

  it("ordre inverse dans le fichier ⇒ ordre inverse dans la ConfigurationExtraction", () => {
    const configuration = validerConfigurationEditeurs(texte([MISTRAL, ANTHROPIC]), "test.json");
    expect(configuration.extraction.modeles).toEqual([MISTRAL.modele, ANTHROPIC.modele]);
  });

  it("deux extracteurs du même éditeur, modèles distincts ⇒ acceptés : la famille reste affaire de configuration", () => {
    const configuration = validerConfigurationEditeurs(texte([MISTRAL, { ...MISTRAL, modele: "modele-mistral-test-bis" }]), "t.json");
    expect(configuration.extraction.modeles).toEqual([MISTRAL.modele, "modele-mistral-test-bis"]);
  });
});

describe("cas limite 10 : assemblage par la table editeur → fabrique", () => {
  const cles = { anthropic: "cle-anthropic-factice", mistral: "cle-mistral-factice" } as const;
  const cleDe = (editeur: keyof typeof cles): string => cles[editeur];

  it("la table couvre exactement les deux éditeurs", () => {
    expect(Object.keys(FABRIQUES).sort()).toEqual(["anthropic", "mistral"]);
  });

  it("chaque entrée de la configuration donne l'adaptateur de son éditeur, dans l'ordre du fichier", () => {
    const configuration = validerConfigurationEditeurs(texte([ANTHROPIC, MISTRAL]), "test.json");
    const adaptateurs = construireAdaptateurs(configuration, cleDe);
    expect(adaptateurs.map((adaptateur) => adaptateur.modele)).toEqual(configuration.extraction.modeles);
    const [premier, second] = adaptateurs;
    expect(premier.construireRequete("p").endpoint).toBe(ENDPOINT_ANTHROPIC);
    expect(premier.construireRequete("p").entetes["x-api-key"]).toBe(cles.anthropic);
    expect(second.construireRequete("p").endpoint).toBe(ENDPOINT_MISTRAL);
    expect(second.construireRequete("p").entetes["authorization"]).toBe(`Bearer ${cles.mistral}`);
  });

  it("ordre inverse ⇒ adaptateurs dans l'ordre inverse", () => {
    const configuration = validerConfigurationEditeurs(texte([MISTRAL, ANTHROPIC]), "test.json");
    const [premier, second] = construireAdaptateurs(configuration, cleDe);
    expect(premier.construireRequete("p").endpoint).toBe(ENDPOINT_MISTRAL);
    expect(second.construireRequete("p").endpoint).toBe(ENDPOINT_ANTHROPIC);
  });

  it("une clé vide ⇒ refus avant toute requête, sans la clé dans le message", () => {
    const configuration = validerConfigurationEditeurs(texte([ANTHROPIC, MISTRAL]), "test.json");
    const sansMistral = { ...cles, mistral: "" };
    const construire = () => construireAdaptateurs(configuration, (editeur) => sansMistral[editeur]);
    expect(construire).toThrow(/vide/u);
  });
});
