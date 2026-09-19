/**
 * Réannotation par lot supersédant (§4, « Réannotation »).
 *
 * Strictement sous 0,80 de kappa, un lot est réannoté après séance de calibration. Le lot de
 * réannotation porte les mêmes items, la référence du lot d'origine et la date de la séance,
 * sans laquelle son kappa n'est pas interprétable. Il **supersède** le lot d'origine : ses
 * décisions remplacent celles du lot d'origine pour les items concernés, le lot d'origine
 * reste publié mais ne compte plus.
 *
 * Ce que ces tests gardent : jamais un mélange des deux lots. Deux décisions concordantes dans
 * le lot d'origine et une seule dans le lot de réannotation valent « décisions insuffisantes »,
 * pas une promotion sur une paire dont on ne saurait pas de quel lot elle vient.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  adjacenceRespectee,
  LotDejaSupersede,
  LotIntrouvable,
  lotsApresSupersession,
  ordreAffichage,
  preparerReannotation,
} from "../validation/domaine/lot.ts";
import type { Decision, Item, ItemDuLot, Lot } from "../validation/domaine/types.ts";
import { lireLots } from "../validation/io/lots-fichier.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { decision, itemP, mesure } from "./aides/fabriques.ts";

const RACINE = resolve(import.meta.dirname, "..");

function executer(script: string, arguments_: readonly string[]) {
  const resultat = spawnSync(
    process.execPath,
    ["--experimental-strip-types", join(RACINE, script), ...arguments_],
    { encoding: "utf8" },
  );
  return {
    status: resultat.status === null ? -1 : resultat.status,
    sortie: resultat.stdout,
    erreur: resultat.stderr,
  };
}

function reference(candidat_id: string, rang: number): ItemDuLot {
  return {
    item_id: `${candidat_id}-${String(rang).padStart(3, "0")}`,
    item_version: 1,
    item_empreinte: "a".repeat(64),
    candidat_id,
  };
}

/** Six candidats, effectifs inégaux : un lot dont l'ordre d'affichage est réalisable. */
function origine(lot_id = "lot-003"): Lot {
  const items: ItemDuLot[] = [];
  [4, 3, 2, 2, 1, 1].forEach((effectif, index) => {
    const candidat = `cand-${String.fromCharCode(97 + index)}`;
    for (let rang = 0; rang < effectif; rang += 1) items.push(reference(candidat, rang));
  });
  return {
    lot_id,
    nature: "reel",
    graine_maitresse: `graine-${lot_id}`,
    algorithme_ordre: "ordre-annotateur-v1",
    date_creation: "2026-11-02T10:00:00+01:00",
    annotateurs: ["a1", "a2"],
    items,
  };
}

const DEMANDE = {
  graine_maitresse: "graine-reannotation",
  date_calibration: "2026-11-24",
  date_creation: "2026-11-25T09:00:00+01:00",
};

/* ------------------------------------------------------ composition, en domaine */

describe("composition d'un lot de réannotation", () => {
  it("2. refuse un lot d'origine inexistant, en nommant le lot demandé", () => {
    expect(() => preparerReannotation([origine()], { ...DEMANDE, origine_id: "lot-009" })).toThrow(
      LotIntrouvable,
    );
    expect(() => preparerReannotation([origine()], { ...DEMANDE, origine_id: "lot-009" })).toThrow(
      /lot-009/,
    );
  });

  it("3. porte exactement les mêmes items que le lot d'origine", () => {
    const source = origine();
    const lot = preparerReannotation([source], { ...DEMANDE, origine_id: source.lot_id });
    expect(lot.items).toHaveLength(source.items.length);
    expect(lot.items).toEqual(source.items);
  });

  it("4. porte sa nature, la référence du lot d'origine et la date de calibration", () => {
    const source = origine();
    const lot = preparerReannotation([source], { ...DEMANDE, origine_id: source.lot_id });
    expect(lot.nature).toBe("reannotation");
    expect(lot.reannote).toBe("lot-003");
    expect(lot.date_calibration).toBe("2026-11-24");
    expect(lot.lot_id).toBe("lot-003-r1");
    expect(lot.annotateurs).toEqual(source.annotateurs);
  });

  it("5. refuse de réannoter un lot déjà supersédé, en nommant le lot qui le supersède", () => {
    const source = origine();
    const premiere = preparerReannotation([source], { ...DEMANDE, origine_id: source.lot_id });
    expect(() =>
      preparerReannotation([source, premiere], { ...DEMANDE, origine_id: source.lot_id }),
    ).toThrow(LotDejaSupersede);
    expect(() =>
      preparerReannotation([source, premiere], { ...DEMANDE, origine_id: source.lot_id }),
    ).toThrow(/lot-003-r1/);
  });

  it("6. accepte de réannoter un lot de réannotation : la chaîne compte deux maillons", () => {
    const source = origine();
    const premiere = preparerReannotation([source], { ...DEMANDE, origine_id: source.lot_id });
    const seconde = preparerReannotation([source, premiere], { ...DEMANDE, origine_id: premiere.lot_id });
    expect(seconde.lot_id).toBe("lot-003-r2");
    expect(seconde.reannote).toBe("lot-003-r1");
    expect(seconde.items).toEqual(source.items);
  });

  it("8. l'ordre d'affichage du lot de réannotation reste calculable pour les deux annotateurs", () => {
    const source = origine();
    const lot = preparerReannotation([source], { ...DEMANDE, origine_id: source.lot_id });
    for (const annotateur of lot.annotateurs) {
      expect(adjacenceRespectee(ordreAffichage(lot, annotateur))).toBe(true);
    }
  });
});

/* ------------------------------------------------------------ `pnpm lots` */

describe("`pnpm lots --reannote`", () => {
  function preparerDepot(): Bac {
    const bac = creerBac();
    bac.ecrireLot(origine());
    return bac;
  }

  it("1. exige la date de séance de calibration, et n'écrit rien sans elle", () => {
    const bac = preparerDepot();
    try {
      const resultat = executer("outils/lots.ts", [
        `--lots=${join(bac.racine, "validation/lots")}`,
        `--staging=${join(bac.racine, "staging")}`,
        "--graine=graine-reannotation",
        "--reannote=lot-003",
      ]);
      expect(resultat.status).not.toBe(0);
      expect(`${resultat.sortie}${resultat.erreur}`).toMatch(/calibration/);
      expect(existsSync(join(bac.racine, "validation/lots/lot-003-r1.json"))).toBe(false);
    } finally {
      bac.detruire();
    }
  });

  it("7. sans --ecrire, décrit le lot sans rien écrire sur le disque", () => {
    const bac = preparerDepot();
    try {
      const resultat = executer("outils/lots.ts", [
        `--lots=${join(bac.racine, "validation/lots")}`,
        `--staging=${join(bac.racine, "staging")}`,
        "--graine=graine-reannotation",
        "--reannote=lot-003",
        "--calibration=2026-11-24",
      ]);
      expect(resultat.status).toBe(0);
      expect(resultat.sortie).toContain("lot-003-r1");
      expect(resultat.sortie).toContain("2026-11-24");
      expect(existsSync(join(bac.racine, "validation/lots/lot-003-r1.json"))).toBe(false);
    } finally {
      bac.detruire();
    }
  });

  it("écrit le manifeste avec --ecrire, et le lot d'origine reste intact", () => {
    const bac = preparerDepot();
    const chemin = join(bac.racine, "validation/lots/lot-003.json");
    const avant = readFileSync(chemin, "utf8");
    try {
      const resultat = executer("outils/lots.ts", [
        `--lots=${join(bac.racine, "validation/lots")}`,
        `--staging=${join(bac.racine, "staging")}`,
        "--graine=graine-reannotation",
        "--reannote=lot-003",
        "--calibration=2026-11-24",
        "--ecrire",
      ]);
      expect(resultat.status).toBe(0);
      const ecrit = JSON.parse(
        readFileSync(join(bac.racine, "validation/lots/lot-003-r1.json"), "utf8"),
      ) as Lot;
      expect(ecrit.nature).toBe("reannotation");
      expect(ecrit.reannote).toBe("lot-003");
      expect(ecrit.date_calibration).toBe("2026-11-24");
      expect(readFileSync(chemin, "utf8")).toBe(avant);
    } finally {
      bac.detruire();
    }
  });
});

/* --------------------------------------------- supersession, en domaine et dans promote */

describe("lotsApresSupersession", () => {
  it("retire du lot d'origine les seuls items repris par le lot de réannotation", () => {
    const source = origine();
    const premiers = source.items.slice(0, 3);
    const reannotation: Lot = {
      ...source,
      lot_id: "lot-003-r1",
      nature: "reannotation",
      reannote: "lot-003",
      date_calibration: "2026-11-24",
      items: premiers,
    };
    const effectifs = lotsApresSupersession([source, reannotation]);

    const ancien = effectifs.find((effectif) => effectif.lot.lot_id === "lot-003");
    expect(ancien?.items).toEqual(source.items.slice(3));
    expect(ancien?.supersede_par).toBe("lot-003-r1");

    const nouveau = effectifs.find((effectif) => effectif.lot.lot_id === "lot-003-r1");
    expect(nouveau?.items).toEqual(premiers);
    expect(nouveau?.supersede_par).toBeNull();
  });

  it("ne retient que le dernier maillon d'une chaîne de deux réannotations", () => {
    const source = origine();
    const premiere: Lot = { ...source, lot_id: "lot-003-r1", nature: "reannotation", reannote: "lot-003" };
    const seconde: Lot = { ...source, lot_id: "lot-003-r2", nature: "reannotation", reannote: "lot-003-r1" };
    const effectifs = lotsApresSupersession([source, premiere, seconde]);
    expect(effectifs.find((effectif) => effectif.lot.lot_id === "lot-003")?.items).toEqual([]);
    expect(effectifs.find((effectif) => effectif.lot.lot_id === "lot-003-r1")?.items).toEqual([]);
    expect(effectifs.find((effectif) => effectif.lot.lot_id === "lot-003-r2")?.items).toEqual(source.items);
  });
});

interface Jugement {
  readonly item: Item;
  readonly lot_id: string;
  readonly annotateurs: readonly string[];
  readonly sens: Decision;
}

function poserItem(bac: Bac, suffixe: string): Item {
  const item = itemP({
    id: `01JBANCESSAI00000ITEM${suffixe}`,
    candidat_id: `demo-${suffixe}`,
    mesure_id: `01JBANCESSAI0000MESURE${suffixe}`,
  });
  bac.ecrireItem(item);
  bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
  return item;
}

function juger(bac: Bac, jugement: Jugement): void {
  for (const annotateur of jugement.annotateurs) {
    bac.journal(annotateur).ajouter(
      jugement.lot_id,
      decision({
        annotateur_id: annotateur,
        item: jugement.item,
        decision: jugement.sens,
        lot_id: jugement.lot_id,
      }),
    );
  }
}

function reannotationDe(source: Lot, lot_id: string, items: readonly ItemDuLot[]): Lot {
  return {
    ...source,
    lot_id,
    nature: "reannotation",
    reannote: source.lot_id,
    date_calibration: "2026-11-24",
    graine_maitresse: `graine-${lot_id}`,
    items,
  };
}

function lancerPromote(bac: Bac) {
  return executer("outils/promote.ts", [
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
  ]);
}

/**
 * Une seule scène, quatre cas limites. Le lot `lot-003` juge trois items ; `lot-003-r1` en
 * reprend deux, dont un que seul `a1` rejuge. `pnpm promote` est lancé une fois, et chaque cas
 * lit la même sortie : la scène est le sujet, la lancer quatre fois ne dirait rien de plus.
 */
describe("supersession dans `pnpm promote`", () => {
  const bac = creerBac();
  const repris = poserItem(bac, "91");
  const incomplet = poserItem(bac, "92");
  const laisse = poserItem(bac, "93");
  const source = lotDe("lot-003", [repris, incomplet, laisse]);
  bac.ecrireLot(source);
  bac.ecrireLot(reannotationDe(source, "lot-003-r1", source.items.slice(0, 2)));

  for (const item of [repris, incomplet, laisse]) {
    juger(bac, { item, lot_id: "lot-003", annotateurs: ["a1", "a2"], sens: "accepter" });
  }
  juger(bac, { item: repris, lot_id: "lot-003-r1", annotateurs: ["a1", "a2"], sens: "rejeter" });
  juger(bac, { item: incomplet, lot_id: "lot-003-r1", annotateurs: ["a1"], sens: "rejeter" });

  const cheminOrigine = join(bac.racine, "validation/lots/lot-003.json");
  const manifesteAvant = readFileSync(cheminOrigine, "utf8");
  const resultat = lancerPromote(bac);
  afterAll(() => bac.detruire());

  it("9. un item jugé dans les deux lots n'est jugé que par le lot de réannotation", () => {
    expect(resultat.status).toBe(0);
    expect(resultat.sortie).toMatch(new RegExp(`${repris.id}\\s+rejete.*\\[lot-003-r1\\]`));
    expect(resultat.sortie).not.toMatch(new RegExp(`${repris.id}\\s+verifie`));
  });

  it("10. le manifeste du lot d'origine n'est pas modifié et reste lu", () => {
    expect(readFileSync(cheminOrigine, "utf8")).toBe(manifesteAvant);
    expect(
      lireLots(join(bac.racine, "validation/lots"))
        .map((lot) => lot.lot_id)
        .sort(),
    ).toEqual(["lot-003", "lot-003-r1"]);
    expect(resultat.sortie).toContain("lot-003 supersédé par lot-003-r1");
  });

  it("11. une seule décision dans le lot de réannotation ne se complète pas avec le lot d'origine", () => {
    expect(resultat.sortie).toContain("decisions_insuffisantes : 1");
    expect(resultat.sortie).not.toMatch(new RegExp(`${incomplet.id}\\s+(verifie|rejete)`));
  });

  it("13. un item absent du lot de réannotation garde les décisions du lot d'origine", () => {
    expect(resultat.sortie).toMatch(new RegExp(`${laisse.id}\\s+verifie.*\\[lot-003\\]`));
  });
});

describe("chaîne de réannotations", () => {
  it("12. dans une chaîne de deux réannotations, seules les décisions du dernier lot comptent", () => {
    const bac = creerBac();
    try {
      const item = poserItem(bac, "94");
      const source = lotDe("lot-004", [item]);
      const premiere = reannotationDe(source, "lot-004-r1", source.items);
      const seconde = reannotationDe(premiere, "lot-004-r2", source.items);
      for (const lot of [source, premiere, seconde]) bac.ecrireLot(lot);

      juger(bac, { item, lot_id: "lot-004", annotateurs: ["a1", "a2"], sens: "accepter" });
      juger(bac, { item, lot_id: "lot-004-r1", annotateurs: ["a1", "a2"], sens: "accepter" });
      juger(bac, { item, lot_id: "lot-004-r2", annotateurs: ["a1", "a2"], sens: "rejeter" });

      const resultat = lancerPromote(bac);
      expect(resultat.status).toBe(0);
      expect(resultat.sortie).toMatch(/À promouvoir : 1/);
      expect(resultat.sortie).toMatch(new RegExp(`${item.id}\\s+rejete.*\\[lot-004-r2\\]`));
      expect(resultat.sortie).not.toMatch(new RegExp(`${item.id}\\s+verifie`));
    } finally {
      bac.detruire();
    }
  });
});
