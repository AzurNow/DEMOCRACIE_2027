/**
 * File des notifications dues (protocole 0.10, §4 : « Tout ce qui est publié sur un item est
 * notifié, décisions du panel comprises » ; lot contestation-notification, V4) : exactement une
 * ligne par événement, écrite au même --ecrire que l'item ; aucune en simulation ; rejeté et non
 * évaluable compris ; ajout seul, identifiants uniques, ligne interrompue refusée.
 */

import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Item } from "../validation/domaine/types.ts";
import { ajouterDues, cheminDues, FileNotificationsIllisible, lireDues, notificationDue } from "../validation/io/notifications-dues.ts";
import { creerBac, lotDe } from "./aides/bac.ts";
import { itemConteste, itemPromu } from "./aides/data.ts";
import { commiterTout, executerOutil, head, initialiserDepot } from "./aides/depot.ts";
import { decision, itemP, mesure } from "./aides/fabriques.ts";

describe("file dues.jsonl", () => {
  const repertoire = mkdtempSync(join(tmpdir(), "banc-dues-"));
  afterAll(() => rmSync(repertoire, { recursive: true, force: true }));

  it("date la notification par la dernière entrée d'historique de l'item écrit", () => {
    const item = itemConteste(itemPromu());
    const due = notificationDue(item, "contestation");
    const derniere = item.historique?.[item.historique.length - 1] as { date: string; commit: string };
    expect(due).toMatchObject({ item_id: item.id, candidat_id: item.candidat_id, evenement: "contestation", date: derniere.date, commit: derniere.commit });
  });

  it("ajoute en fin de file, refuse un identifiant déjà présent", () => {
    const due = notificationDue(itemPromu(), "creation");
    ajouterDues(repertoire, [due]);
    expect(lireDues(repertoire)).toEqual([due]);
    expect(() => ajouterDues(repertoire, [due])).toThrow(FileNotificationsIllisible);
    expect(lireDues(repertoire)).toHaveLength(1);
  });

  it("une ligne interrompue arrête la lecture", () => {
    appendFileSync(cheminDues(repertoire), '{"id":', "utf8");
    expect(() => lireDues(repertoire)).toThrow(/interrompue/);
  });
});

describe("une ligne due par événement, au même --ecrire", () => {
  const bac = creerBac();
  const verifie = itemP({ id: "01JBANCESSA1000000000TEM81", candidat_id: "demo-81" });
  const rejete = itemP({ id: "01JBANCESSA1000000000TEM82", candidat_id: "demo-82" });
  for (const item of [verifie, rejete]) {
    bac.ecrireItem(item);
    bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
  }
  bac.ecrireLot(lotDe("lot-081", [verifie, rejete]));
  for (const annotateur_id of ["a1", "a2"]) {
    bac.journal(annotateur_id).ajouter("lot-081", decision({ annotateur_id, item: verifie, decision: "accepter", lot_id: "lot-081" }));
    bac.journal(annotateur_id).ajouter("lot-081", decision({ annotateur_id, item: rejete, decision: "rejeter", lot_id: "lot-081" }));
  }
  initialiserDepot(bac.racine);
  const notifications = join(bac.racine, "validation/notifications");
  const racine = [`--racine=${bac.racine}`, `--data=${join(bac.racine, "data/items")}`];
  const promote = [
    ...racine,
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--arbitrage=${join(bac.racine, "validation/arbitrage")}`,
  ];

  executerOutil("promote.ts", promote);
  const apresSimulation = lireDues(notifications);
  const commitPromotion = head(bac.racine);
  const promotion = executerOutil("promote.ts", [...promote, "--ecrire"]);
  const apresPromotion = lireDues(notifications);
  commiterTout(bac.racine, "promotion");

  writeFileSync(join(bac.racine, "contestation.txt"), "Contestation.\n", "utf8");
  writeFileSync(join(bac.racine, "motivation.txt"), "Motivation.\n", "utf8");
  commiterTout(bac.racine, "fichiers");
  const contestation = [...racine, `--item=${verifie.id}`, `--texte-fichier=${join(bac.racine, "contestation.txt")}`, "--recu-le=2026-10-01T09:00:00+02:00", "--type=campagne"];
  executerOutil("contester.ts", contestation);
  const apresSimulationContestation = lireDues(notifications);
  executerOutil("contester.ts", [...contestation, "--ecrire"]);
  const apresContestation = lireDues(notifications);
  commiterTout(bac.racine, "contestation");

  const publie = lireItem(join(bac.racine, "data/items", `${verifie.id}.json`));
  const contestation_id = (publie.contestations?.[0] as { id: string }).id;
  const panel = executerOutil("panel.ts", [
    ...racine,
    `--item=${verifie.id}`,
    `--contestation=${contestation_id}`,
    "--decision=maintien",
    "--version-jugee=1",
    `--motivation-fichier=${join(bac.racine, "motivation.txt")}`,
    "--arbitre-seul",
    "--ecrire",
  ]);
  const apresPanel = lireDues(notifications);
  afterAll(() => bac.detruire());

  it("la simulation n'écrit aucune ligne", () => {
    expect(apresSimulation).toEqual([]);
    expect(apresSimulationContestation).toHaveLength(2);
  });

  it("promote : une ligne « creation » par item écrit, rejeté compris, datée du commit inscrit dans l'item", () => {
    expect(promotion.status, promotion.erreur).toBe(0);
    expect(apresPromotion.map((due) => [due.item_id, due.evenement]).sort()).toEqual([
      [verifie.id, "creation"],
      [rejete.id, "creation"],
    ]);
    expect(apresPromotion.every((due) => due.commit === commitPromotion)).toBe(true);
    expect(promotion.sortie).toMatch(/git add data\/items validation\/notifications\/dues\.jsonl/);
  });

  it("contester : exactement une ligne « contestation »", () => {
    expect(apresContestation.slice(2).map((due) => due.evenement)).toEqual(["contestation"]);
  });

  it("panel : exactement une ligne « decision_panel »", () => {
    expect(panel.status, panel.erreur).toBe(0);
    expect(apresPanel.slice(3).map((due) => [due.item_id, due.evenement])).toEqual([[verifie.id, "decision_panel"]]);
  });
});

function lireItem(chemin: string): Item {
  return JSON.parse(readFileSync(chemin, "utf8")) as Item;
}
