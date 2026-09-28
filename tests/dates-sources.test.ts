/**
 * Conformité n° 17 : les dates de validité suivent la date des sources (§4 : « Chaque item porte une
 * date de début de validité (date de la source) »).
 *
 * - item P : `valide_du` = `assertion.source.date_source`, sauf `valide_du_motif` ;
 * - item O : `obsolescence.date_changement` = `etat_posterieur.source.date_source`, sauf
 *   `obsolescence.date_changement_motif`.
 *
 * Protocole 0.13 (§4, « Cycle de vie et dates ») : « La source de référence est la citation pour un
 * item P, l'état antérieur pour un item O, dont la date du changement est celle de la source
 * postérieure, et la source de couverture pour un item A ; un item F, sans source, n'est pas
 * contraint. Une date qui diverge de sa source porte un motif publié. » D'où, en plus :
 *
 * - item O : `valide_du` = `obsolescence.etat_anterieur.source.date_source`, sauf `valide_du_motif` ;
 * - item A : `valide_du` = `absence.source_couverture_theme.date_source`, sauf `valide_du_motif` ;
 * - item F : jamais contrôlé.
 *
 * Les quatre dates sont des dates civiles `AAAA-MM-JJ` (`commun#/$defs/date_civile`) : elles se
 * comparent comme chaînes, sans fuseau ni conversion. JSON Schema ne compare pas deux champs ; le
 * contrôle vit dans `validation/domaine/dates-sources.ts` et `pnpm promote` l'applique
 * (`tests/promote-sources.test.ts`).
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  // Modifié ouvertement (protocole 0.13) : ce test affirmait que le `valide_du` d'un item O n'était
  // pas comparé, faute de règle (question ouverte). La 0.13 le rapporte à l'état antérieur ; les
  // cas de ce contrôle sont dans le bloc « item O : valide_du et date de l'état antérieur ».
  it("les deux contrôles d'un item O sont indépendants : deux écarts, dans l'ordre valide_du puis date_changement", () => {
    const item = { ...itemODate("2026-11-03", "2026-10-12"), valide_du: "2030-01-01" };
    expect(ecartsDeDates(item).map((ecart) => ecart.champ)).toEqual(["valide_du", "obsolescence.date_changement"]);
  });
});

/**
 * Item O dont `valide_du` vaut `valideDu` et l'état antérieur est daté `dateSource` ; la date du
 * changement suit la source postérieure, pour que seul `valide_du` soit en jeu.
 */
function itemOValideDu(valideDu: string, dateSource: string, motif?: string): Item {
  const bloc = defini(itemODate("2026-11-03", "2026-11-03").obsolescence);
  return itemO({
    valide_du: valideDu,
    ...(motif === undefined ? {} : { valide_du_motif: motif }),
    obsolescence: {
      ...bloc,
      etat_anterieur: { ...bloc.etat_anterieur, source: source({ ...bloc.etat_anterieur.source, date_source: dateSource }) },
    },
  });
}

describe("item O : valide_du et date de l'état antérieur (protocole 0.13)", () => {
  it("égales : aucun écart", () => {
    expect(ecartsDeDates(itemOValideDu("2026-06-15", "2026-06-15"))).toEqual([]);
  });

  it("valide_du ≠ date de l'état antérieur sans motif : un écart, qui nomme les deux dates", () => {
    expect(ecartsDeDates(itemOValideDu("2026-06-15", "2026-09-01"))).toEqual([
      {
        champ: "valide_du",
        date: "2026-06-15",
        champ_source: "obsolescence.etat_anterieur.source.date_source",
        date_source: "2026-09-01",
        champ_motif: "valide_du_motif",
      },
    ]);
  });

  it("valide_du ≠ date de l'état antérieur avec motif : aucun écart", () => {
    expect(ecartsDeDates(itemOValideDu("2026-06-15", "2026-09-01", "Position tenue depuis le congrès de juin 2026."))).toEqual([]);
  });

  it("la date de l'état postérieur ne sert pas de référence à valide_du", () => {
    const bloc = defini(itemO().obsolescence);
    const item = itemO({
      valide_du: "2026-10-12",
      obsolescence: {
        ...bloc,
        date_changement: "2026-10-12",
        etat_anterieur: { ...bloc.etat_anterieur, source: source({ ...bloc.etat_anterieur.source, date_source: "2026-09-01" }) },
        etat_posterieur: { ...bloc.etat_posterieur, source: source({ ...bloc.etat_posterieur.source, date_source: "2026-10-12" }) },
      },
    });
    expect(ecartsDeDates(item).map((ecart) => ecart.champ_source)).toEqual(["obsolescence.etat_anterieur.source.date_source"]);
  });
});

/** Item A dont `valide_du` vaut `valideDu` et la source de couverture est datée `dateSource`. */
function itemAValideDu(valideDu: string, dateSource: string, motif?: string): Item {
  const bloc = defini(itemA().absence);
  return itemA({
    valide_du: valideDu,
    ...(motif === undefined ? {} : { valide_du_motif: motif }),
    absence: { ...bloc, source_couverture_theme: source({ ...bloc.source_couverture_theme, date_source: dateSource }) },
  });
}

describe("item A : valide_du et date de la source de couverture (protocole 0.13)", () => {
  it("égales : aucun écart", () => {
    expect(ecartsDeDates(itemAValideDu("2026-09-01", "2026-09-01"))).toEqual([]);
  });

  it("valide_du ≠ date de la source de couverture sans motif : un écart, qui nomme les deux dates", () => {
    expect(ecartsDeDates(itemAValideDu("2030-01-01", "2026-09-01"))).toEqual([
      {
        champ: "valide_du",
        date: "2030-01-01",
        champ_source: "absence.source_couverture_theme.date_source",
        date_source: "2026-09-01",
        champ_motif: "valide_du_motif",
      },
    ]);
  });

  it("valide_du ≠ date de la source de couverture avec motif : aucun écart", () => {
    expect(ecartsDeDates(itemAValideDu("2030-01-01", "2026-09-01", "Programme publié le 1er septembre, examiné en janvier."))).toEqual([]);
  });
});

describe("item F", () => {
  // Modifié ouvertement (protocole 0.13) : ce bloc couvrait aussi l'item A, désormais contrôlé.
  it("n'a aucun contrôle de date : sans source, il n'est pas contraint", () => {
    expect(ecartsDeDates(itemF({ valide_du: "2030-01-01" }))).toEqual([]);
  });
});

describe("exemples valides d'item (protocole 0.13)", () => {
  const repertoire = resolve(import.meta.dirname, "../schema/exemples/item");
  const valides = readdirSync(repertoire).filter((nom) => nom.startsWith("valide-")).sort();

  for (const nom of valides) {
    it(`${nom} : ses dates suivent ses sources, ou portent leur motif`, () => {
      const item = JSON.parse(readFileSync(resolve(repertoire, nom), "utf8")) as Item;
      expect(ecartsDeDates(item).map((ecart) => decrireEcart(item.id, ecart))).toEqual([]);
    });
  }
});
