/**
 * Conformité n° 12 (décision de l'auteur du 2026-09-27, option « question explicite ») : la
 * vérification à l'oreille d'une transcription T2 (§4, §9).
 *
 * - la grille d'un item dont une source de contenu est T2 porte une question de plus, « J'ai écouté
 *   l'extrait et la transcription est fidèle », et elle seule ;
 * - l'item n'est vérifié que si les deux annotateurs y répondent oui ; sinon il part en arbitrage,
 *   comme l'item A dont l'absence n'est pas confirmée par les deux (même règle, même mécanique) ;
 * - `pnpm promote` écrit alors l'attestation sur chaque source T2 : les deux annotateurs, triés, et
 *   la date civile de la plus tardive des deux décisions.
 *
 * La logique vit dans `validation/domaine/` et se teste sans DOM : le client n'affiche que ce que la
 * vue du serveur lui donne (`construireVueItem`).
 */

import { describe, expect, it } from "vitest";
import { evaluerAvecArbitrage, type DecisionArbitrage } from "../validation/domaine/arbitrage.ts";
import { construireDecision } from "../validation/domaine/decision.ts";
import { LIBELLES_SPECIFIQUES, questionsSpecifiquesDe } from "../validation/domaine/grille.ts";
import { questionsObligatoires } from "../validation/domaine/interaction.ts";
import { evaluerPromotion, type Dossier, type Issue } from "../validation/domaine/promotion.ts";
import type { EntreeDecision, Item, QuestionsSpecifiques, Source } from "../validation/domaine/types.ts";
import { construireVueItem } from "../validation/serveur/vues.ts";
import { decision, GRILLE_TOUT_VRAI, itemA, itemO, itemP, mesure, OPTIONS_PROMOTION, source } from "./aides/fabriques.ts";

function defini<T>(valeur: T | undefined): T {
  if (valeur === undefined) throw new Error("Valeur attendue, absente.");
  return valeur;
}

const T2: Partial<Source> = {
  tier: "T2",
  type_document: "enregistrement_video",
  url: "https://demo.invalid/emission",
  extrait: { debut: "00:42:10", fin: "00:43:05" },
};

function itemPT2(): Item {
  return itemP({ assertion: { ...defini(itemP().assertion), source: source(T2) } });
}

/** Item O dont SEUL l'état postérieur est T2 (l'antérieur est un programme T1). */
function itemOPosterieurT2(): Item {
  return itemO();
}

function itemOTousT1(): Item {
  const base = itemO();
  const bloc = defini(base.obsolescence);
  return itemO({ obsolescence: { ...bloc, etat_posterieur: { ...bloc.etat_posterieur, source: source() } } });
}

function itemACouvertureT2(): Item {
  const base = itemA();
  return itemA({ absence: { ...defini(base.absence), source_couverture_theme: source(T2) } });
}

function dossier(item: Item, decisions: readonly EntreeDecision[]): Dossier {
  return {
    item,
    mesure: mesure(),
    lot_id: "lot-001",
    lot_nature: "reel",
    decisions,
    registre_corrections_mesure: [],
  };
}

function deuxDecisions(
  item: Item,
  specifiques: readonly [QuestionsSpecifiques | undefined, QuestionsSpecifiques | undefined],
  sens: "accepter" | "rejeter" = "accepter",
): readonly EntreeDecision[] {
  return (["a2", "a1"] as const).map((annotateur_id, rang) =>
    decision({
      annotateur_id,
      item,
      decision: sens,
      ...(specifiques[rang] === undefined ? {} : { questions_specifiques: specifiques[rang] }),
    }),
  );
}

/** Horodatages distincts : la date de l'attestation est celle de la plus tardive. */
function avecHorodatage(entree: EntreeDecision, horodatage: string): EntreeDecision {
  return { ...entree, horodatage };
}

const OUI = { transcription_ecoutee: true };
const NON = { transcription_ecoutee: false };

/* ------------------------------------------------------------ la grille */

describe("la question d'écoute dans la grille", () => {
  it("son libellé est celui décidé par l'auteur", () => {
    expect(LIBELLES_SPECIFIQUES.transcription_ecoutee).toBe("J'ai écouté l'extrait et la transcription est fidèle");
  });

  it("item T1 : la question n'apparaît pas dans la grille", () => {
    expect(questionsSpecifiquesDe(itemP())).not.toContain("transcription_ecoutee");
    expect(questionsObligatoires(itemP())).not.toContain("transcription_ecoutee");
  });

  it("item P dont la source est T2 : la question apparaît", () => {
    expect(questionsSpecifiquesDe(itemPT2())).toEqual(["transcription_ecoutee"]);
    expect(questionsObligatoires(itemPT2())).toContain("transcription_ecoutee");
  });

  it("item O dont seul l'état postérieur est T2 : la question apparaît, une fois", () => {
    expect(questionsSpecifiquesDe(itemOPosterieurT2())).toEqual(["changement_explicite", "transcription_ecoutee"]);
  });

  it("item O dont les deux états sont T1 : la question n'apparaît pas", () => {
    expect(questionsSpecifiquesDe(itemOTousT1())).toEqual(["changement_explicite"]);
  });

  it("item A dont la source de couverture est T2 : la question apparaît après les trois questions propres", () => {
    expect(questionsSpecifiquesDe(itemACouvertureT2())).toEqual([
      "couverture_theme_verifiee",
      "corpus_complet",
      "confirmation_absence",
      "transcription_ecoutee",
    ]);
  });

  it("la vue envoyée au client porte la question, avec son libellé, pour un item T2 seulement", () => {
    const acces = { texte: () => null, transcription: () => null };
    const vueT2 = construireVueItem(itemPT2(), mesure(), acces, { index: 0, total: 1 });
    const vueT1 = construireVueItem(itemP(), mesure(), acces, { index: 0, total: 1 });
    expect(vueT2.questions_specifiques).toEqual([
      { cle: "transcription_ecoutee", libelle: LIBELLES_SPECIFIQUES.transcription_ecoutee, etat: null },
    ]);
    expect(vueT1.questions_specifiques).toEqual([]);
  });
});

/* --------------------------------------------------- saisie d'une décision */

describe("une décision sur un item T2", () => {
  function soumettre(item: Item, questions_specifiques?: QuestionsSpecifiques) {
    return construireDecision(
      {
        item_id: item.id,
        decision: "accepter",
        reponses_grille: GRILLE_TOUT_VRAI,
        ...(questions_specifiques === undefined ? {} : { questions_specifiques }),
        duree_affichage_ms: 1000,
        duree_active_ms: 900,
      },
      {
        annotateur_id: "a1",
        lot_id: "lot-001",
        lot_nature: "reel",
        item,
        visite: 1,
        horodatage: "2026-09-20T10:00:00+02:00",
        identifiant: "01JBANCESSA1DEC1S10N900001",
      },
    );
  }

  it("est refusée sans réponse à la question d'écoute", () => {
    const resultat = soumettre(itemPT2());
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.manquements).toEqual([{ cle: "transcription_ecoutee", probleme: "sans_reponse" }]);
  });

  it("est acceptée avec « non » : répondre non est un jugement, pas un manque", () => {
    expect(soumettre(itemPT2(), NON).ok).toBe(true);
  });

  it("sur un item T1, la question d'écoute est refusée comme sans objet", () => {
    const resultat = soumettre(itemP(), OUI);
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.manquements).toEqual([{ cle: "transcription_ecoutee", probleme: "repondue_alors_que_sans_objet" }]);
  });
});

/* -------------------------------------------------------------- promotion */

function promu(issue: Issue): Item {
  if (issue.sort !== "promouvoir") throw new Error(`Attendu : promouvoir, obtenu ${JSON.stringify(issue)}`);
  return issue.item;
}

describe("promotion d'un item T2", () => {
  it("les deux répondent oui : vérifié, attestation des deux annotateurs triés et de la date", () => {
    const item = itemPT2();
    const [premiere, seconde] = deuxDecisions(item, [OUI, OUI]) as [EntreeDecision, EntreeDecision];
    const issue = evaluerPromotion(
      dossier(item, [
        avecHorodatage(premiere, "2026-09-21T23:30:00+02:00"),
        avecHorodatage(seconde, "2026-09-20T10:00:00+02:00"),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "promouvoir" && issue.statut).toBe("verifie");
    const attestee = defini(promu(issue).assertion).source;
    expect(attestee.transcription_verifiee_par).toEqual(["a1", "a2"]);
    // Date civile de la plus tardive, telle qu'écrite dans son horodatage (fuseau de l'annotateur).
    expect(attestee.transcription_verifiee_le).toBe("2026-09-21");
  });

  it("la plus tardive se compare en instants, pas en chaînes : un décalage horaire ne la fausse pas", () => {
    const item = itemPT2();
    const [premiere, seconde] = deuxDecisions(item, [OUI, OUI]) as [EntreeDecision, EntreeDecision];
    // 2026-09-21T01:00+02:00 = 2026-09-20T23:00Z, antérieur à 2026-09-20T23:30Z.
    const issue = evaluerPromotion(
      dossier(item, [
        avecHorodatage(premiere, "2026-09-21T01:00:00+02:00"),
        avecHorodatage(seconde, "2026-09-20T23:30:00Z"),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(defini(promu(issue).assertion).source.transcription_verifiee_le).toBe("2026-09-20");
  });

  it("l'un répond non : pas vérifié, l'item part en arbitrage « transcription_non_verifiee »", () => {
    const item = itemPT2();
    const issue = evaluerPromotion(dossier(item, deuxDecisions(item, [OUI, NON])), OPTIONS_PROMOTION);
    expect(issue).toEqual({ sort: "arbitrage", motif: "transcription_non_verifiee" });
  });

  it("les deux répondent non : pas vérifié non plus", () => {
    const item = itemPT2();
    const issue = evaluerPromotion(dossier(item, deuxDecisions(item, [NON, NON])), OPTIONS_PROMOTION);
    expect(issue).toEqual({ sort: "arbitrage", motif: "transcription_non_verifiee" });
  });

  it("une réponse absente ne vaut pas oui", () => {
    const item = itemPT2();
    const issue = evaluerPromotion(dossier(item, deuxDecisions(item, [OUI, undefined])), OPTIONS_PROMOTION);
    expect(issue).toEqual({ sort: "arbitrage", motif: "transcription_non_verifiee" });
  });

  it("deux « rejeter » : l'item est rejeté et ne porte aucune attestation, même avec deux oui", () => {
    const item = itemPT2();
    const issue = evaluerPromotion(dossier(item, deuxDecisions(item, [OUI, OUI], "rejeter")), OPTIONS_PROMOTION);
    expect(issue.sort === "promouvoir" && issue.statut).toBe("rejete");
    expect(defini(promu(issue).assertion).source.transcription_verifiee_par).toBeUndefined();
  });

  it("item O dont seul l'état postérieur est T2 : seul l'état postérieur est attesté", () => {
    const item = itemOPosterieurT2();
    const specifiques = { changement_explicite: true, ...OUI };
    const resultat = promu(evaluerPromotion(dossier(item, deuxDecisions(item, [specifiques, specifiques])), OPTIONS_PROMOTION));
    expect(defini(resultat.obsolescence).etat_posterieur.source.transcription_verifiee_par).toEqual(["a1", "a2"]);
    expect(defini(resultat.obsolescence).etat_anterieur.source.transcription_verifiee_par).toBeUndefined();
  });

  it("item A dont la couverture est T2 : la couverture est attestée", () => {
    const item = itemACouvertureT2();
    const specifiques = { couverture_theme_verifiee: true, corpus_complet: true, confirmation_absence: true, ...OUI };
    const resultat = promu(evaluerPromotion(dossier(item, deuxDecisions(item, [specifiques, specifiques])), OPTIONS_PROMOTION));
    expect(defini(resultat.absence).source_couverture_theme.transcription_verifiee_par).toEqual(["a1", "a2"]);
  });

  it("l'attestation ne change ni la version ni l'empreinte : elle n'est pas du contenu notant", () => {
    const item = itemPT2();
    const resultat = promu(evaluerPromotion(dossier(item, deuxDecisions(item, [OUI, OUI])), OPTIONS_PROMOTION));
    expect(resultat.version).toBe(item.version);
    expect(resultat.empreinte).toBe(item.empreinte);
  });
});

describe("arbitrage d'un item T2 non attesté", () => {
  function decisionVerifie(cas: Dossier): DecisionArbitrage {
    return {
      id: "01JBANCESSA1ARB1TRAGE00T21",
      item_id: cas.item.id,
      lot_id: cas.lot_id,
      item_version: cas.item.version,
      item_empreinte: cas.item.empreinte,
      motif: "transcription_non_verifiee",
      issue: "verifie",
      contenu_retenu: "original",
      arbitre: "auteur",
      arbitre_seul: false,
      motivation: "Motivation publiée de la décision.",
      date: "2026-10-02T10:00:00+02:00",
    };
  }

  it("l'arbitre ne peut pas le vérifier : l'écoute est exigée des deux annotateurs", () => {
    const item = itemPT2();
    const cas = dossier(item, deuxDecisions(item, [OUI, NON]));
    const issue = evaluerAvecArbitrage(cas, [decisionVerifie(cas)], OPTIONS_PROMOTION);
    expect(issue.sort).toBe("arbitrage");
    if (issue.sort !== "arbitrage") return;
    expect(issue.decision_inapplicable?.motifs).toEqual([
      "source T2 : vérifié seulement si les deux annotateurs ont écouté l'extrait et jugé la transcription fidèle (§4, §9)",
    ]);
  });

  it("l'arbitre peut le rejeter", () => {
    const item = itemPT2();
    const cas = dossier(item, deuxDecisions(item, [OUI, NON]));
    const { contenu_retenu: _retire, ...rejet } = { ...decisionVerifie(cas), issue: "rejete" as const };
    const issue = evaluerAvecArbitrage(cas, [rejet], OPTIONS_PROMOTION);
    expect(issue.sort === "promouvoir" && issue.statut).toBe("rejete");
  });
});
