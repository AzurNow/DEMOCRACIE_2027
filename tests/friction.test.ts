/**
 * Symétrie de friction et grille par type d'item.
 *
 * L'exigence : accepter, rejeter et non évaluable coûtent exactement le même nombre de gestes.
 * Un raccourci plus rapide pour accepter produit un biais d'acquiescement, et ce biais entre
 * ensuite dans le jeu de données de référence sans que rien ne le signale.
 *
 * Le test ne se contente pas de comparer trois appels d'une même fonction — ce serait une
 * tautologie. Il vérifie la **table** dont le coût dérive, et il vérifie que la validation
 * d'une décision exige la grille quelle que soit la décision : c'est cette seconde propriété
 * qui empêche de rendre « rejeter » moins cher en le dispensant de répondre.
 */

import { describe, expect, it } from "vitest";
import { construireDecision } from "../validation/domaine/decision.ts";
import {
  COUT_DECISION,
  DECISIONS_SYMETRIQUES,
  gestesPourDecision,
  questionsObligatoires,
  RACCOURCIS,
  TOUCHES_DECISION,
} from "../validation/domaine/interaction.ts";
import { applicabiliteGrille, controlerGrille, questionsSpecifiques } from "../validation/domaine/grille.ts";
import type { Decision, Item } from "../validation/domaine/types.ts";
import { GRILLE_TOUT_VRAI, itemA, itemF, itemO, itemP } from "./aides/fabriques.ts";

const TOUS_LES_TYPES: readonly { nom: string; item: Item }[] = [
  { nom: "P", item: itemP() },
  { nom: "A", item: itemA() },
  { nom: "O", item: itemO() },
  { nom: "F", item: itemF() },
];

describe("symétrie de friction", () => {
  it("les trois décisions coûtent le même nombre de gestes, pour les quatre types d'item", () => {
    for (const { nom, item } of TOUS_LES_TYPES) {
      const couts = DECISIONS_SYMETRIQUES.map((decision) => gestesPourDecision(item, decision));
      expect(new Set(couts).size, `type ${nom} : coûts ${JSON.stringify(couts)}`).toBe(1);
      expect(couts[0]).toBeGreaterThan(0);
    }
  });

  it("la table des coûts est identique pour les trois, ligne par ligne", () => {
    const references = COUT_DECISION.accepter;
    for (const decision of DECISIONS_SYMETRIQUES) {
      expect(COUT_DECISION[decision], `décision ${decision}`).toEqual(references);
    }
  });

  it("aucune des trois n'échappe à la grille ni à la confirmation", () => {
    for (const decision of DECISIONS_SYMETRIQUES) {
      expect(COUT_DECISION[decision].exige_grille).toBe(true);
      expect(COUT_DECISION[decision].confirmation).toBe(true);
      expect(COUT_DECISION[decision].touches_decision).toBe(1);
      expect(COUT_DECISION[decision].gestes_variables).toBe(false);
    }
  });

  it("« corriger » est la seule décision au coût variable, et elle est hors de l'exigence", () => {
    expect(gestesPourDecision(itemP(), "corriger")).toBe("variable");
    expect(DECISIONS_SYMETRIQUES).not.toContain("corriger");
  });

  it("chaque décision a une touche distincte, et une seule", () => {
    const touches = Object.values(TOUCHES_DECISION);
    expect(new Set(touches).size).toBe(touches.length);
    for (const touche of touches) expect(touche).toHaveLength(1);
  });

  it("la table des raccourcis publiée décrit bien ces touches", () => {
    for (const [decision, touche] of Object.entries(TOUCHES_DECISION)) {
      const raccourci = RACCOURCIS.find((entree) => entree.touche === touche);
      expect(raccourci?.categorie, `touche de ${decision}`).toBe("decision");
    }
  });

  it("le coût suit le nombre de questions, et le nombre de questions suit le type d'item", () => {
    // Un item O porte deux grilles : il coûte davantage qu'un item P, ce qui est une
    // conséquence du protocole (deux états sourcés), pas une asymétrie entre décisions.
    expect(questionsObligatoires(itemP())).toHaveLength(5);
    expect(questionsObligatoires(itemA())).toHaveLength(5);
    expect(questionsObligatoires(itemF())).toHaveLength(3);
    expect(questionsObligatoires(itemO()).length).toBeGreaterThan(5);
  });
});

describe("la grille est exigée quelle que soit la décision", () => {
  const contexte = (item: Item) => ({
    annotateur_id: "a1",
    lot_id: "lot-001",
    lot_nature: "reel" as const,
    item,
    visite: 1,
    horodatage: "2026-09-20T10:00:00+02:00",
    identifiant: "01JBANCESSA1DEC1S10N000099",
  });

  it("refuse un rejet sans grille, comme elle refuserait une acceptation sans grille", () => {
    const item = itemP();
    for (const decision of ["accepter", "rejeter", "non_evaluable"] as Decision[]) {
      const resultat = construireDecision(
        {
          item_id: item.id,
          decision,
          reponses_grille: { ...GRILLE_TOUT_VRAI, citation_fidele: null },
          duree_affichage_ms: 1000,
          duree_active_ms: 900,
        },
        contexte(item),
      );
      expect(resultat.ok, `décision ${decision}`).toBe(false);
    }
  });

  it("accepte les trois avec une grille complète", () => {
    const item = itemP();
    for (const decision of ["accepter", "rejeter", "non_evaluable"] as Decision[]) {
      const resultat = construireDecision(
        {
          item_id: item.id,
          decision,
          reponses_grille: GRILLE_TOUT_VRAI,
          duree_affichage_ms: 1000,
          duree_active_ms: 900,
        },
        contexte(item),
      );
      expect(resultat.ok, `décision ${decision}`).toBe(true);
    }
  });

  it("refuse une durée active supérieure à la durée d'affichage", () => {
    const item = itemP();
    const resultat = construireDecision(
      {
        item_id: item.id,
        decision: "accepter",
        reponses_grille: GRILLE_TOUT_VRAI,
        duree_affichage_ms: 900,
        duree_active_ms: 1000,
      },
      contexte(item),
    );
    expect(resultat.ok).toBe(false);
  });
});

describe("grille par type d'item", () => {
  it("un item P pose les cinq questions", () => {
    const applicabilite = applicabiliteGrille("P", { quantifie: true });
    expect(Object.values(applicabilite).every((valeur) => valeur === "applicable")).toBe(true);
  });

  it("un item P sans quantification n'en pose que quatre", () => {
    const applicabilite = applicabiliteGrille("P", { quantifie: false });
    expect(applicabilite.quantification_correcte).toBe("sans_objet");
    expect(applicabilite.citation_fidele).toBe("applicable");
  });

  it("un item A ne pose ni citation, ni paraphrase, ni quantification", () => {
    const applicabilite = applicabiliteGrille("A", { quantifie: false });
    expect(applicabilite.citation_fidele).toBe("sans_objet");
    expect(applicabilite.paraphrase_exacte).toBe("sans_objet");
    expect(applicabilite.quantification_correcte).toBe("sans_objet");
    expect(applicabilite.position_univoque).toBe("applicable");
    expect(applicabilite.theme_correct).toBe("applicable");
    expect(questionsSpecifiques("A")).toEqual([
      "couverture_theme_verifiee",
      "corpus_complet",
      "confirmation_absence",
    ]);
  });

  it("un item F ne pose que le thème, plus la fictivité et la plausibilité", () => {
    const applicabilite = applicabiliteGrille("F", { quantifie: false });
    expect(applicabilite.theme_correct).toBe("applicable");
    expect(applicabilite.citation_fidele).toBe("sans_objet");
    expect(applicabilite.position_univoque).toBe("sans_objet");
    expect(questionsSpecifiques("F")).toEqual(["fictivite_verifiee", "plausibilite"]);
  });

  it("un item O pose le thème une seule fois, sur l'état en vigueur", () => {
    const anterieur = applicabiliteGrille("O", { quantifie: true, etat: "anterieur" });
    const posterieur = applicabiliteGrille("O", { quantifie: true, etat: "posterieur" });
    expect(anterieur.theme_correct).toBe("sans_objet");
    expect(posterieur.theme_correct).toBe("applicable");
    expect(anterieur.citation_fidele).toBe("applicable");
    expect(posterieur.citation_fidele).toBe("applicable");
  });

  it("une réponse donnée à une question sans objet est refusée, pas ignorée", () => {
    const applicabilite = applicabiliteGrille("A", { quantifie: false });
    const manquements = controlerGrille(
      { ...GRILLE_TOUT_VRAI, citation_fidele: true, position_univoque: true, theme_correct: true },
      applicabilite,
    );
    expect(manquements.map((manquement) => manquement.cle)).toContain("citation_fidele");
    expect(manquements[0]?.probleme).toBe("repondue_alors_que_sans_objet");
  });

  it("une question sans objet vaut null, jamais false", () => {
    const applicabilite = applicabiliteGrille("A", { quantifie: false });
    const manquements = controlerGrille(
      {
        citation_fidele: false,
        paraphrase_exacte: null,
        position_univoque: true,
        theme_correct: true,
        quantification_correcte: null,
      },
      applicabilite,
    );
    expect(manquements).toHaveLength(1);
    expect(manquements[0]).toEqual({
      cle: "citation_fidele",
      probleme: "repondue_alors_que_sans_objet",
    });
  });
});
