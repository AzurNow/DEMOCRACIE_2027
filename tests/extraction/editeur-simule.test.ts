/**
 * Éditeurs simulés de l'extraction : deux enveloppes (Anthropic, Mistral), lues par les mêmes
 * lecteurs que les adaptateurs réels, et une sortie conforme qui passe le cœur de bout en bout.
 * Cas limite 9 du brief de la PR 2. Aucun réseau, aucun contenu réel.
 */

import { describe, expect, it } from "vitest";
import { appelerExtracteur, type AppelExtracteur, type NomEditeur } from "../../pipeline/extraction/editeur.ts";
import { texteDesMessages } from "../../pipeline/extraction/editeur-anthropic.ts";
import { texteDuChatTermine } from "../../pipeline/extraction/editeur-mistral.ts";
import {
  choixParEmpreinte,
  editeurSimule,
  ISSUES_PAR_ENVELOPPE,
  MODELE_SIMULE_ANTHROPIC,
  MODELE_SIMULE_MISTRAL,
  type IssueSimulee,
} from "../../pipeline/extraction/editeur-simule.ts";
import { extraireSource } from "../../pipeline/extraction/extraction.ts";
import { lireSortie } from "../../pipeline/extraction/lecture-sortie.ts";
import { chargerPromptExtraction, rendrePromptExtraction, VERSION_PROMPT_EXTRACTION, type VariablesExtraction } from "../../pipeline/extraction/prompt.ts";
import { CANDIDAT, entreeHtml, entreePdf, lisible, ports } from "./aides.ts";

const TEXTE_PROMPT = chargerPromptExtraction();
const TEXTE = "Nous ouvrirons les centres de santé le dimanche.\nUne seconde phrase du document de démonstration.";
const DEMANDE: VariablesExtraction = { candidat_id: CANDIDAT, type_document: "site_officiel", format: "html", texte_canonique: TEXTE };
const PROMPT = rendrePromptExtraction(TEXTE_PROMPT, DEMANDE);
const ENVELOPPES: readonly NomEditeur[] = ["anthropic", "mistral"];
const LECTEURS = { anthropic: texteDesMessages, mistral: texteDuChatTermine } as const;

async function appel(enveloppe: NomEditeur, issue: IssueSimulee, demande: VariablesExtraction = DEMANDE): Promise<AppelExtracteur> {
  const editeur = editeurSimule(enveloppe, TEXTE_PROMPT, [demande], () => issue);
  return appelerExtracteur(editeur, rendrePromptExtraction(TEXTE_PROMPT, demande), new AbortController().signal);
}

function texteLu(resultat: AppelExtracteur): string {
  if (!resultat.lecture.lisible) throw new Error(`Lecture attendue lisible : ${resultat.lecture.raison}`);
  return resultat.lecture.texte;
}

function raisonLue(resultat: AppelExtracteur): string {
  if (resultat.lecture.lisible) throw new Error("Lecture attendue illisible.");
  return resultat.lecture.raison;
}

describe("identifiants simulés", () => {
  it("distincts et marqués simule/", () => {
    expect(MODELE_SIMULE_ANTHROPIC).not.toBe(MODELE_SIMULE_MISTRAL);
    expect(MODELE_SIMULE_ANTHROPIC.startsWith("simule/")).toBe(true);
    expect(MODELE_SIMULE_MISTRAL.startsWith("simule/")).toBe(true);
    expect(editeurSimule("anthropic", TEXTE_PROMPT, [DEMANDE], () => "conforme").adaptateur.modele).toBe(MODELE_SIMULE_ANTHROPIC);
    expect(editeurSimule("mistral", TEXTE_PROMPT, [DEMANDE], () => "conforme").adaptateur.modele).toBe(MODELE_SIMULE_MISTRAL);
  });

  it("le refus n'existe que dans l'enveloppe Anthropic", () => {
    expect(ISSUES_PAR_ENVELOPPE.anthropic).toContain("refus");
    expect(ISSUES_PAR_ENVELOPPE.mistral).not.toContain("refus");
  });
});

describe("cas limite 9 : chaque issue, lue par le lecteur réel de son enveloppe", () => {
  for (const enveloppe of ENVELOPPES) {
    describe(enveloppe, () => {
      it("le lecteur de l'adaptateur simulé est celui de l'adaptateur réel", () => {
        expect(editeurSimule(enveloppe, TEXTE_PROMPT, [DEMANDE], () => "conforme").adaptateur.texteDuModele).toBe(LECTEURS[enveloppe]);
      });

      it("conforme ⇒ lisible, sortie conforme au cœur, citations prises dans le texte reçu", async () => {
        const resultat = await appel(enveloppe, "conforme");
        expect(resultat.reponse.statut).toBe(200);
        const lecture = lireSortie(texteLu(resultat));
        if (!lecture.ok) throw new Error(lecture.detail);
        expect(lecture.sortie.items.length).toBeGreaterThan(0);
        for (const item of lecture.sortie.items) {
          expect(TEXTE).toContain(item.citation_verbatim);
          expect(item.candidat_id).toBe(CANDIDAT);
          expect(item.mesure_proposee.libelle).toMatch(/simul/u);
          expect(item.paraphrase).toMatch(/simul/u);
        }
      });

      it("vide ⇒ {\"items\": []}, conforme", async () => {
        const lecture = lireSortie(texteLu(await appel(enveloppe, "vide")));
        expect(lecture).toEqual({ ok: true, sortie: { items: [] } });
      });

      it("bloc de code ⇒ lisible, texte rendu tel quel, rejeté par le cœur", async () => {
        const texte = texteLu(await appel(enveloppe, "bloc_de_code"));
        expect(texte.startsWith("```json\n")).toBe(true);
        expect(lireSortie(texte)).toMatchObject({ ok: false, motif: "bloc_de_code" });
      });

      it("500 ⇒ illisible, le statut nommé, le corps gardé", async () => {
        const resultat = await appel(enveloppe, "http_500");
        expect(resultat.reponse.statut).toBe(500);
        expect(raisonLue(resultat)).toMatch(/HTTP 500/u);
        expect(resultat.contenu.forme).toBe("objet");
      });

      it("200 non JSON ⇒ illisible, corps gardé en texte", async () => {
        const resultat = await appel(enveloppe, "non_json");
        expect(resultat.reponse.statut).toBe(200);
        expect(raisonLue(resultat)).toBe("réponse 2xx dont le corps n'est pas un objet JSON.");
        expect(resultat.contenu.forme).toBe("texte");
      });

      it("sortie coupée ⇒ illisible, raison de l'éditeur nommée", async () => {
        const attendu = { anthropic: '"max_tokens"', mistral: '"length"' } as const;
        expect(raisonLue(await appel(enveloppe, "coupee"))).toContain(attendu[enveloppe]);
      });
    });
  }

  it("refus (Anthropic) ⇒ illisible, refusal et stop_details nommés", async () => {
    const raison = raisonLue(await appel("anthropic", "refus"));
    expect(raison).toContain('"refusal"');
    expect(raison).toContain("stop_details");
  });

  it("refus demandé à l'enveloppe Mistral ⇒ erreur, jamais une autre issue en silence", async () => {
    await expect(appel("mistral", "refus")).rejects.toThrow(/refus/u);
  });
});

describe("cas limite 9 : de bout en bout avec le cœur", () => {
  async function sortieConforme(enveloppe: NomEditeur, demande: VariablesExtraction): Promise<string> {
    return texteLu(await appel(enveloppe, "conforme", demande));
  }

  it("deux sorties conformes ⇒ items qui passent le test verbatim, en accord", async () => {
    const brutA = await sortieConforme("anthropic", DEMANDE);
    const brutB = await sortieConforme("mistral", DEMANDE);
    const entree = {
      ...entreeHtml(TEXTE, brutA, brutB),
      configuration: { modeles: [MODELE_SIMULE_ANTHROPIC, MODELE_SIMULE_MISTRAL] as const, version_prompt: VERSION_PROMPT_EXTRACTION },
      sorties: new Map([
        [MODELE_SIMULE_ANTHROPIC, lisible(brutA)],
        [MODELE_SIMULE_MISTRAL, lisible(brutB)],
      ]),
    };
    const resultat = extraireSource(entree, ports());
    expect(resultat.rejets).toEqual([]);
    expect(resultat.items.length).toBeGreaterThan(0);
    for (const item of resultat.items) {
      expect(TEXTE).toContain(item.assertion?.citation_verbatim);
      expect(item.assertion?.extraction).toMatchObject({
        accord: "accord",
        modeles: [MODELE_SIMULE_ANTHROPIC, MODELE_SIMULE_MISTRAL],
      });
    }
  });

  it("PDF dont la première ligne figure deux fois ⇒ la citation retenue est unique et tient dans une page", async () => {
    const pages = ["Ligne répétée.\nNous ouvrirons les centres le dimanche.", "Ligne répétée."];
    const texte = pages.join("\f");
    const demande: VariablesExtraction = { candidat_id: CANDIDAT, type_document: "programme_pdf", format: "pdf", texte_canonique: texte };
    const brutA = await sortieConforme("anthropic", demande);
    const brutB = await sortieConforme("mistral", demande);
    const entree = {
      ...entreePdf(pages, brutA, brutB),
      configuration: { modeles: [MODELE_SIMULE_ANTHROPIC, MODELE_SIMULE_MISTRAL] as const, version_prompt: VERSION_PROMPT_EXTRACTION },
      sorties: new Map([
        [MODELE_SIMULE_ANTHROPIC, lisible(brutA)],
        [MODELE_SIMULE_MISTRAL, lisible(brutB)],
      ]),
    };
    const resultat = extraireSource(entree, ports());
    expect(resultat.rejets).toEqual([]);
    expect(resultat.items.map((item) => item.assertion?.citation_verbatim)).toEqual(["Nous ouvrirons les centres le dimanche."]);
  });

  it("aucune ligne unique dans le texte ⇒ erreur nommée, jamais une sortie vide en silence", async () => {
    const demande: VariablesExtraction = { ...DEMANDE, texte_canonique: "Même ligne.\nMême ligne." };
    await expect(appel("anthropic", "conforme", demande)).rejects.toThrow(/aucune ligne/u);
  });
});

describe("cas limite 9 : déterminisme et transport", () => {
  it("la même demande donne la même issue, et les mêmes octets", async () => {
    for (const enveloppe of ENVELOPPES) {
      const choisir = choixParEmpreinte(enveloppe);
      expect(choisir(DEMANDE)).toBe(choisir({ ...DEMANDE }));
      expect(ISSUES_PAR_ENVELOPPE[enveloppe]).toContain(choisir(DEMANDE));
      const premier = await appelerExtracteur(editeurSimule(enveloppe, TEXTE_PROMPT, [DEMANDE], choisir), PROMPT, new AbortController().signal);
      const second = await appelerExtracteur(editeurSimule(enveloppe, TEXTE_PROMPT, [DEMANDE], choisir), PROMPT, new AbortController().signal);
      expect(second.reponse).toEqual(premier.reponse);
    }
  });

  it("l'empreinte couvre toutes les issues de chaque enveloppe sur des demandes variées", () => {
    for (const enveloppe of ENVELOPPES) {
      const choisir = choixParEmpreinte(enveloppe);
      const vues = new Set(Array.from({ length: 200 }, (_, rang) => choisir({ ...DEMANDE, texte_canonique: `Texte ${rang}.` })));
      expect([...vues].sort()).toEqual([...ISSUES_PAR_ENVELOPPE[enveloppe]].sort());
    }
  });

  it("le transport simulé garde chaque requête reçue, dans l'ordre", async () => {
    const editeur = editeurSimule("anthropic", TEXTE_PROMPT, [DEMANDE], () => "vide");
    await appelerExtracteur(editeur, PROMPT, new AbortController().signal);
    await appelerExtracteur(editeur, PROMPT, new AbortController().signal);
    expect(editeur.transport.recues).toHaveLength(2);
    expect(editeur.transport.recues[0]?.corps["messages"]).toEqual([{ role: "user", content: PROMPT }]);
  });

  it("un prompt inconnu ⇒ erreur, aucune réponse inventée", async () => {
    const editeur = editeurSimule("mistral", TEXTE_PROMPT, [DEMANDE], () => "vide");
    await expect(appelerExtracteur(editeur, "Un autre prompt.", new AbortController().signal)).rejects.toThrow(/aucune demande/u);
  });
});
