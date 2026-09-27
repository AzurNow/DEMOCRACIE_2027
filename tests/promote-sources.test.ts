/**
 * `pnpm promote` et les sources des items, dans un bac d'essai :
 *
 * - conformité n° 17 : un item à promouvoir dont `valide_du` (item P) ou `date_changement` (item O)
 *   ne suit pas la date de sa source, sans motif, bloque la commande ; le rapport nomme l'item et
 *   les deux dates. Le contrôle porte sur l'item tel qu'il serait écrit, corrections comprises ;
 * - conformité n° 12 : un item T2 que les deux annotateurs ont écouté est écrit dans `data/` avec
 *   l'attestation des deux, et `creerItem` le revalide contre `item.schema.json`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Correction, Item, QuestionsSpecifiques } from "../validation/domaine/types.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { executerOutil, initialiserDepot } from "./aides/depot.ts";
import { decision, itemO, itemP, mesure, source } from "./aides/fabriques.ts";

function defini<T>(valeur: T | undefined): T {
  if (valeur === undefined) throw new Error("Valeur attendue, absente.");
  return valeur;
}

function chemins(bac: Bac): readonly string[] {
  return [
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--arbitrage=${join(bac.racine, "validation/arbitrage")}`,
    `--data=${join(bac.racine, "data/items")}`,
  ];
}

interface Jugement {
  readonly specifiques?: QuestionsSpecifiques;
  readonly corrections?: readonly Correction[];
}

/** Un bac portant un seul item, jugé par a1 et a2 de la même façon. */
function bacAvec(item: Item, lot_id: string, jugement: Jugement = {}): Bac {
  const bac = creerBac();
  bac.ecrireItem(item);
  bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
  bac.ecrireLot(lotDe(lot_id, [item]));
  for (const annotateur_id of ["a1", "a2"]) {
    const corrige = jugement.corrections !== undefined;
    bac.journal(annotateur_id).ajouter(
      lot_id,
      decision({
        annotateur_id,
        item,
        lot_id,
        decision: corrige ? "corriger" : "accepter",
        ...(jugement.specifiques === undefined ? {} : { questions_specifiques: jugement.specifiques }),
        ...(corrige ? { corrections: jugement.corrections } : {}),
      }),
    );
  }
  return bac;
}

function simuler(bac: Bac) {
  return executerOutil("promote.ts", chemins(bac));
}

/** Item O aux deux états T1 : seules les dates sont en jeu, pas la question d'écoute. */
function itemODates(id: string, date_changement: string, date_source_posterieure: string): Item {
  const bloc = defini(itemO().obsolescence);
  return itemO({
    id,
    candidat_id: `demo-${id.slice(-2).toLowerCase()}`,
    obsolescence: {
      ...bloc,
      date_changement,
      etat_posterieur: { ...bloc.etat_posterieur, source: source({ date_source: date_source_posterieure }) },
    },
  });
}

const CHANGEMENT = { changement_explicite: true };

/* ------------------------------------------------------------------ n° 17 */

describe("item P : valide_du ≠ date de la source, sans motif", () => {
  const item = itemP({ id: "01JBANCESSA1000000000TEMD1", candidat_id: "demo-d1", valide_du: "2026-09-15" });
  const bac = bacAvec(item, "lot-0d1");
  const resultat = simuler(bac);
  afterAll(() => bac.detruire());

  it("la promotion est refusée, et le rapport nomme l'item et les deux dates", () => {
    expect(resultat.status).toBe(1);
    expect(resultat.sortie).toMatch(/Items à promouvoir dont les dates ne suivent pas leurs sources : 1/);
    expect(resultat.sortie).toContain(
      `Item ${item.id} : valide_du 2026-09-15 ≠ assertion.source.date_source 2026-09-01, sans valide_du_motif`,
    );
    expect(resultat.erreur).toMatch(/rien n'est\s+écrit dans data/);
  });
});

describe("item P : valide_du ≠ date de la source, avec motif", () => {
  const item = itemP({
    id: "01JBANCESSA1000000000TEMD2",
    candidat_id: "demo-d2",
    valide_du: "2027-01-01",
    valide_du_motif: "Mesure annoncée pour application au 1er janvier 2027.",
  });
  const bac = bacAvec(item, "lot-0d2");
  const resultat = simuler(bac);
  afterAll(() => bac.detruire());

  it("la promotion est acceptée", () => {
    expect(resultat.status, resultat.sortie + resultat.erreur).toBe(0);
    expect(resultat.sortie).toMatch(new RegExp(`${item.id}\\s+verifie`));
  });
});

describe("item O : date_changement sans rapport avec la source postérieure", () => {
  const item = itemODates("01JBANCESSA1000000000TEMD3", "2026-11-03", "2026-10-12");
  const bac = bacAvec(item, "lot-0d3", { specifiques: CHANGEMENT });
  const resultat = simuler(bac);
  afterAll(() => bac.detruire());

  it("la promotion est refusée, et le rapport nomme l'item et les deux dates", () => {
    expect(resultat.status).toBe(1);
    expect(resultat.sortie).toContain(
      `Item ${item.id} : obsolescence.date_changement 2026-11-03 ≠ ` +
        "obsolescence.etat_posterieur.source.date_source 2026-10-12, sans obsolescence.date_changement_motif",
    );
  });
});

describe("item O : date_changement égale à la date de la source postérieure", () => {
  const item = itemODates("01JBANCESSA1000000000TEMD4", "2026-11-03", "2026-11-03");
  const bac = bacAvec(item, "lot-0d4", { specifiques: CHANGEMENT });
  const resultat = simuler(bac);
  afterAll(() => bac.detruire());

  it("la promotion est acceptée", () => {
    expect(resultat.status, resultat.sortie + resultat.erreur).toBe(0);
    expect(resultat.sortie).toMatch(new RegExp(`${item.id}\\s+verifie`));
  });
});

describe("item O : les deux annotateurs corrigent date_changement vers une valeur sans rapport", () => {
  const item = itemODates("01JBANCESSA1000000000TEMD5", "2026-11-03", "2026-11-03");
  const correction: Correction = {
    cible: "item",
    chemin: "/obsolescence/date_changement",
    ancienne_valeur: "2026-11-03",
    nouvelle_valeur: "2026-06-01",
  };
  const bac = bacAvec(item, "lot-0d5", { specifiques: CHANGEMENT, corrections: [correction] });
  const resultat = simuler(bac);
  afterAll(() => bac.detruire());

  it("la promotion est refusée : le contrôle porte sur l'item corrigé", () => {
    expect(resultat.status).toBe(1);
    expect(resultat.sortie).toMatch(new RegExp(`${item.id}\\s+verifie, corrections appliquées`));
    expect(resultat.sortie).toContain(
      `Item ${item.id} : obsolescence.date_changement 2026-06-01 ≠ obsolescence.etat_posterieur.source.date_source 2026-11-03`,
    );
  });
});

/* ------------------------------------------------------------------ n° 12 */

describe("promote --ecrire d'un item T2 écouté par les deux annotateurs", () => {
  const base = itemP();
  const item = itemP({
    id: "01JBANCESSA1000000000TEMT2",
    candidat_id: "demo-t2",
    assertion: {
      ...defini(base.assertion),
      source: source({
        tier: "T2",
        type_document: "enregistrement_video",
        url: "https://demo.invalid/emission",
        extrait: { debut: "00:42:10", fin: "00:43:05" },
      }),
    },
  });
  const bac = bacAvec(item, "lot-0t2", { specifiques: { transcription_ecoutee: true } });
  initialiserDepot(bac.racine);
  const resultat = executerOutil("promote.ts", [`--racine=${bac.racine}`, ...chemins(bac), "--ecrire"]);
  afterAll(() => bac.detruire());

  it("écrit l'item vérifié avec les deux vérificateurs de la transcription et la date", () => {
    expect(resultat.status, resultat.sortie + resultat.erreur).toBe(0);
    const promu = JSON.parse(readFileSync(join(bac.racine, "data/items", `${item.id}.json`), "utf8")) as Item;
    expect(promu.statut_validation).toBe("verifie");
    expect(defini(promu.assertion).source.transcription_verifiee_par).toEqual(["a1", "a2"]);
    // Les deux décisions de la fabrique sont horodatées 2026-09-20T10:00:00+02:00.
    expect(defini(promu.assertion).source.transcription_verifiee_le).toBe("2026-09-20");
  });
});
