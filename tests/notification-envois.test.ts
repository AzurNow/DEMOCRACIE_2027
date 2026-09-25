/**
 * Le journal des envois écrit par `pnpm notifier` (Python) est conforme à
 * `schema/envoi-notification.schema.json` (lot contestation-notification, V5). Python ne valide pas
 * contre JSON Schema : le fichier doré que pytest reproduit à l'octet
 * (`tests/notification/test_notifier.py::test_journal_dore`) est validé ici, ligne par ligne, sur
 * le modèle des fichiers dorés de la collecte.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { valider } from "../outils/schemas/valider.ts";

const DORE = join(import.meta.dirname, "notification", "dore", "envois.jsonl");
const lignes = readFileSync(DORE, "utf8").trimEnd().split("\n").map((ligne) => JSON.parse(ligne) as Record<string, unknown>);

describe("journal doré des envois", () => {
  it("couvre échec, envoi réussi, relance et campagne sans destinataire", () => {
    expect(new Set(lignes.map((ligne) => ligne["etat"]))).toEqual(new Set(["en_cours", "echec", "envoyee", "sans_destinataire_connu"]));
  });

  it.each(lignes.map((ligne, rang) => [rang + 1, ligne] as const))("ligne %i conforme au schéma", (rang, ligne) => {
    expect(() => valider("envoi-notification", ligne, `envois.jsonl, ligne ${rang}`)).not.toThrow();
  });
});
