/**
 * `outils/contacts.ts` (protocole 0.10, §4 et §10 ; lot contestation-notification, V5) : chaque
 * candidat du périmètre déclare `contact_notification`, objet avec preuve archivée ou `null`
 * explicite ; une clé absente, une adresse ou une preuve mal formée arrêtent la commande.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { contactsDuPerimetre, PerimetreContactsInvalide } from "../outils/contacts.ts";
import { executerOutil } from "./aides/depot.ts";

const PREUVE = {
  url: "https://demo.invalid/mentions-legales",
  date: "2026-09-01",
  sha256: "a".repeat(64),
  archive_url: "https://archive.invalid/mentions-legales",
};

function candidat(id: string, contact: unknown, statut = "actif"): Record<string, unknown> {
  return { candidat_id: id, statut_au_gel: statut, contact_notification: contact };
}

describe("contactsDuPerimetre", () => {
  it("rend chaque candidat avec son adresse ou null explicite, candidat retiré compris", () => {
    const contacts = contactsDuPerimetre({
      candidats: [candidat("demo-a", { adresse: "contact@demo-a.invalid", preuve: PREUVE }), candidat("demo-b", null), candidat("demo-c", { adresse: "presse@demo-c.invalid", preuve: PREUVE }, "retire")],
    });
    expect(contacts.map((contact) => [contact.candidat_id, contact.contact_notification?.adresse ?? null])).toEqual([
      ["demo-a", "contact@demo-a.invalid"],
      ["demo-b", null],
      ["demo-c", "presse@demo-c.invalid"],
    ]);
  });

  it("un périmètre vide donne une liste vide", () => {
    expect(contactsDuPerimetre({ candidats: [] })).toEqual([]);
  });

  it("une clé contact_notification absente est refusée : l'absence se déclare par null", () => {
    expect(() => contactsDuPerimetre({ candidats: [{ candidat_id: "demo-a", statut_au_gel: "actif" }] })).toThrow(/null explicite/);
  });

  it("une adresse mal formée ou une preuve incomplète est refusée, chaque défaut nommé", () => {
    const erreur = (() => {
      try {
        contactsDuPerimetre({ candidats: [candidat("demo-a", { adresse: "pas une adresse", preuve: { ...PREUVE, sha256: "court" } })] });
      } catch (e) {
        return e as Error;
      }
      throw new Error("aucun refus");
    })();
    expect(erreur).toBeInstanceOf(PerimetreContactsInvalide);
    expect(erreur.message).toMatch(/adresse absente ou mal formée/);
    expect(erreur.message).toMatch(/preuve\.sha256/);
  });
});

describe("la commande", () => {
  const repertoire = mkdtempSync(join(tmpdir(), "banc-contacts-"));
  const perimetre = join(repertoire, "perimetre.yaml");
  writeFileSync(
    perimetre,
    [
      "candidats:",
      "  - candidat_id: demo-a",
      "    statut_au_gel: actif",
      "    contact_notification:",
      "      adresse: contact@demo-a.invalid",
      "      preuve:",
      `        url: ${PREUVE.url}`,
      `        date: "${PREUVE.date}"`,
      `        sha256: ${PREUVE.sha256}`,
      `        archive_url: ${PREUVE.archive_url}`,
      "  - candidat_id: demo-b",
      "    statut_au_gel: actif",
      "    contact_notification: null",
      "",
    ].join("\n"),
    "utf8",
  );
  const resultat = executerOutil("contacts.ts", [`--perimetre=${perimetre}`]);
  const reel = executerOutil("contacts.ts", []);
  afterAll(() => rmSync(repertoire, { recursive: true, force: true }));

  it("écrit les contacts en JSON sur la sortie standard", () => {
    expect(resultat.status, resultat.erreur).toBe(0);
    const sortie = JSON.parse(resultat.sortie) as { candidats: { candidat_id: string }[] };
    expect(sortie.candidats.map((contact) => contact.candidat_id)).toEqual(["demo-a", "demo-b"]);
  });

  it("lit config/perimetre.yaml du dépôt tel qu'il est (aucun candidat aujourd'hui)", () => {
    expect(reel.status, reel.erreur).toBe(0);
    expect((JSON.parse(reel.sortie) as { candidats: unknown[] }).candidats).toEqual([]);
  });
});
