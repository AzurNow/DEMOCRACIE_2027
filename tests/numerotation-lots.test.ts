/**
 * Numérotation des lots d'une composition à l'autre, et écriture tout-ou-rien.
 *
 * Avec des lots pleins seulement, recomposer le reste de la réserve est le cas normal : la
 * deuxième composition doit reprendre après le plus grand numéro existant, et une collision
 * doit être détectée avant la première écriture, jamais au milieu.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { numeroterLots } from "../validation/domaine/lot.ts";
import type { Lot } from "../validation/domaine/types.ts";
import { ecrireLot, ecrireLots, LotDejaExistant } from "../validation/io/lots-fichier.ts";

function lot(lot_id: string, extra: Partial<Lot> = {}): Lot {
  return {
    lot_id,
    nature: "reel",
    graine_maitresse: "g",
    algorithme_ordre: "ordre-annotateur-v1",
    date_creation: "2026-09-25T10:00:00+02:00",
    annotateurs: ["a1", "a2"],
    items: [],
    ...extra,
  };
}

function reannotation(lot_id: string, origine: string): Lot {
  return lot(lot_id, { nature: "reannotation", reannote: origine, date_calibration: "2026-11-24" });
}

describe("numérotation des lots", () => {
  it("une première composition commence à 001", () => {
    expect(numeroterLots([], "lot", 2)).toEqual(["lot-001", "lot-002"]);
  });

  it("une deuxième composition reprend la numérotation après lot-002", () => {
    const existants = [lot("lot-001"), lot("lot-002")];
    expect(numeroterLots(existants, "lot", 2)).toEqual(["lot-003", "lot-004"]);
  });

  it("reprend après le plus grand numéro, même s'il manque un numéro intermédiaire", () => {
    const existants = [lot("lot-001"), lot("lot-007")];
    expect(numeroterLots(existants, "lot", 1)).toEqual(["lot-008"]);
  });

  it("une réannotation lot-002-r1 ne décale pas la numérotation", () => {
    const existants = [lot("lot-001"), lot("lot-002"), reannotation("lot-002-r1", "lot-002")];
    expect(numeroterLots(existants, "lot", 1)).toEqual(["lot-003"]);
  });

  it("un préfixe différent repart à 001", () => {
    const existants = [lot("lot-001"), lot("lot-002"), lot("ent-001", { nature: "entrainement" })];
    expect(numeroterLots(existants, "ent", 1)).toEqual(["ent-002"]);
    expect(numeroterLots(existants, "autre", 1)).toEqual(["autre-001"]);
  });

  it("ne confond pas un préfixe qui en prolonge un autre", () => {
    const existants = [lot("lot-x-009"), lot("lotissement-004")];
    expect(numeroterLots(existants, "lot", 1)).toEqual(["lot-001"]);
  });

  it("aucun lot demandé : aucun identifiant", () => {
    expect(numeroterLots([lot("lot-001")], "lot", 0)).toEqual([]);
  });
});

describe("écriture d'une composition : tout ou rien", () => {
  let repertoire = "";
  afterEach(() => {
    if (repertoire.length > 0) rmSync(repertoire, { recursive: true, force: true });
  });

  it("écrit tous les manifestes quand aucun n'existe", () => {
    repertoire = mkdtempSync(join(tmpdir(), "banc-lots-"));
    ecrireLots(repertoire, [lot("lot-001"), lot("lot-002")]);
    expect(readdirSync(repertoire).sort()).toEqual(["lot-001.json", "lot-002.json"]);
  });

  it("une collision détectée n'écrit aucun manifeste", () => {
    repertoire = mkdtempSync(join(tmpdir(), "banc-lots-"));
    ecrireLot(repertoire, lot("lot-002"));
    const avant = readFileSync(join(repertoire, "lot-002.json"), "utf8");

    // La collision est en second : une écriture au fil de l'eau aurait déjà écrit lot-001.
    expect(() => ecrireLots(repertoire, [lot("lot-001"), lot("lot-002", { graine_maitresse: "autre" })])).toThrow(
      LotDejaExistant,
    );
    expect(existsSync(join(repertoire, "lot-001.json"))).toBe(false);
    expect(readdirSync(repertoire)).toEqual(["lot-002.json"]);
    expect(readFileSync(join(repertoire, "lot-002.json"), "utf8")).toBe(avant);
  });

  it("deux lots de la même composition portant le même identifiant : rien n'est écrit", () => {
    repertoire = mkdtempSync(join(tmpdir(), "banc-lots-"));
    expect(() => ecrireLots(repertoire, [lot("lot-001"), lot("lot-001")])).toThrow(
      /lot-001.*deux fois/,
    );
    expect(readdirSync(repertoire)).toEqual([]);
  });
});
