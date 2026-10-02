/**
 * Cas limite 10 du brief : une réponse s'écrit une fois (règle 7), et son empreinte se vérifie sur
 * le fichier relu.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ErreurSchema } from "../../outils/schemas/valider.ts";
import { DepotReponses, ReponseDejaEcrite } from "../../pipeline/interrogation/stockage.ts";
import type { ReponseEcrite } from "../../pipeline/interrogation/types.ts";
import { empreinteDe } from "../../validation/domaine/empreinte.ts";
import { banc, plan, requete, scenarioScripte, seule, type Banc } from "./aides.ts";

let courant: Banc | null = null;

afterEach(() => {
  courant?.nettoyer();
  courant = null;
});

async function uneReponseEcrite(): Promise<{ b: Banc; reponse: ReponseEcrite }> {
  const b = banc();
  courant = b;
  b.editeur("outil-alpha", scenarioScripte(["reponse"]));
  await b.executer(plan(requete()));
  return { b, reponse: seule(b.lues()) };
}

describe("cas 10 : immuabilité des réponses écrites", () => {
  it("réécrire une réponse existante (même identifiant) lève et laisse le fichier intact", async () => {
    const { b, reponse } = await uneReponseEcrite();
    const chemin = join(b.reponses, `${reponse.id}.json`);
    const avant = readFileSync(chemin, "utf8");
    const depot = DepotReponses.ouvrir(b.reponses);
    expect(() => depot.ecrire(reponse)).toThrow(ReponseDejaEcrite);
    expect(readFileSync(chemin, "utf8")).toBe(avant);
  });

  it("une seconde réponse pour la même requête, sous un autre identifiant, lève aussi", async () => {
    const { b, reponse } = await uneReponseEcrite();
    const depot = DepotReponses.ouvrir(b.reponses);
    expect(() => depot.ecrire({ ...reponse, id: "7ZZZZZZZZZZZZZZZZZZZZZZZZZ" })).toThrow(ReponseDejaEcrite);
    expect(b.lues()).toHaveLength(1);
  });

  it("l'ouverture exclusive refuse un fichier déjà présent, même inconnu de l'index", async () => {
    const { b, reponse } = await uneReponseEcrite();
    const vide = DepotReponses.ouvrir(join(b.racine, "autre"));
    writeFileSync(join(vide.repertoire, `${reponse.id}.json`), "occupé");
    expect(() => vide.ecrire(reponse)).toThrow(ReponseDejaEcrite);
  });

  it("brut_sha256 recalculé sur le fichier relu égale la valeur stockée", async () => {
    const { b, reponse } = await uneReponseEcrite();
    const relu = JSON.parse(readFileSync(join(b.reponses, `${reponse.id}.json`), "utf8")) as {
      brut: unknown;
      brut_sha256: string;
    };
    expect(empreinteDe(relu.brut)).toBe(relu.brut_sha256);
  });

  it("une réponse non conforme au schéma n'est pas écrite", async () => {
    const { b, reponse } = await uneReponseEcrite();
    const depot = DepotReponses.ouvrir(join(b.racine, "autre"));
    const { motif_manquante: _m, ...sansMotif } = { ...reponse, statut_reponse: "manquante", motif_manquante: "echecs" };
    expect(() => depot.ecrire(sansMotif as unknown as ReponseEcrite)).toThrow(ErreurSchema);
    expect(depot.toutes()).toHaveLength(0);
  });

  it("un fichier étranger dans reponses/ fait lever à l'ouverture, il n'est pas ignoré", async () => {
    const { b } = await uneReponseEcrite();
    writeFileSync(join(b.reponses, "note.txt"), "?");
    expect(() => DepotReponses.ouvrir(b.reponses)).toThrow(/note\.txt/);
  });
});
