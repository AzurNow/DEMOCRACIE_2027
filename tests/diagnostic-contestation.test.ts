/**
 * §4 (protocole 0.8) : « Un item sort du dénominateur si une contestation le vise à la date où le
 * kappa du lot est calculé, qu'il ait été décidé ou non par les annotateurs ; ses décisions
 * éventuelles restent au journal. »
 *
 * Constat 9 de la passe de conformité du 2026-09-24 : l'exclusion dépendait de l'entrée
 * `retrait_item` écrite quand un annotateur **affichait** l'item, donc de l'ordre de navigation.
 * Ici, l'exclusion se lit sur `statut_contestation` au moment du calcul, jamais sur le journal.
 */

import { describe, expect, it } from "vitest";
import { diagnostiquerLot, StatutContestationNonTranche } from "../validation/domaine/analyse-lot.ts";
import { construireRetrait } from "../validation/domaine/decision.ts";
import { rejouer } from "../validation/domaine/journal.ts";
import type { Decision, EntreeJournal, Item } from "../validation/domaine/types.ts";
import { lotDe } from "./aides/bac.ts";
import { decision, itemP } from "./aides/fabriques.ts";

const ITEMS: readonly Item[] = [1, 2, 3, 4].map((rang) =>
  itemP({ id: `01JBANCESSA1000000001TEM0${rang}`, candidat_id: "demo-alpha" }),
);

/** Décisions choisies pour que l'item 3, le seul désaccord, change le kappa quand il sort. */
const DECISIONS: Readonly<Record<string, readonly Decision[]>> = {
  a1: ["accepter", "rejeter", "accepter", "non_evaluable"],
  a2: ["accepter", "rejeter", "rejeter", "non_evaluable"],
};

const CONTESTE = ITEMS[2] as Item;

function contester(item: Item): Item {
  return {
    ...item,
    statut_contestation: "contestee",
    contestations: [
      {
        id: "01JBANCESSA1C0NTESTAT10N01",
        date_reception: "2026-09-25T09:00:00+02:00",
        texte: "Texte de contestation fictif.",
        contestataire_type: "campagne",
      },
    ],
  };
}

function arbitrer(item: Item, issue: string): Item {
  return {
    ...contester(item),
    statut_contestation: "arbitree",
    contestations: [
      {
        id: "01JBANCESSA1C0NTESTAT10N01",
        date_reception: "2026-09-25T09:00:00+02:00",
        texte: "Texte de contestation fictif.",
        contestataire_type: "campagne",
        decision_panel: { date: "2026-10-01T09:00:00+02:00", decision: issue, motivation: "Motif fictif." },
      },
    ],
  };
}

function decisionDe(annotateur_id: string, rang: number): EntreeJournal {
  const choix = (DECISIONS[annotateur_id] as readonly Decision[])[rang] as Decision;
  return decision({ annotateur_id, item: ITEMS[rang] as Item, decision: choix });
}

function retraitDe(annotateur_id: string, item: Item): EntreeJournal {
  return construireRetrait({
    identifiant: `01JBANCESSA1RETRA1T${annotateur_id.toUpperCase()}000001`,
    annotateur_id,
    lot_id: "lot-001",
    lot_nature: "reel",
    item_id: item.id,
    motif: "item contestee",
    horodatage: "2026-09-25T10:00:00+02:00",
  });
}

/** Toutes les décisions de l'annotateur, sauf celles des rangs omis. */
function decisionsSauf(annotateur_id: string, omis: readonly number[] = []): EntreeJournal[] {
  return ITEMS.flatMap((_item, rang) => (omis.includes(rang) ? [] : [decisionDe(annotateur_id, rang)]));
}

function diagnostic(items: readonly Item[], journaux: Readonly<Record<string, readonly EntreeJournal[]>>) {
  return diagnostiquerLot({
    lot: lotDe("lot-001", ITEMS),
    items: new Map(items.map((item) => [item.id, item])),
    etats: new Map(Object.entries(journaux).map(([annotateur, entrees]) => [annotateur, rejouer(entrees)])),
    taille_attendue: ITEMS.length,
  });
}

function avecConteste(transformer: (item: Item) => Item = contester): Item[] {
  return ITEMS.map((item) => (item.id === CONTESTE.id ? transformer(item) : item));
}

describe("item contesté au calcul du kappa (§4, constat 9)", () => {
  it("contesté après les deux décisions : exclu du kappa, décisions pourtant au journal", () => {
    const resultat = diagnostic(avecConteste(), { a1: decisionsSauf("a1"), a2: decisionsSauf("a2") });
    expect(resultat.kappa.n).toBe(3);
    expect(resultat.exclus_contestation).toBe(1);
    expect(resultat.kappa.kappa).toBe(1);
    expect(resultat.les_deux_ont_fini).toBe(true);
  });

  it("contesté entre les deux décisions : exclu", () => {
    const resultat = diagnostic(avecConteste(), {
      a1: decisionsSauf("a1"),
      a2: [...decisionsSauf("a2", [2]), retraitDe("a2", CONTESTE)],
    });
    expect(resultat.kappa.n).toBe(3);
    expect(resultat.exclus_contestation).toBe(1);
    expect(resultat.les_deux_ont_fini).toBe(true);
  });

  it("contesté avant toute décision, et jamais affiché : exclu, et le lot est fini sans lui", () => {
    const resultat = diagnostic(avecConteste(), { a1: decisionsSauf("a1", [2]), a2: decisionsSauf("a2", [2]) });
    expect(resultat.kappa.n).toBe(3);
    expect(resultat.exclus_contestation).toBe(1);
    expect(resultat.les_deux_ont_fini).toBe(true);
  });

  it("contesté avant toute décision, retiré à l'affichage par les deux : exclu", () => {
    const resultat = diagnostic(avecConteste(), {
      a1: [...decisionsSauf("a1", [2]), retraitDe("a1", CONTESTE)],
      a2: [...decisionsSauf("a2", [2]), retraitDe("a2", CONTESTE)],
    });
    expect(resultat.kappa.n).toBe(3);
    expect(resultat.exclus_contestation).toBe(1);
  });

  it("deux ordres de navigation sur le même lot contesté le même jour donnent le même diagnostic", () => {
    const items = avecConteste();
    // Ordre 1 : a1 décide l'item avant la contestation, a2 le rencontre après et le voit retiré.
    const ordre1 = diagnostic(items, {
      a1: decisionsSauf("a1"),
      a2: [retraitDe("a2", CONTESTE), ...decisionsSauf("a2", [2])],
    });
    // Ordre 2 : les deux le décident avant la contestation, dans l'ordre inverse du lot.
    const ordre2 = diagnostic(items, {
      a1: decisionsSauf("a1").reverse(),
      a2: decisionsSauf("a2").reverse(),
    });
    expect(ordre2.kappa).toEqual(ordre1.kappa);
    expect(ordre2.kappa_par_question).toEqual(ordre1.kappa_par_question);
    expect(ordre2.exclus_contestation).toBe(ordre1.exclus_contestation);
    expect(ordre2.les_deux_ont_fini).toBe(ordre1.les_deux_ont_fini);
  });

  it("sans contestation : rien n'est exclu, et l'effectif est celui des items appariés", () => {
    const resultat = diagnostic(ITEMS, { a1: decisionsSauf("a1"), a2: decisionsSauf("a2") });
    expect(resultat.exclus_contestation).toBe(0);
    expect(resultat.kappa.n).toBe(4);
    expect(resultat.kappa.kappa).not.toBe(1);
  });

  it("effectif publié = items appariés moins items exclus pour contestation", () => {
    const resultat = diagnostic(avecConteste(), { a1: decisionsSauf("a1"), a2: decisionsSauf("a2") });
    const apparies = ITEMS.length;
    expect(resultat.kappa.n).toBe(apparies - resultat.exclus_contestation);
  });

  it("un retrait au journal sur un item non contesté au calcul n'exclut rien", () => {
    // Le journal ne décide plus du dénominateur : seul le statut lu au calcul compte.
    const resultat = diagnostic(ITEMS, {
      a1: [...decisionsSauf("a1"), retraitDe("a1", CONTESTE)],
      a2: decisionsSauf("a2"),
    });
    expect(resultat.exclus_contestation).toBe(0);
    expect(resultat.kappa.n).toBe(4);
  });
});

describe("contestation close (arbitree) : elle vise encore l'item (décision de l'auteur, option A)", () => {
  for (const issue of ["maintien", "correction", "retrait", "non_evaluabilite"]) {
    it(`item arbitré (${issue}) décidé par les deux : exclu du kappa`, () => {
      const items = avecConteste((item) => arbitrer(item, issue));
      const resultat = diagnostic(items, { a1: decisionsSauf("a1"), a2: decisionsSauf("a2") });
      expect(resultat.kappa.n).toBe(3);
      expect(resultat.exclus_contestation).toBe(1);
      expect(resultat.les_deux_ont_fini).toBe(true);
    });
  }

  it("un statut de contestation inconnu refuse le calcul, sans exclusion muette", () => {
    const items = avecConteste((item) => ({ ...item, statut_contestation: "suspendue" as Item["statut_contestation"] }));
    expect(() => diagnostic(items, { a1: decisionsSauf("a1"), a2: decisionsSauf("a2") })).toThrow(
      StatutContestationNonTranche,
    );
  });
});
