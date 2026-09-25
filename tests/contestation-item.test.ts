/**
 * Contestation d'un item publié et décision du panel (protocole 0.10, §4 droit de réponse, annexe E ;
 * lot contestation-notification, V3). Les cas limites sont le sujet : 1 000 caractères comptés en
 * points de code après NFC, emoji et caractère combinant en bordure, texte vide, deuxième
 * contestation, contestation d'un item arbitré, version jugée périmée, décisions simultanées,
 * correction hors liste blanche ou citation hors source, décision déjà prise ou contestation
 * inexistante ; et le retour au tirage selon la décision.
 */

import { describe, expect, it } from "vitest";
import { contestationPermetLeTirage, DecisionsPanelSimultanees } from "../pipeline/questions/contestation.ts";
import { verifierAjoutSeul } from "../validation/domaine/ajout-seul.ts";
import {
  ajouterContestation,
  appliquerDecisionPanel,
  ContestationDejaDecidee,
  ContestationEnDouble,
  ContestationInexistante,
  CorrectionsDuPanelRefusees,
  delaiDecisionJours,
  TexteContestationRefuse,
  texteDeContestation,
  VersionJugeePerimee,
  type Contestation,
  type DecisionDuPanel,
} from "../validation/domaine/contestation-item.ts";
import type { AccesTexte } from "../validation/domaine/corrections.ts";
import type { Correction, Item } from "../validation/domaine/types.ts";
import { valider } from "../outils/schemas/valider.ts";
import { itemPromu } from "./aides/data.ts";

const TRACE = { date: "2026-10-01T10:00:00+02:00", commit: "c".repeat(40) };
const TRACE_DECISION = { date: "2026-10-20T10:00:00+02:00", commit: "d".repeat(40) };
const SOURCE = "Préambule. Nous ramènerons la TVA sur l'énergie à 5,5 %. Et nous ferons plus encore.";

function contestation(id = "01JBANCESSA1C0NTESTAT10N01", surcharges: Partial<Contestation> = {}): Contestation {
  return {
    id,
    date_reception: "2026-10-01T09:00:00+02:00",
    texte: "La source ne dit pas cela.",
    contestataire_type: "campagne",
    caviardage: false,
    ...surcharges,
  };
}

function decisionPanel(surcharges: Partial<DecisionDuPanel> = {}): DecisionDuPanel {
  return {
    contestation_id: "01JBANCESSA1C0NTESTAT10N01",
    decision: "maintien",
    version_jugee: 1,
    motivation: "La citation figure dans la source.",
    opinions_dissidentes: [],
    arbitre_seul: true,
    corrections: [],
    date: TRACE_DECISION.date,
    ...surcharges,
  };
}

const ACCES: AccesTexte = {
  texteSource: () => SOURCE,
  offsetsActuels: () => ({ debut: null, fin: null }),
};

function conteste(item: Item = itemPromu()): Item {
  return ajouterContestation(item, contestation(), TRACE);
}

function refus(action: () => unknown): Error {
  try {
    action();
  } catch (erreur) {
    return erreur as Error;
  }
  throw new Error("Aucun refus levé.");
}

/* -------------------------------------------------------------------- texte */

describe("texte de la contestation (§4 : 1 000 caractères, jamais tronqué)", () => {
  it("1 000 points de code : accepté tel quel", () => {
    expect(texteDeContestation("a".repeat(1000))).toHaveLength(1000);
  });

  it("1 001 points de code : refusé, jamais tronqué", () => {
    const erreur = refus(() => texteDeContestation("a".repeat(1001)));
    expect(erreur).toBeInstanceOf(TexteContestationRefuse);
    expect(erreur.message).toMatch(/1001/);
  });

  it("un emoji en bordure compte pour un point de code, pas deux unités UTF-16", () => {
    const texte = `${"a".repeat(999)}😀`;
    expect(texte.length).toBe(1001);
    expect(texteDeContestation(texte)).toBe(texte);
    expect(() => texteDeContestation(`${"a".repeat(1000)}😀`)).toThrow(TexteContestationRefuse);
  });

  it("un caractère combinant en bordure : compté après NFC", () => {
    // « e » + accent aigu combinant : deux points de code, un seul après NFC (« é »).
    const texte = `${"a".repeat(999)}é`;
    expect([...texte]).toHaveLength(1001);
    expect(texteDeContestation(texte)).toBe(`${"a".repeat(999)}é`);
    // Un combinant sans composé précomposé reste deux points de code, et fait déborder.
    expect(() => texteDeContestation(`${"a".repeat(999)}q́`)).toThrow(TexteContestationRefuse);
  });

  it("un texte vide ou fait d'espaces est refusé", () => {
    expect(() => texteDeContestation("")).toThrow(TexteContestationRefuse);
    expect(() => texteDeContestation(" \n\t")).toThrow(TexteContestationRefuse);
  });
});

/* ------------------------------------------------------------- contestation */

describe("ajouterContestation", () => {
  it("place l'item en « contestee », ajoute une entrée d'historique, ne touche pas au contenu", () => {
    const avant = itemPromu();
    const apres = conteste(avant);
    expect(apres.statut_contestation).toBe("contestee");
    expect(apres.contestations).toHaveLength(1);
    expect(apres.empreinte).toBe(avant.empreinte);
    expect(apres.version).toBe(avant.version);
    expect(() => verifierAjoutSeul(avant, apres, { corrections: false })).not.toThrow();
    expect(() => valider("item", apres, "item contesté")).not.toThrow();
  });

  it("l'item contesté sort du tirage (§5)", () => {
    expect(contestationPermetLeTirage(conteste())).toBe(false);
  });

  it("une deuxième contestation ouverte s'ajoute, l'item reste contesté", () => {
    const deux = ajouterContestation(conteste(), contestation("01JBANCESSA1C0NTESTAT10N02"), TRACE);
    expect(deux.contestations).toHaveLength(2);
    expect(deux.statut_contestation).toBe("contestee");
  });

  it("la même contestation deux fois est refusée", () => {
    expect(() => ajouterContestation(conteste(), contestation(), TRACE)).toThrow(ContestationEnDouble);
  });

  it("un texte de plus de 1 000 caractères est refusé même si l'appelant ne l'a pas contrôlé", () => {
    expect(() => ajouterContestation(itemPromu(), contestation(undefined, { texte: "a".repeat(1001) }), TRACE)).toThrow(
      TexteContestationRefuse,
    );
  });

  it("une contestation sur un item arbitré le repasse en « contestee »", () => {
    const arbitre = appliquerDecisionPanel(conteste(), decisionPanel(), TRACE_DECISION, ACCES).item;
    expect(arbitre.statut_contestation).toBe("arbitree");
    const reconteste = ajouterContestation(arbitre, contestation("01JBANCESSA1C0NTESTAT10N02"), TRACE);
    expect(reconteste.statut_contestation).toBe("contestee");
    expect(contestationPermetLeTirage(reconteste)).toBe(false);
  });
});

/* --------------------------------------------------------------- panel */

describe("appliquerDecisionPanel", () => {
  it("maintien : arbitrée, réintégrée au tirage, statut de validation inchangé", () => {
    const avant = conteste();
    const { item, autorisation } = appliquerDecisionPanel(avant, decisionPanel(), TRACE_DECISION, ACCES);
    expect(item.statut_contestation).toBe("arbitree");
    expect(item.statut_validation).toBe("verifie");
    expect(contestationPermetLeTirage(item)).toBe(true);
    expect(() => verifierAjoutSeul(avant, item, autorisation)).not.toThrow();
    expect(() => valider("item", item, "item arbitré")).not.toThrow();
  });

  it("retrait : « retire_par_panel », sorti du tirage", () => {
    const { item } = appliquerDecisionPanel(conteste(), decisionPanel({ decision: "retrait" }), TRACE_DECISION, ACCES);
    expect(item.statut_validation).toBe("retire_par_panel");
    expect(contestationPermetLeTirage(item)).toBe(false);
  });

  it("non-évaluabilité : « non_evaluable », sorti du tirage", () => {
    const { item } = appliquerDecisionPanel(conteste(), decisionPanel({ decision: "non_evaluabilite" }), TRACE_DECISION, ACCES);
    expect(item.statut_validation).toBe("non_evaluable");
    expect(contestationPermetLeTirage(item)).toBe(false);
  });

  it("publie motivation, opinions dissidentes et arbitre_seul", () => {
    const { item } = appliquerDecisionPanel(
      conteste(),
      decisionPanel({ opinions_dissidentes: ["Un membre tient pour le retrait."] }),
      TRACE_DECISION,
      ACCES,
    );
    expect(item.contestations?.[0]).toMatchObject({
      decision_panel: {
        decision: "maintien",
        motivation: "La citation figure dans la source.",
        opinions_dissidentes: ["Un membre tient pour le retrait."],
        arbitre_seul: true,
      },
    });
  });

  it("une décision rendue après 14 jours est acceptée, et son délai se calcule", () => {
    const tard = { ...TRACE_DECISION, date: "2026-11-30T10:00:00+01:00" };
    const { item } = appliquerDecisionPanel(conteste(), decisionPanel({ date: tard.date }), tard, ACCES);
    expect(item.statut_contestation).toBe("arbitree");
    expect(delaiDecisionJours(contestation(), tard.date)).toBe(60);
  });

  it("deux contestations : arbitrée seulement quand les deux sont décidées", () => {
    const deux = ajouterContestation(conteste(), contestation("01JBANCESSA1C0NTESTAT10N02"), TRACE);
    const une = appliquerDecisionPanel(deux, decisionPanel(), TRACE_DECISION, ACCES).item;
    expect(une.statut_contestation).toBe("contestee");
    const plus = { ...TRACE_DECISION, date: "2026-10-21T10:00:00+02:00" };
    const toutes = appliquerDecisionPanel(
      une,
      decisionPanel({ contestation_id: "01JBANCESSA1C0NTESTAT10N02", date: plus.date }),
      plus,
      ACCES,
    ).item;
    expect(toutes.statut_contestation).toBe("arbitree");
  });

  it("deux décisions différentes au même instant sont refusées à l'écriture", () => {
    const deux = ajouterContestation(conteste(), contestation("01JBANCESSA1C0NTESTAT10N02"), TRACE);
    const une = appliquerDecisionPanel(deux, decisionPanel(), TRACE_DECISION, ACCES).item;
    const simultanee = decisionPanel({ contestation_id: "01JBANCESSA1C0NTESTAT10N02", decision: "retrait" });
    expect(() => appliquerDecisionPanel(une, simultanee, TRACE_DECISION, ACCES)).toThrow(DecisionsPanelSimultanees);
  });

  it("une contestation inexistante ou déjà décidée est refusée", () => {
    expect(() =>
      appliquerDecisionPanel(conteste(), decisionPanel({ contestation_id: "01JBANCESSA1C0NTESTAT10N09" }), TRACE_DECISION, ACCES),
    ).toThrow(ContestationInexistante);
    const decidee = appliquerDecisionPanel(conteste(), decisionPanel(), TRACE_DECISION, ACCES).item;
    expect(() => appliquerDecisionPanel(decidee, decisionPanel(), TRACE_DECISION, ACCES)).toThrow(ContestationDejaDecidee);
  });

  it("une version jugée périmée est refusée", () => {
    expect(() => appliquerDecisionPanel(conteste(), decisionPanel({ version_jugee: 2 }), TRACE_DECISION, ACCES)).toThrow(
      VersionJugeePerimee,
    );
  });
});

describe("décision « correction » du panel", () => {
  const citation = (nouvelle: string): Correction => ({
    cible: "item",
    chemin: "/assertion/citation_verbatim",
    ancienne_valeur: "Nous ramènerons la TVA sur l'énergie à 5,5 %.",
    nouvelle_valeur: nouvelle,
  });

  it("corrige par la liste blanche : version + 1, empreinte recalculée, test verbatim rejoué", () => {
    const avant = conteste();
    const { item, autorisation } = appliquerDecisionPanel(
      avant,
      decisionPanel({ decision: "correction", corrections: [citation("Nous ramènerons la TVA sur l'énergie à 5,5 %. Et nous ferons plus encore.")] }),
      TRACE_DECISION,
      ACCES,
    );
    expect(item.version).toBe(avant.version + 1);
    expect(item.empreinte).not.toBe(avant.empreinte);
    expect(autorisation.corrections).toBe(true);
    expect(() => verifierAjoutSeul(avant, item, autorisation)).not.toThrow();
    expect(contestationPermetLeTirage(item)).toBe(true);
  });

  it("une citation corrigée absente de la source est refusée (test verbatim)", () => {
    const erreur = refus(() =>
      appliquerDecisionPanel(conteste(), decisionPanel({ decision: "correction", corrections: [citation("Une phrase inventée.")] }), TRACE_DECISION, ACCES),
    );
    expect(erreur).toBeInstanceOf(CorrectionsDuPanelRefusees);
    expect(erreur.message).toMatch(/citation_hors_source/);
  });

  it("une correction hors de la liste blanche est refusée", () => {
    const hors: Correction = { cible: "item", chemin: "/candidat_id", ancienne_valeur: "demo-alpha", nouvelle_valeur: "demo-autre" };
    const erreur = refus(() => appliquerDecisionPanel(conteste(), decisionPanel({ decision: "correction", corrections: [hors] }), TRACE_DECISION, ACCES));
    expect(erreur).toBeInstanceOf(CorrectionsDuPanelRefusees);
    expect(erreur.message).toMatch(/chemin_interdit/);
  });

  it("une correction de la mesure (thème) n'est pas une correction d'item", () => {
    const theme: Correction = { cible: "mesure", chemin: "/theme", ancienne_valeur: "retraites", nouvelle_valeur: "sante" };
    const erreur = refus(() => appliquerDecisionPanel(conteste(), decisionPanel({ decision: "correction", corrections: [theme] }), TRACE_DECISION, ACCES));
    expect(erreur).toBeInstanceOf(CorrectionsDuPanelRefusees);
    expect(erreur.message).toMatch(/pas la mesure/);
  });

  it("une valeur ancienne qui ne correspond plus à l'item est refusée", () => {
    const perimee = { ...citation("Nous ramènerons la TVA sur l'énergie à 5,5 %."), ancienne_valeur: "autre chose" };
    expect(() => appliquerDecisionPanel(conteste(), decisionPanel({ decision: "correction", corrections: [perimee] }), TRACE_DECISION, ACCES)).toThrow(
      CorrectionsDuPanelRefusees,
    );
  });

  it("« correction » sans correction, ou corrections sans « correction », est refusé", () => {
    expect(() => appliquerDecisionPanel(conteste(), decisionPanel({ decision: "correction" }), TRACE_DECISION, ACCES)).toThrow(CorrectionsDuPanelRefusees);
    expect(() =>
      appliquerDecisionPanel(conteste(), decisionPanel({ corrections: [citation("Nous ramènerons la TVA sur l'énergie à 5,5 %.")] }), TRACE_DECISION, ACCES),
    ).toThrow(CorrectionsDuPanelRefusees);
  });
});
