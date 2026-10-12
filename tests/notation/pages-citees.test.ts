/**
 * Le texte de chaque page citée, tel que la charge du juge le transmet (D27 (E)) : page conservée ou
 * copie archivée (D21), rien pour un lien mort ou sans copie, borne déclarée et troncature signalée.
 */

import { describe, expect, it } from "vitest";
import { LONGUEUR_MAX_TEXTE_PAGE, pagesCitees, type TexteDeCopie } from "../../pipeline/notation/pages-citees.ts";
import { LienSansVerdictExistence, type ExistenceEtablie } from "../../pipeline/notation/vue-annotateur.ts";

const R = "reponse-pages";
const DATE = "2026-12-02T10:00:00+01:00";
const SHA_PAGE = "a".repeat(64);
const SHA_COPIE = "b".repeat(64);
const SHA_PDF = "c".repeat(64);
const SHA_REFUS = "d".repeat(64);
const ARCHIVE = "https://web.archive.org/web/20261101000000/https://exemple.invalid/b";

const EXISTE: ExistenceEtablie = { url_citee: "https://exemple.invalid/a", verdict_existence: "existe", date_test: DATE, code_http: 200, sha256_contenu: SHA_PAGE };
const PDF: ExistenceEtablie = { url_citee: "https://exemple.invalid/a.pdf", verdict_existence: "existe", date_test: DATE, code_http: 200, sha256_contenu: SHA_PDF };
const ARCHIVEE: ExistenceEtablie = { url_citee: "https://exemple.invalid/b", verdict_existence: "inaccessible", date_test: DATE, code_http: 503, sha256_contenu: SHA_COPIE, archive_url: ARCHIVE };
const MORT: ExistenceEtablie = { url_citee: "https://exemple.invalid/mort", verdict_existence: "mort", date_test: DATE, code_http: 404 };
const SANS_COPIE: ExistenceEtablie = { url_citee: "https://exemple.invalid/robots", verdict_existence: "non_testable", date_test: DATE, code_http: null };
const REFUSEE: ExistenceEtablie = { url_citee: "https://exemple.invalid/image", verdict_existence: "existe", date_test: DATE, code_http: 200, sha256_contenu: SHA_REFUS };

const TEXTES: ReadonlyMap<string, TexteDeCopie> = new Map<string, TexteDeCopie>([
  [SHA_PAGE, { issue: "extrait", texte: "Page HTML : le candidat propose la mesure.", texte_sha256: "1".repeat(64) }],
  [SHA_PDF, { issue: "extrait", texte: "Programme PDF\fpage deux", texte_sha256: "2".repeat(64) }],
  [SHA_COPIE, { issue: "extrait", texte: "Copie archivée de la page.", texte_sha256: "3".repeat(64) }],
  [SHA_REFUS, { issue: "refuse", motif: "type de contenu non pris en charge : image/png" }],
]);

function index(...existences: readonly ExistenceEtablie[]): ReadonlyMap<string, ExistenceEtablie> {
  return new Map(existences.map((e) => [e.url_citee, e]));
}

const lire = (sha: string): TexteDeCopie | undefined => TEXTES.get(sha);

describe("pagesCitees", () => {
  it("page existante HTML : le texte de la page conservée, entier", () => {
    expect(pagesCitees(R, [EXISTE.url_citee], index(EXISTE), lire)).toEqual([
      { url_citee: EXISTE.url_citee, texte_disponible: true, origine: "page_conservee", texte: "Page HTML : le candidat propose la mesure.", texte_sha256: "1".repeat(64), tronque: false, longueur_totale: 42 },
    ]);
  });

  it("page existante PDF : le texte extrait, séparateur de pages compris", () => {
    const [page] = pagesCitees(R, [PDF.url_citee], index(PDF), lire) ?? [];
    expect(page).toMatchObject({ texte_disponible: true, origine: "page_conservee", texte: "Programme PDF\fpage deux", tronque: false });
  });

  it("lien inaccessible avec copie archivée (D21) : le texte de la copie, origine dite", () => {
    const [page] = pagesCitees(R, [ARCHIVEE.url_citee], index(ARCHIVEE), lire) ?? [];
    expect(page).toMatchObject({ texte_disponible: true, origine: "copie_archivee", texte: "Copie archivée de la page." });
  });

  it("lien mort : pas de texte, raison lien_mort (D19)", () => {
    expect(pagesCitees(R, [MORT.url_citee], index(MORT), lire)).toEqual([{ url_citee: MORT.url_citee, texte_disponible: false, raison: "lien_mort" }]);
  });

  it("lien sans copie (non testable, aucun instantané) : pas de texte, raison sans_copie (D21)", () => {
    expect(pagesCitees(R, [SANS_COPIE.url_citee], index(SANS_COPIE), lire)).toEqual([{ url_citee: SANS_COPIE.url_citee, texte_disponible: false, raison: "sans_copie" }]);
  });

  it("copie dont l'empreinte est là sans archive_url : sans copie, comme le forçage D21 de juge.ts", () => {
    const sansArchive: ExistenceEtablie = { ...SANS_COPIE, sha256_contenu: SHA_COPIE };
    expect(pagesCitees(R, [sansArchive.url_citee], index(sansArchive), lire)).toEqual([{ url_citee: sansArchive.url_citee, texte_disponible: false, raison: "sans_copie" }]);
  });

  it("extraction refusée : pas de texte, raison extraction_refusee", () => {
    expect(pagesCitees(R, [REFUSEE.url_citee], index(REFUSEE), lire)).toEqual([{ url_citee: REFUSEE.url_citee, texte_disponible: false, raison: "extraction_refusee" }]);
  });

  it("copie dont le texte n'est pas encore extrait : null, la réponse attend (jamais un texte vide)", () => {
    expect(pagesCitees(R, [EXISTE.url_citee], index(EXISTE), () => undefined)).toBeNull();
  });

  it("lien mort sans texte connu : rien à attendre, rien n'est lu", () => {
    expect(pagesCitees(R, [MORT.url_citee], index(MORT), () => { throw new Error("aucune lecture attendue"); })).toEqual([{ url_citee: MORT.url_citee, texte_disponible: false, raison: "lien_mort" }]);
  });

  it("page plus longue que la borne : tronquée aux LONGUEUR_MAX_TEXTE_PAGE premiers points de code, signalé", () => {
    const long = `${"é".repeat(LONGUEUR_MAX_TEXTE_PAGE)}😀fin`;
    const [page] = pagesCitees(R, [EXISTE.url_citee], index(EXISTE), () => ({ issue: "extrait", texte: long, texte_sha256: "4".repeat(64) })) ?? [];
    expect(page).toMatchObject({ texte_disponible: true, tronque: true, longueur_totale: LONGUEUR_MAX_TEXTE_PAGE + 4, texte: "é".repeat(LONGUEUR_MAX_TEXTE_PAGE) });
  });

  it("page exactement à la borne : entière, non tronquée", () => {
    const juste = "x".repeat(LONGUEUR_MAX_TEXTE_PAGE);
    const [page] = pagesCitees(R, [EXISTE.url_citee], index(EXISTE), () => ({ issue: "extrait", texte: juste, texte_sha256: "5".repeat(64) })) ?? [];
    expect(page).toMatchObject({ tronque: false, longueur_totale: LONGUEUR_MAX_TEXTE_PAGE, texte: juste });
  });

  it("la troncature compte en points de code : une paire de substitution n'est jamais coupée", () => {
    const emojis = "😀".repeat(LONGUEUR_MAX_TEXTE_PAGE + 1);
    const [page] = pagesCitees(R, [EXISTE.url_citee], index(EXISTE), () => ({ issue: "extrait", texte: emojis, texte_sha256: "6".repeat(64) })) ?? [];
    expect(page).toMatchObject({ tronque: true, longueur_totale: LONGUEUR_MAX_TEXTE_PAGE + 1, texte: "😀".repeat(LONGUEUR_MAX_TEXTE_PAGE) });
  });

  it("un lien cité deux fois n'a qu'une page, dans l'ordre de première citation", () => {
    const pages = pagesCitees(R, [MORT.url_citee, EXISTE.url_citee, MORT.url_citee], index(EXISTE, MORT), lire) ?? [];
    expect(pages.map((p) => p.url_citee)).toEqual([MORT.url_citee, EXISTE.url_citee]);
  });

  it("aucun lien : aucune page", () => {
    expect(pagesCitees(R, [], new Map(), lire)).toEqual([]);
  });

  it("un lien sans verdict d'existence lève, jamais une page supposée", () => {
    expect(() => pagesCitees(R, [EXISTE.url_citee], new Map(), lire)).toThrow(LienSansVerdictExistence);
  });

  it("la borne est déclarée : 50 000 points de code (D29 (3))", () => {
    expect(LONGUEUR_MAX_TEXTE_PAGE).toBe(50_000);
  });
});
