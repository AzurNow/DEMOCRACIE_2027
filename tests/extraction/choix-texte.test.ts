/**
 * Choix du texte canonique lu par l'extraction (décision D52 (4) ; docs/DETTE.md, 2026-09-23,
 * point 1) : la fiche produite par la version d'extracteur épinglée par le code, passée en entrée.
 * Aucune fiche de cette version, ou plus d'une : la source est refusée, sans repli.
 * Cas limite 15 du brief.
 */

import { describe, expect, it } from "vitest";
import {
  AucunTexteEpingle,
  choisirFiche,
  FicheDUneAutreSource,
  PlusieursTextesEpingles,
} from "../../pipeline/extraction/choix-texte.ts";
import { ErreurSchema } from "../../outils/schemas/valider.ts";
import { fiche, pagesDe, PYMUPDF, SHA_SOURCE } from "./aides.ts";

const TEXTE = "Première page.\fSeconde page.";
const PAGES = pagesDe(["Première page.", "Seconde page."]);
const EPINGLEE = fiche(TEXTE, PYMUPDF, { pages: PAGES });
const AUTRE_VERSION = fiche("Première page.\fSeconde  page.", { ...PYMUPDF, version: "1.24.0" }, { pages: PAGES });

describe("choisirFiche", () => {
  it("rend la seule fiche de la version épinglée, parmi d'autres versions", () => {
    expect(choisirFiche([AUTRE_VERSION, EPINGLEE], PYMUPDF, SHA_SOURCE)).toEqual(EPINGLEE);
  });

  it("cas 15 : aucune fiche ⇒ AucunTexteEpingle", () => {
    expect(() => choisirFiche([], PYMUPDF, SHA_SOURCE)).toThrow(AucunTexteEpingle);
  });

  it("cas 15 : une fiche d'une autre version seulement ⇒ AucunTexteEpingle, qui nomme la version trouvée", () => {
    expect(() => choisirFiche([AUTRE_VERSION], PYMUPDF, SHA_SOURCE)).toThrow(AucunTexteEpingle);
    expect(() => choisirFiche([AUTRE_VERSION], PYMUPDF, SHA_SOURCE)).toThrow(/1\.24\.0/);
  });

  it("cas 15 : deux fiches de la version épinglée ⇒ PlusieursTextesEpingles, jamais la première", () => {
    const seconde = fiche("Première page.\fSeconde page !", PYMUPDF, { pages: PAGES });
    expect(() => choisirFiche([EPINGLEE, seconde], PYMUPDF, SHA_SOURCE)).toThrow(PlusieursTextesEpingles);
  });

  it("des options différentes font une autre version : l'extracteur est comparé en entier", () => {
    const autresOptions = { ...PYMUPDF, options: { ...PYMUPDF.options, drapeaux: 0 } };
    expect(() => choisirFiche([EPINGLEE], autresOptions, SHA_SOURCE)).toThrow(AucunTexteEpingle);
  });

  it("une fiche d'un autre document ⇒ FicheDUneAutreSource", () => {
    const etrangere = { ...EPINGLEE, sha256_source: "b".repeat(64) };
    expect(() => choisirFiche([etrangere], PYMUPDF, SHA_SOURCE)).toThrow(FicheDUneAutreSource);
  });

  it("une fiche non conforme à extraction-texte.schema.json ⇒ ErreurSchema (frontière d'entrée)", () => {
    const sansPages = { ...EPINGLEE };
    delete sansPages["pages"];
    expect(() => choisirFiche([sansPages], PYMUPDF, SHA_SOURCE)).toThrow(ErreurSchema);
  });
});
