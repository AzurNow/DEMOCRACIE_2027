/**
 * `pnpm promote --ecrire`, exercé dans un dépôt Git jetable (lot contestation-notification, V1) :
 * l'écriture passe par `creerItem`, exige un arbre propre, inscrit HEAD dans l'historique, ne
 * commite rien, et une relance est sans effet sur un item déjà publié.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Item } from "../validation/domaine/types.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { commiterTout, executerOutil, head, initialiserDepot } from "./aides/depot.ts";
import { decision, itemP, mesure } from "./aides/fabriques.ts";

function chemins(bac: Bac): readonly string[] {
  return [
    `--racine=${bac.racine}`,
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--arbitrage=${join(bac.racine, "validation/arbitrage")}`,
    `--data=${join(bac.racine, "data/items")}`,
  ];
}

function preparer(): { bac: Bac; item: Item } {
  const bac = creerBac();
  const item = itemP({ id: "01JBANCESSA1000000000TEM51", candidat_id: "demo-51" });
  bac.ecrireItem(item);
  bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
  bac.ecrireLot(lotDe("lot-051", [item]));
  for (const annotateur_id of ["a1", "a2"]) {
    bac.journal(annotateur_id).ajouter("lot-051", decision({ annotateur_id, item, decision: "accepter", lot_id: "lot-051" }));
  }
  initialiserDepot(bac.racine);
  return { bac, item };
}

describe("promote --ecrire sur un arbre non propre", () => {
  const { bac, item } = preparer();
  writeFileSync(join(bac.racine, "brouillon.txt"), "modification non commitée\n", "utf8");
  const resultat = executerOutil("promote.ts", [...chemins(bac), "--ecrire"]);
  afterAll(() => bac.detruire());

  it("refuse, et n'écrit rien dans data/", () => {
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toMatch(/Arbre Git non propre/);
    expect(() => readFileSync(join(bac.racine, "data/items", `${item.id}.json`))).toThrow();
  });
});

describe("promote --ecrire sur un arbre propre", () => {
  const { bac, item } = preparer();
  const commit = head(bac.racine);
  const premiere = executerOutil("promote.ts", [...chemins(bac), "--ecrire"]);
  const chemin = join(bac.racine, "data/items", `${item.id}.json`);
  const ecrit = readFileSync(chemin, "utf8");
  commiterTout(bac.racine, "promotion");
  const relance = executerOutil("promote.ts", [...chemins(bac), "--ecrire"]);
  afterAll(() => bac.detruire());

  it("écrit l'item vérifié, avec HEAD dans son historique, et imprime la commande Git sans commiter", () => {
    expect(premiere.status, premiere.erreur).toBe(0);
    const promu = JSON.parse(ecrit) as Item;
    expect(promu.statut_validation).toBe("verifie");
    expect(JSON.stringify(promu.historique)).toContain(commit);
    expect(premiere.sortie).toMatch(/Rien n'est commité/);
    expect(premiere.sortie).toMatch(/git add data\/items/);
  });

  it("une relance est sans effet sur l'item déjà publié", () => {
    expect(relance.status, relance.erreur).toBe(0);
    expect(relance.sortie).toMatch(/Déjà dans data\/, non réécrits : 1/);
    expect(relance.sortie).toMatch(/0 item\(s\) écrit\(s\)/);
    expect(readFileSync(chemin, "utf8")).toBe(ecrit);
  });
});
