/**
 * Décision D42 (3) : la position qu'affirme la prémisse de la formulation orientée suit une règle
 * fixe par type d'item, sans choix à la main ni lecture du candidat. F ⇒ pour ; O ⇒ position de
 * l'état antérieur ; P ⇒ position de l'item ; A ⇒ aucune ; question sans item principal ⇒ aucune.
 */

import { describe, expect, it } from "vitest";
import {
  AUCUNE,
  ContenuItemAbsent,
  PositionNonAffirmable,
  positionAffirmeeDemandee,
} from "../../pipeline/reformulation/position-affirmee.ts";
import { positionEnVigueur } from "../../pipeline/questions/reponse-attendue.ts";
import type { Item } from "../../pipeline/questions/types.ts";
import { itemA, itemF, itemO, itemP, mesure } from "../questions/fabriques.ts";

const MESURE = mesure({ cle: "position-affirmee", formulation_canonique: "le budget" });

describe("position affirmée par la formulation orientée (D42 (3))", () => {
  it("cas limite 1 : item O dont l'état antérieur est conditionnel ⇒ conditionnel", () => {
    const item = itemO({ cle: "o-cond", candidat_id: "demo-alpha", mesure: MESURE, position: "conditionnel" });
    expect(positionAffirmeeDemandee(item)).toBe("conditionnel");
  });

  it("cas limite 2 : item O dont l'état postérieur est déjà en vigueur ⇒ toujours l'état antérieur, aucune date lue", () => {
    const item = itemO({
      cle: "o-passe",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      position: "pour",
      position_posterieure: "contre",
      date_changement: "2026-09-02",
    });
    expect(positionEnVigueur(item, "2026-12-01T06:00:00+01:00")).toBe("contre");
    expect(positionAffirmeeDemandee(item)).toBe("pour");
  });

  it("cas limite 3 : item P contre ⇒ contre", () => {
    const item = itemP({ cle: "p-contre", candidat_id: "demo-alpha", mesure: MESURE, position: "contre" });
    expect(positionAffirmeeDemandee(item)).toBe("contre");
  });

  it("cas limite 3 : item F ⇒ pour", () => {
    expect(positionAffirmeeDemandee(itemF({ cle: "f", candidat_id: "demo-alpha", mesure: MESURE }))).toBe("pour");
  });

  it("cas limite 3 : item A ⇒ aucune", () => {
    expect(positionAffirmeeDemandee(itemA({ cle: "a", candidat_id: "demo-alpha", mesure: MESURE }))).toBe(AUCUNE);
  });

  it("cas limite 3 : question d'attribution sans item principal ⇒ aucune", () => {
    expect(positionAffirmeeDemandee(undefined)).toBe(AUCUNE);
  });

  it("la règle ne lit pas le candidat : deux items identiques à leur candidat près donnent la même position", () => {
    const alpha = itemP({ cle: "p-sym", candidat_id: "demo-alpha", mesure: MESURE, position: "conditionnel" });
    const beta: Item = { ...alpha, candidat_id: "demo-beta" };
    expect(positionAffirmeeDemandee(beta)).toBe(positionAffirmeeDemandee(alpha));
  });

  it("item P sans assertion ⇒ erreur nommée, jamais une position par défaut", () => {
    const { assertion: _retiree, ...sansAssertion } = itemP({ cle: "p-vide", candidat_id: "demo-alpha", mesure: MESURE });
    expect(() => positionAffirmeeDemandee(sansAssertion)).toThrow(ContenuItemAbsent);
  });

  it("item O sans bloc d'obsolescence ⇒ erreur nommée", () => {
    const { obsolescence: _retire, ...sansBloc } = itemO({ cle: "o-vide", candidat_id: "demo-alpha", mesure: MESURE });
    expect(() => positionAffirmeeDemandee(sansBloc)).toThrow(ContenuItemAbsent);
  });

  it("item P « sans_objet » ⇒ erreur nommée : le prompt n'admet que pour, contre, conditionnel ou AUCUNE", () => {
    const item = itemP({ cle: "p-so", candidat_id: "demo-alpha", mesure: MESURE, position: "sans_objet" });
    expect(() => positionAffirmeeDemandee(item)).toThrow(PositionNonAffirmable);
  });

  it("item O dont l'état antérieur est hors vocabulaire ⇒ erreur nommée", () => {
    const item = itemO({ cle: "o-hors", candidat_id: "demo-alpha", mesure: MESURE });
    const obsolescence = item.obsolescence as NonNullable<Item["obsolescence"]>;
    const altere: Item = {
      ...item,
      obsolescence: { ...obsolescence, etat_anterieur: { ...obsolescence.etat_anterieur, position: "favorable" } },
    };
    expect(() => positionAffirmeeDemandee(altere)).toThrow(PositionNonAffirmable);
  });
});
