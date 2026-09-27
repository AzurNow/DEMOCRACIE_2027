/**
 * Conformité n° 17 : les dates de validité suivent la date des sources (§4 : « Chaque item porte une
 * date de début de validité (date de la source) »).
 *
 * - item P : `valide_du` = `assertion.source.date_source`, sauf `valide_du_motif` ;
 * - item O : `obsolescence.date_changement` = `etat_posterieur.source.date_source`, sauf
 *   `obsolescence.date_changement_motif`.
 *
 * Les quatre dates sont des dates civiles `AAAA-MM-JJ` (`commun#/$defs/date_civile`) : elles se
 * comparent comme chaînes, sans fuseau ni conversion. JSON Schema ne compare pas deux champs ; le
 * contrôle vit dans `validation/domaine/dates-sources.ts` et `pnpm promote` l'applique
 * (`tests/promote-sources.test.ts`).
 */

import { describe, expect, it } from "vitest";
import { decrireEcart, ecartsDeDates } from "../validation/domaine/dates-sources.ts";
import type { Item } from "../validation/domaine/types.ts";
import { itemA, itemF, itemO, itemP, source } from "./aides/fabriques.ts";

function defini<T>(valeur: T | undefined): T {
  if (valeur === undefined) throw new Error("Valeur attendue, absente.");
  return valeur;
}

/** Item O dont la date de changement vaut `date` et la source postérieure est datée `dateSource`. */
function itemODate(date: string, dateSource: string, motif?: string): Item {
  const bloc = defini(itemO().obsolescence);
  return itemO({
    obsolescence: {
      ...bloc,
      date_changement: date,
      ...(motif === undefined ? {} : { date_changement_motif: motif }),
      etat_posterieur: { ...bloc.etat_posterieur, source: source({ ...bloc.etat_posterieur.source, date_source: dateSource }) },
    },
  });
}

describe("item P : valide_du et date de la source", () => {
  it("égaux : aucun écart", () => {
    expect(ecartsDeDates(itemP())).toEqual([]);
  });

  it("valide_du ≠ date de la source sans motif : un écart, qui nomme les deux dates", () => {
    const item = itemP({ valide_du: "2026-09-15" });
    expect(ecartsDeDates(item)).toEqual([
      {
        champ: "valide_du",
        date: "2026-09-15",
        champ_source: "assertion.source.date_source",
        date_source: "2026-09-01",
        champ_motif: "valide_du_motif",
      },
    ]);
  });

  it("valide_du ≠ date de la source avec motif : aucun écart", () => {
    const item = itemP({ valide_du: "2027-01-01", valide_du_motif: "Mesure annoncée pour le 1er janvier 2027." });
    expect(ecartsDeDates(item)).toEqual([]);
  });

  it("un jour d'écart suffit : aucune tolérance", () => {
    expect(ecartsDeDates(itemP({ valide_du: "2026-09-02" }))).toHaveLength(1);
  });

  it("le message nomme l'item, les deux champs, les deux dates et le motif qui manque", () => {
    const item = itemP({ valide_du: "2026-09-15" });
    const [ecart] = ecartsDeDates(item);
    expect(decrireEcart(item.id, defini(ecart))).toBe(
      `Item ${item.id} : valide_du 2026-09-15 ≠ assertion.source.date_source 2026-09-01, ` +
        "sans valide_du_motif (§4, conformité n° 17)",
    );
  });
});

describe("item O : date_changement et date de la source postérieure", () => {
  it("égales : aucun écart", () => {
    expect(ecartsDeDates(itemODate("2026-11-03", "2026-11-03"))).toEqual([]);
  });

  it("date_changement sans rapport avec la source postérieure : un écart", () => {
    expect(ecartsDeDates(itemODate("2026-11-03", "2026-10-12"))).toEqual([
      {
        champ: "obsolescence.date_changement",
        date: "2026-11-03",
        champ_source: "obsolescence.etat_posterieur.source.date_source",
        date_source: "2026-10-12",
        champ_motif: "obsolescence.date_changement_motif",
      },
    ]);
  });

  it("date_changement différente avec motif : aucun écart", () => {
    expect(ecartsDeDates(itemODate("2026-11-03", "2026-10-12", "Retrait annoncé le 12 octobre, effectif le 3 novembre."))).toEqual([]);
  });

  it("valide_du d'un item O n'est pas comparé : le §4 ne dit pas à quelle source il se rapporte (question ouverte)", () => {
    expect(ecartsDeDates({ ...itemODate("2026-11-03", "2026-11-03"), valide_du: "2030-01-01" })).toEqual([]);
  });
});

describe("items A et F", () => {
  it("n'ont aucun contrôle de date : pas d'assertion, pas d'état postérieur", () => {
    expect(ecartsDeDates(itemA({ valide_du: "2030-01-01" }))).toEqual([]);
    expect(ecartsDeDates(itemF({ valide_du: "2030-01-01" }))).toEqual([]);
  });
});
