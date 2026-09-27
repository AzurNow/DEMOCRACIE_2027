/**
 * Conformité n° 19 : le comptage des items P qui décide du seuil de couverture du §4.
 *
 * Décision de l'auteur du 2026-09-27 : compte pour le seuil un item P qui pourrait entrer au
 * tirage à l'instant de gel — vérifié, en vigueur au gel (intervalle semi-ouvert, date civile à
 * minuit UTC), et non contesté ou dont la dernière décision du panel est un maintien ou une
 * correction. Chaque cas limite de la liste du brief a son test nommé.
 */

import { describe, expect, it } from "vitest";
import { DecisionPanelPosterieureAuGel } from "../../pipeline/questions/contestation.ts";
import { itemPCompteAuGel, itemsPComptesAuGel } from "../../pipeline/questions/couverture.ts";
import type { Item } from "../../pipeline/questions/types.ts";
import { arbitre, contestation, itemA, itemF, itemO, itemP, mesure } from "./fabriques.ts";

const GEL = "2026-11-20T10:00:00Z";
const CANDIDAT = "demo-alpha";
const AUTRE = "demo-beta";
const MESURE = mesure({ cle: "couverture", theme: "sante" });
const AVANT_GEL = "2026-10-01T10:00:00+02:00";

function p(cle: string, options: Partial<Parameters<typeof itemP>[0]> = {}): Item {
  return itemP({ cle: `couverture-${cle}`, candidat_id: CANDIDAT, mesure: MESURE, ...options });
}

function nItems(n: number, prefixe: string): readonly Item[] {
  return Array.from({ length: n }, (_, rang) => p(`${prefixe}-${rang}`));
}

describe("itemPCompteAuGel : un item, les cas limites du brief", () => {
  it("compte un item P vérifié, en vigueur, non contesté", () => {
    expect(itemPCompteAuGel(p("nominal"), CANDIDAT, GEL)).toBe(true);
  });

  it("ne compte pas un item P contesté en attente de décision", () => {
    expect(itemPCompteAuGel(p("conteste", { statut_contestation: "contestee" }), CANDIDAT, GEL)).toBe(false);
  });

  it("compte un item P arbitré par un maintien", () => {
    const item = arbitre(p("maintien"), [contestation("cv-maintien", "maintien", AVANT_GEL)]);
    expect(itemPCompteAuGel(item, CANDIDAT, GEL)).toBe(true);
  });

  it("compte un item P arbitré par une correction", () => {
    const item = arbitre(p("correction"), [contestation("cv-correction", "correction", AVANT_GEL)]);
    expect(itemPCompteAuGel(item, CANDIDAT, GEL)).toBe(true);
  });

  it("ne compte pas un item P retiré par le panel", () => {
    const item = arbitre(p("retrait", { statut_validation: "retire_par_panel" }), [
      contestation("cv-retrait", "retrait", AVANT_GEL),
    ]);
    expect(itemPCompteAuGel(item, CANDIDAT, GEL)).toBe(false);
  });

  it("ne compte pas un item P dont la décision de retrait laisse le statut vérifié (la décision fait foi)", () => {
    const item = arbitre(p("retrait-verifie"), [contestation("cv-retrait-v", "retrait", AVANT_GEL)]);
    expect(itemPCompteAuGel(item, CANDIDAT, GEL)).toBe(false);
  });

  it("ne compte pas un item P dont valide_au tombe exactement sur l'instant de gel (semi-ouvert)", () => {
    const gelMinuit = "2026-11-20T00:00:00Z";
    const item = p("valide-au-gel", { valide_du: "2026-09-01", valide_au: "2026-11-20" });
    expect(itemPCompteAuGel(item, CANDIDAT, gelMinuit)).toBe(false);
  });

  it("ne compte pas un item P dont valide_au est le jour du gel, gel à 10 h UTC", () => {
    const item = p("valide-au-jour-gel", { valide_du: "2026-09-01", valide_au: "2026-11-20" });
    expect(itemPCompteAuGel(item, CANDIDAT, GEL)).toBe(false);
  });

  it("compte un item P dont valide_du tombe exactement sur l'instant de gel", () => {
    const gelMinuit = "2026-11-20T00:00:00Z";
    const item = p("valide-du-gel", { valide_du: "2026-11-20" });
    expect(itemPCompteAuGel(item, CANDIDAT, gelMinuit)).toBe(true);
  });

  it("ne compte pas un item P dont valide_du est le lendemain du gel", () => {
    const item = p("valide-du-lendemain", { valide_du: "2026-11-21" });
    expect(itemPCompteAuGel(item, CANDIDAT, GEL)).toBe(false);
  });

  it("ne compte pas un item P non vérifié", () => {
    expect(itemPCompteAuGel(p("en-attente", { statut_validation: "en_attente" }), CANDIDAT, GEL)).toBe(false);
  });

  it("ne compte ni un item O, ni un item A, ni un item F, même vérifiés et en vigueur", () => {
    const options = { candidat_id: CANDIDAT, mesure: MESURE };
    expect(itemPCompteAuGel(itemO({ cle: "cv-o", ...options }), CANDIDAT, GEL)).toBe(false);
    expect(itemPCompteAuGel(itemA({ cle: "cv-a", ...options }), CANDIDAT, GEL)).toBe(false);
    expect(itemPCompteAuGel(itemF({ cle: "cv-f", ...options }), CANDIDAT, GEL)).toBe(false);
  });

  it("ne compte pas l'item P d'un autre candidat", () => {
    const item = itemP({ cle: "cv-autre", candidat_id: AUTRE, mesure: MESURE });
    expect(itemPCompteAuGel(item, CANDIDAT, GEL)).toBe(false);
  });

  it("refuse, comme le tirage, une dernière décision du panel datée après le gel", () => {
    const item = arbitre(p("apres-gel"), [contestation("cv-apres", "maintien", "2026-11-21T10:00:00+01:00")]);
    expect(() => itemPCompteAuGel(item, CANDIDAT, GEL)).toThrow(DecisionPanelPosterieureAuGel);
  });
});

describe("itemsPComptesAuGel : le total d'un candidat", () => {
  it("compte exactement 9 items", () => {
    expect(itemsPComptesAuGel(nItems(9, "neuf"), CANDIDAT, GEL)).toBe(9);
  });

  it("compte exactement 10 items", () => {
    expect(itemsPComptesAuGel(nItems(10, "dix"), CANDIDAT, GEL)).toBe(10);
  });

  it("n'ajoute au total ni les items exclus ni ceux des autres candidats", () => {
    const options = { candidat_id: CANDIDAT, mesure: MESURE };
    const items = [
      ...nItems(10, "melange"),
      p("m-conteste", { statut_contestation: "contestee" }),
      p("m-expire", { valide_au: "2026-11-20" }),
      itemO({ cle: "m-o", ...options }),
      itemA({ cle: "m-a", ...options }),
      itemF({ cle: "m-f", ...options }),
      itemP({ cle: "m-autre", candidat_id: AUTRE, mesure: MESURE }),
      arbitre(p("m-maintien"), [contestation("m-maintien", "maintien", AVANT_GEL)]),
    ];
    expect(itemsPComptesAuGel(items, CANDIDAT, GEL)).toBe(11);
  });

  it("rend 0 pour un candidat sans item, jamais une absence", () => {
    expect(itemsPComptesAuGel([], CANDIDAT, GEL)).toBe(0);
  });

  it("signale un arbitrage illisible d'un item du candidat au lieu de l'ignorer", () => {
    const illisible = { ...p("illisible"), statut_contestation: "arbitree" as const, contestations: [{}] };
    expect(() => itemsPComptesAuGel([illisible], CANDIDAT, GEL)).toThrow();
  });
});
