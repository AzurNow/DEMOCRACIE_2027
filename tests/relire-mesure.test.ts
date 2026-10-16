/**
 * `pnpm mesures --relire=<mesure> [--date=AAAA-MM-JJ] [--ecrire]` (décision D53 (1) du 2026-10-16) :
 * inscrit au registre publié en ajout seul `validation/mesures/relectures.json` la relecture du
 * contenu **actuel** de la mesure en `staging/mesures/`. La commande imprime en entier ce que
 * l'auteur atteste avoir relu, ne réécrit jamais la mesure, et n'écrit jamais dans `data/`.
 *
 * Bout à bout avec le verrou de la PR A : après `--relire --ecrire`, `pnpm promote` accepte de
 * créer la mesure ; une formulation éditée ensuite à la main la fait refuser à nouveau.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { empreinteContenuMesure, relectureDe } from "../validation/domaine/relectures-mesure.ts";
import type { Mesure } from "../validation/domaine/types.ts";
import { cheminRelectures } from "../validation/io/relectures-fichier.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { commiterTout, executerOutil, initialiserDepot } from "./aides/depot.ts";
import { decision, itemP, mesure } from "./aides/fabriques.ts";

const DATE = "2026-10-16";
/** Une mesure telle que l'extraction la propose : libellé et formulation du modèle, à relire. */
const MESURE = mesure({
  id: "01JBANCESSA90000000MESVRE1",
  libelle: "Baisse de la TVA sur l'énergie",
  formulation_canonique: "ramener la TVA sur l'électricité, le gaz et les carburants à 5,5 %",
});
const ITEM = itemP({ id: "01JBANCESSA1000000000TEMX1", mesure_id: MESURE.id, mesure_version: MESURE.version });

function chemins(bac: Bac): readonly string[] {
  return [
    `--racine=${bac.racine}`,
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--data=${join(bac.racine, "data/items")}`,
  ];
}

function cheminsPromote(bac: Bac): readonly string[] {
  return [
    ...chemins(bac),
    `--arbitrage=${join(bac.racine, "validation/arbitrage")}`,
    `--data-mesures=${join(bac.racine, "data/mesures")}`,
  ];
}

function registre(bac: Bac): string {
  return cheminRelectures(join(bac.racine, "validation/mesures"));
}

/** Un dépôt où l'item de la mesure a été accepté par les deux annotateurs de lot-001 ; rien n'est relu. */
function preparer(): Bac {
  const bac = creerBac();
  bac.ecrireItem(ITEM);
  bac.ecrireMesure(MESURE);
  bac.ecrireLot(lotDe("lot-001", [ITEM]));
  for (const annotateur_id of ["a1", "a2"]) {
    bac.journal(annotateur_id).ajouter("lot-001", decision({ annotateur_id, item: ITEM, decision: "accepter" }));
  }
  initialiserDepot(bac.racine);
  return bac;
}

function relire(bac: Bac, ...extra: readonly string[]) {
  return executerOutil("mesures.ts", [...chemins(bac), `--relire=${MESURE.id}`, `--date=${DATE}`, ...extra]);
}

function avecBac(corps: (bac: Bac) => void): void {
  const bac = preparer();
  try {
    corps(bac);
  } finally {
    bac.detruire();
  }
}

describe("`pnpm mesures --relire`", () => {
  it("cas 1 : mesure introuvable en staging ⇒ erreur nommée, rien d'écrit", () => {
    avecBac((bac) => {
      const resultat = executerOutil("mesures.ts", [...chemins(bac), "--relire=01JBANCESSA90000000MESVRE9", "--ecrire"]);
      expect(resultat.status).not.toBe(0);
      expect(resultat.erreur).toMatch(/Mesure 01JBANCESSA90000000MESVRE9 introuvable/);
      expect(resultat.erreur).not.toMatch(/\n\s+at /);
      expect(existsSync(registre(bac))).toBe(false);
    });
  });

  it("cas 2 : simulation ⇒ affiche en entier libellé, thème, fictive, formulation et l'empreinte ; n'écrit rien", () => {
    avecBac((bac) => {
      const resultat = relire(bac);
      expect(resultat.status, resultat.erreur).toBe(0);
      expect(resultat.sortie).toContain(`libellé : ${MESURE.libelle}\n`);
      expect(resultat.sortie).toContain(`thème : ${MESURE.theme}\n`);
      expect(resultat.sortie).toContain("fictive : false\n");
      expect(resultat.sortie).toContain(`formulation canonique : ${MESURE.formulation_canonique}\n`);
      expect(resultat.sortie).toContain(empreinteContenuMesure(MESURE));
      expect(resultat.sortie).toMatch(/Simulation/);
      expect(existsSync(registre(bac))).toBe(false);
    });
  });

  it("cas 3 : --ecrire ⇒ une entrée relectureDe(mesure, date) ; registre absent ⇒ créé ; la mesure n'est pas réécrite", () => {
    avecBac((bac) => {
      const mesureAvant = readFileSync(join(bac.racine, "staging/mesures", `${MESURE.id}.json`), "utf8");
      const resultat = relire(bac, "--ecrire");
      expect(resultat.status, resultat.erreur).toBe(0);
      expect(JSON.parse(readFileSync(registre(bac), "utf8"))).toEqual([relectureDe(MESURE, DATE)]);
      expect(resultat.sortie).toMatch(/1 entrée\(s\)/);
      expect(readFileSync(join(bac.racine, "staging/mesures", `${MESURE.id}.json`), "utf8")).toBe(mesureAvant);
      expect(existsSync(join(bac.racine, "data"))).toBe(false);
    });
  });

  it("cas 4 : après --relire --ecrire, pnpm promote crée la mesure (verrou de la PR A)", () => {
    avecBac((bac) => {
      const refus = executerOutil("promote.ts", cheminsPromote(bac));
      expect(refus.sortie).toContain(`${MESURE.id}  sans_relecture`);

      expect(relire(bac, "--ecrire").status).toBe(0);
      commiterTout(bac.racine, "relecture");
      const promotion = executerOutil("promote.ts", [...cheminsPromote(bac), "--ecrire"]);
      expect(promotion.status, promotion.erreur).toBe(0);
      expect(promotion.sortie).toMatch(/1 mesure\(s\) créée\(s\)/);
      expect(JSON.parse(readFileSync(join(bac.racine, "data/mesures", `${MESURE.id}.json`), "utf8"))).toEqual(MESURE);
    });
  });

  it("cas 5 : formulation éditée à la main après la relecture ⇒ promote refuse à nouveau ; une nouvelle --relire débloque", () => {
    avecBac((bac) => {
      expect(relire(bac, "--ecrire").status).toBe(0);
      const editee: Mesure = { ...MESURE, formulation_canonique: "ramener la TVA sur l'électricité et le gaz à 5,5 %" };
      bac.ecrireMesure(editee);

      const refus = executerOutil("promote.ts", cheminsPromote(bac));
      expect(refus.status).not.toBe(0);
      expect(refus.sortie).toContain(`${MESURE.id}  sans_relecture`);

      const seconde = relire(bac, "--ecrire");
      expect(seconde.status, seconde.erreur).toBe(0);
      expect(seconde.sortie).toContain(`formulation canonique : ${editee.formulation_canonique}\n`);
      expect(JSON.parse(readFileSync(registre(bac), "utf8"))).toEqual([relectureDe(MESURE, DATE), relectureDe(editee, DATE)]);

      const acceptee = executerOutil("promote.ts", cheminsPromote(bac));
      expect(acceptee.status, acceptee.sortie).toBe(0);
      expect(acceptee.sortie).not.toContain("sans_relecture");
    });
  });

  it("cas 6 : contenu exact déjà relu ⇒ message explicite, aucune nouvelle entrée", () => {
    avecBac((bac) => {
      expect(relire(bac, "--ecrire").status).toBe(0);
      const avant = readFileSync(registre(bac), "utf8");
      const seconde = executerOutil("mesures.ts", [...chemins(bac), `--relire=${MESURE.id}`, "--date=2026-10-17", "--ecrire"]);
      expect(seconde.status, seconde.erreur).toBe(0);
      expect(seconde.sortie).toMatch(/déjà relu/);
      expect(readFileSync(registre(bac), "utf8")).toBe(avant);
    });
  });

  it("cas 7 : registre existant corrompu ⇒ erreur bloquante, rien d'écrit", () => {
    avecBac((bac) => {
      mkdirSync(join(bac.racine, "validation/mesures"), { recursive: true });
      writeFileSync(registre(bac), "[{ pas du json", "utf8");
      const resultat = relire(bac, "--ecrire");
      expect(resultat.status).not.toBe(0);
      expect(resultat.erreur).toMatch(/Registre des relectures de mesure illisible/);
      expect(readFileSync(registre(bac), "utf8")).toBe("[{ pas du json");
    });
  });

  it("une date mal formée est refusée, rien d'écrit", () => {
    avecBac((bac) => {
      const resultat = executerOutil("mesures.ts", [...chemins(bac), `--relire=${MESURE.id}`, "--date=16/10/2026", "--ecrire"]);
      expect(resultat.status).not.toBe(0);
      expect(resultat.erreur).toMatch(/date/);
      expect(existsSync(registre(bac))).toBe(false);
    });
  });
});
