/**
 * Protocole 0.13 (décisions de l'auteur du 2026-09-27), côté schémas :
 *
 * - n° 54, §4 « Définition d'un item » : « Chaque source déclare son format (PDF, page web, audio,
 *   vidéo), relevé par la collecte et non deviné ; une citation tirée d'un PDF porte toujours sa
 *   page. » `format` est obligatoire dans `commun#/$defs/source` ; la règle « pdf ⇒ page » vit dans
 *   `item#/$defs/etat_positionnel`, le seul endroit où une source porte une citation (assertion d'un
 *   item P, deux états d'un item O). La source de couverture d'un item A et les sources nouvelles
 *   d'une contestation ne citent rien : un PDF y reste sans page ;
 * - §4 « Grille de validation » : « L'attestation n'existe que sur un item vérifié ; elle est
 *   conservée si le panel retire ensuite l'item. » Interdite sur un item rejeté ou non évaluable,
 *   admise sur un item retiré par le panel ;
 * - `docs/CONTRATS.md` §5 : la fiche de source applique la table des tiers par type de document.
 *
 * Chaque cas invalide liste TOUTES ses erreurs ajv (l'erreur « if » d'enveloppe d'un then non
 * satisfait accompagne toujours la vraie raison, elle n'en est pas une seconde).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { construireRegistre } from "../outils/schemas/registre.ts";
import { urnSchema, type NomSchema } from "../outils/schemas/noms.ts";

type Objet = Record<string, unknown>;

const RACINE_SCHEMA = resolve(import.meta.dirname, "../schema");
const { ajv } = construireRegistre(RACINE_SCHEMA);

function lire(fichier: string): Objet {
  return JSON.parse(readFileSync(resolve(RACINE_SCHEMA, "exemples", fichier), "utf8")) as Objet;
}

function copie<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur)) as T;
}

/** Toutes les erreurs ajv, `[chemin, mot-clé]`, sans les enveloppes « if ». */
function raisons(schema: NomSchema, valeur: unknown): readonly (readonly [string, string])[] {
  const valider = ajv.getSchema(urnSchema(schema));
  if (valider === undefined) throw new Error(`schéma ${schema} absent du registre`);
  if (valider(valeur)) return [];
  if (valider.errors === null || valider.errors === undefined) throw new Error("ajv n'a rendu aucune erreur");
  return valider.errors.filter((erreur) => erreur.keyword !== "if").map((erreur) => [erreur.instancePath, erreur.keyword] as const);
}

/** Item P vérifié, source T1 `programme_pdf` paginée, format pdf. */
function itemP(): Objet {
  return lire("item/valide-01-position-t1.json");
}

/** Item O vérifié : état antérieur T1 (pdf), état postérieur T2 (vidéo) attesté. */
function itemO(): Objet {
  return lire("item/valide-02-obsolete-deux-etats.json");
}

function assertion(item: Objet): Objet {
  return item["assertion"] as Objet;
}

function etat(item: Objet, cle: "etat_anterieur" | "etat_posterieur"): Objet {
  return (item["obsolescence"] as Objet)[cle] as Objet;
}

/** Une tribune signée publiée en PDF : T1, sans la règle « programme_pdf ⇒ page » de commun. */
const TRIBUNE_PDF: Objet = {
  tier: "T1",
  url: "https://exemple-candidat.fr/tribune",
  type_document: "tribune_signee",
  format: "pdf",
  sha256: "5f0b2a8e1c7d3b9a4e6f8d0c2b4a6e8f1d3c5b7a9e0f2d4c6b8a0e2f4d6c8b0a",
  archive_url: "https://web.archive.org/web/20260901120000/https://exemple-candidat.fr/tribune",
  date_source: "2026-09-01",
  date_collecte: "2026-09-03T09:12:00+02:00",
  publication: "publique",
};

/* ------------------------------------------------------------------ n° 54 */

describe("protocole 0.13, n° 54 : format de la source", () => {
  it("les exemples de référence de ce fichier sont valides", () => {
    expect(raisons("item", itemP())).toEqual([]);
    expect(raisons("item", itemO())).toEqual([]);
  });

  it("une source sans format est invalide, et seulement pour ce champ manquant", () => {
    const item = itemP();
    delete (assertion(item)["source"] as Objet)["format"];
    expect(raisons("item", item)).toEqual([["/assertion/source", "required"]]);
  });

  it("un format hors des quatre valeurs est invalide", () => {
    const item = itemP();
    (assertion(item)["source"] as Objet)["format"] = "docx";
    expect(raisons("item", item)).toEqual([["/assertion/source/format", "enum"]]);
  });

  it("une citation tirée d'un PDF sans page est invalide", () => {
    const item = itemP();
    assertion(item)["source"] = { ...TRIBUNE_PDF };
    expect(raisons("item", item)).toEqual([["/assertion/source", "required"]]);
  });

  it("la même citation, page donnée, est valide", () => {
    const item = itemP();
    assertion(item)["source"] = { ...TRIBUNE_PDF, page: 3 };
    expect(raisons("item", item)).toEqual([]);
  });

  it("une citation tirée d'une page web sans page est valide", () => {
    const item = itemP();
    assertion(item)["source"] = { ...TRIBUNE_PDF, type_document: "site_officiel", format: "html" };
    expect(raisons("item", item)).toEqual([]);
  });

  it("l'état antérieur d'un item O tiré d'un PDF sans page est invalide", () => {
    const item = itemO();
    etat(item, "etat_anterieur")["source"] = { ...TRIBUNE_PDF };
    expect(raisons("item", item)).toEqual([["/obsolescence/etat_anterieur/source", "required"]]);
  });

  it("la source de couverture d'un item A, qui ne cite rien, peut être un PDF sans page", () => {
    const item = copie(itemP());
    delete item["assertion"];
    item["type"] = "A";
    item["absence"] = {
      source_couverture_theme: { ...TRIBUNE_PDF },
      corpus_examine: [{ url: TRIBUNE_PDF["url"], sha256: TRIBUNE_PDF["sha256"], tier: "T1" }],
      date_examen: "2026-09-04T10:00:00+02:00",
      confirmation_initiale: { lot_id: "lot-003", date: "2026-09-20T10:05:00+02:00", annotateurs: ["a1", "a2"] },
      reverifications: [],
    };
    expect(raisons("item", item)).toEqual([]);
  });

  it("exemple invalide-17 : citation d'un PDF sans page, une seule raison", () => {
    expect(raisons("item", lire("item/invalide-17-citation-pdf-sans-page.json"))).toEqual([["/assertion/source", "required"]]);
  });

  it("exemple invalide-18 : source sans format, une seule raison", () => {
    expect(raisons("item", lire("item/invalide-18-source-sans-format.json"))).toEqual([["/assertion/source", "required"]]);
  });
});

/* ------------------------------------------------- attestation d'écoute (0.13) */

describe("protocole 0.13 : l'attestation d'écoute n'existe que sur un item vérifié", () => {
  /** Item O vérifié dont l'état postérieur T2 porte l'attestation, statut remplacé. */
  function itemOAuStatut(statut: string): Objet {
    const item = itemO();
    item["statut_validation"] = statut;
    return item;
  }

  it("sur un item rejeté, elle est invalide", () => {
    expect(raisons("item", itemOAuStatut("rejete"))).toEqual([
      ["/obsolescence/etat_posterieur/source", "not"],
      ["/obsolescence/etat_posterieur/source", "not"],
    ]);
  });

  it("sur un item non évaluable, elle est invalide", () => {
    expect(raisons("item", itemOAuStatut("non_evaluable"))).toEqual([
      ["/obsolescence/etat_posterieur/source", "not"],
      ["/obsolescence/etat_posterieur/source", "not"],
    ]);
  });

  it("sur un item retiré par le panel, elle est conservée : valide", () => {
    expect(raisons("item", itemOAuStatut("retire_par_panel"))).toEqual([]);
  });

  it("un item rejeté à source T2 sans attestation reste valide", () => {
    const item = itemOAuStatut("rejete");
    const source = etat(item, "etat_posterieur")["source"] as Objet;
    delete source["transcription_verifiee_par"];
    delete source["transcription_verifiee_le"];
    expect(raisons("item", item)).toEqual([]);
  });

  it("exemple invalide-19 : rejeté avec attestation, une seule raison (la paire de champs)", () => {
    expect(raisons("item", lire("item/invalide-19-rejete-avec-attestation.json"))).toEqual([
      ["/obsolescence/etat_posterieur/source", "not"],
      ["/obsolescence/etat_posterieur/source", "not"],
    ]);
  });

  it("exemple invalide-20 : non évaluable avec attestation, une seule raison (la paire de champs)", () => {
    expect(raisons("item", lire("item/invalide-20-non-evaluable-avec-attestation.json"))).toEqual([
      ["/obsolescence/etat_posterieur/source", "not"],
      ["/obsolescence/etat_posterieur/source", "not"],
    ]);
  });

  it("exemple valide-05 : retiré par le panel, attestation conservée", () => {
    expect(raisons("item", lire("item/valide-05-retire-par-panel-attestation-conservee.json"))).toEqual([]);
  });
});

/* ---------------------------------------------- fiche de source : table des tiers */

describe("docs/CONTRATS.md §5 (0.13) : la fiche de source applique la table des tiers", () => {
  function fiche(): Objet {
    return lire("fiche-source/valide-01-programme-pdf.json");
  }

  it("la fiche de référence est valide", () => {
    expect(raisons("fiche-source", fiche())).toEqual([]);
  });

  it("un programme PDF déclaré T2 est invalide, sur le seul tier", () => {
    expect(raisons("fiche-source", { ...fiche(), tier: "T2" })).toEqual([["/tier", "const"]]);
  });

  it("un site de parti sans déclaration de tenir lieu de site de campagne, déclaré T1, est invalide", () => {
    const site = { ...lire("fiche-source/valide-02-site-parti-redirige.json"), site_parti_tient_lieu_de_campagne: false, tier: "T1" };
    expect(raisons("fiche-source", site)).toEqual([["/tier", "const"]]);
  });

  it("exemple invalide-03 : tier contraire au type de document, une seule raison", () => {
    expect(raisons("fiche-source", lire("fiche-source/invalide-03-tier-contraire-au-type.json"))).toEqual([["/tier", "const"]]);
  });
});
